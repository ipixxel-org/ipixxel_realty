import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import {
  assertPlanFitsAfterRetention,
  assertPlanFitsCurrentUsage,
} from '../../common/utils/plan-quota.util';
import { applyPlanChange } from '../../common/utils/plan-change.util';
import { whatStaysFor } from '../../common/utils/retention.util';
import { settleCoupon } from '../billing/coupon-settlement';
import { applyOrgSubscriptionLifecycle } from '../../common/utils/subscription-lifecycle.util';
import { orgBillingRecipientsWhere } from '../../common/utils/notification-recipients.util';
import { CreatePackageChangeRequestDto } from './dto/create-package-change-request.dto';
import {
  REJECTION_REASON_MAX,
  REJECTION_REASON_MIN,
  RejectPackageChangeRequestDto,
} from './dto/reject-package-change-request.dto';
import { ListPackageChangeRequestsDto } from './dto/list-package-change-requests.dto';

/**
 * The one "already waiting" message (API and UI say the same):
 * "You already have a pending request (Starter → Pro, sent 22 Oct). Wait for
 * approval or withdraw it."
 */
export function pendingRequestMessage(
  fromPlan: string | null | undefined,
  toPlan: string,
  sentAt: Date | null | undefined,
): string {
  const sent = sentAt
    ? `, sent ${sentAt.toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        timeZone: 'UTC',
      })}`
    : '';
  const change = fromPlan ? `${fromPlan} → ${toPlan}` : toPlan;
  return `You already have a pending request (${change}${sent}). Wait for approval or withdraw it.`;
}

/** Trimmed reason, or 400 when it is missing, too short or too long. */
export function rejectionReasonOrThrow(raw: string | null | undefined): string {
  const reason = (raw ?? '').trim();
  if (reason.length < REJECTION_REASON_MIN) {
    throw new BadRequestException(
      `Enter a reason for rejection (at least ${REJECTION_REASON_MIN} characters).`,
    );
  }
  if (reason.length > REJECTION_REASON_MAX) {
    throw new BadRequestException(
      `Keep the reason under ${REJECTION_REASON_MAX} characters.`,
    );
  }
  return reason;
}

@Injectable()
export class PackageChangeRequestsService {
  constructor(private readonly prisma: PrismaService) {}

  async getOrgRequest(orgId: string) {
    await applyOrgSubscriptionLifecycle(this.prisma, orgId);

    const [pendingRequest, history] = await Promise.all([
      this.prisma.packageChangeRequest.findFirst({
        where: { orgId, status: 'pending' },
        include: {
          currentPlan: true,
          targetPlan: true,
          requestedBy: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
      }),
      this.prisma.packageChangeRequest.findMany({
        where: { orgId, status: { not: 'pending' } },
        orderBy: { updatedAt: 'desc' },
        take: 10,
        include: {
          currentPlan: { select: { id: true, name: true } },
          targetPlan: { select: { id: true, name: true } },
          requestedBy: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
          reviewedBy: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
      }),
    ]);

    return {
      pendingRequest,
      history,
    };
  }

  /**
   * `usage: 'after_retention'` (billing v2 manual mode, once the org has
   * chosen what stays): users / projects / published pages over the target's
   * limits are paused on approval instead of refusing the request.
   */
  async submitOrgRequest(
    orgId: string,
    userId: string,
    dto: CreatePackageChangeRequestDto,
    opts: { usage?: 'strict' | 'after_retention' } = {},
  ) {
    await applyOrgSubscriptionLifecycle(this.prisma, orgId);

    const sub = await this.prisma.subscription.findFirst({
      where: { orgId, status: { not: 'cancelled' } },
      include: { plan: true },
    });
    if (!sub) {
      throw new BadRequestException(
        'Your organisation must have a subscription row before requesting a package change.',
      );
    }

    const existingPending = await this.prisma.packageChangeRequest.findFirst({
      where: { orgId, status: 'pending' },
      include: {
        currentPlan: { select: { name: true } },
        targetPlan: { select: { name: true } },
      },
    });
    if (existingPending) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        code: 'request_pending',
        message: pendingRequestMessage(
          existingPending.currentPlan?.name,
          existingPending.targetPlan.name,
          existingPending.createdAt,
        ),
      });
    }

    const targetPlan = await this.prisma.plan.findUnique({
      where: { id: dto.targetPlanId },
    });
    if (!targetPlan || !targetPlan.isActive) {
      throw new NotFoundException('Selected plan not found or inactive');
    }

    const requestedCycle = dto.billingCycle ?? sub.billingCycle;
    if (sub.planId === targetPlan.id && sub.billingCycle === requestedCycle) {
      throw new BadRequestException(
        'Your organisation is already on this plan and billing cycle.',
      );
    }

    if (opts.usage === 'after_retention') {
      await assertPlanFitsAfterRetention(this.prisma, orgId, targetPlan);
    } else {
      await assertPlanFitsCurrentUsage(this.prisma, orgId, targetPlan);
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const req = await tx.packageChangeRequest.create({
        data: {
          orgId,
          requestedById: userId,
          currentPlanId: sub.planId,
          targetPlanId: targetPlan.id,
          billingCycle: requestedCycle,
          status: 'pending',
        },
        include: {
          currentPlan: true,
          targetPlan: true,
          requestedBy: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
      });

      await tx.auditLog.create({
        data: {
          orgId,
          actorId: userId,
          action: 'package_change_request_submitted',
          entity: 'PackageChangeRequest',
          entityId: req.id,
          metadata: {
            currentPlanId: sub.planId,
            targetPlanId: targetPlan.id,
            targetPlanName: targetPlan.name,
            billingCycle: requestedCycle,
          },
        },
      });

      await tx.notification.create({
        data: {
          orgId,
          type: 'package_change_request',
          title: 'Package Change Requested',
          body: `An organisation has requested to change plan to "${targetPlan.name}".`,
          entity: 'PackageChangeRequest',
          entityId: req.id,
        },
      });

      return req;
    });

    return {
      success: true,
      message: 'Package change request submitted successfully and is pending Super Admin approval.',
      request: created,
    };
  }

  async cancelOrgRequest(orgId: string, requestId: string, userId: string) {
    const request = await this.prisma.packageChangeRequest.findFirst({
      where: { id: requestId, orgId },
    });
    if (!request) {
      throw new NotFoundException('Package change request not found');
    }
    if (request.status !== 'pending') {
      throw new BadRequestException('Only pending package change requests can be cancelled');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const req = await tx.packageChangeRequest.update({
        where: { id: requestId },
        data: { status: 'cancelled' },
      });
      // Billing v2: the manual-mode checkout behind it, if any.
      await tx.billingCheckout.updateMany({
        where: { packageChangeRequestId: requestId, status: 'pending' },
        data: { status: 'cancelled' },
      });

      await tx.auditLog.create({
        data: {
          orgId,
          actorId: userId,
          action: 'package_change_request_cancelled',
          entity: 'PackageChangeRequest',
          entityId: requestId,
          metadata: {},
        },
      });

      return req;
    });

    return {
      success: true,
      message: 'Package change request cancelled.',
      request: updated,
    };
  }

  async adminListRequests(query: ListPackageChangeRequestsDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const where: Prisma.PackageChangeRequestWhereInput = {};
    if (query.status) {
      where.status = query.status;
    }
    if (query.orgId) {
      where.orgId = query.orgId;
    }
    if (query.search?.trim()) {
      const term = query.search.trim();
      where.OR = [
        { organisation: { name: { contains: term, mode: 'insensitive' } } },
        { requestedBy: { email: { contains: term, mode: 'insensitive' } } },
        { requestedBy: { firstName: { contains: term, mode: 'insensitive' } } },
        { requestedBy: { lastName: { contains: term, mode: 'insensitive' } } },
      ];
    }

    const [rows, total] = await Promise.all([
      this.prisma.packageChangeRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          organisation: {
            select: { id: true, name: true, slug: true, city: true },
          },
          requestedBy: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
          currentPlan: {
            select: {
              id: true,
              name: true,
              limits: true,
              capabilities: true,
              priceMonthly: true,
              priceYearly: true,
              badge: true,
            },
          },
          targetPlan: {
            select: {
              id: true,
              name: true,
              limits: true,
              capabilities: true,
              priceMonthly: true,
              priceYearly: true,
              badge: true,
            },
          },
          reviewedBy: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
          // Billing v2: set when the request came from a manual-mode checkout.
          billingCheckout: {
            select: {
              id: true,
              kind: true,
              taxablePaise: true,
              cgstPaise: true,
              sgstPaise: true,
              igstPaise: true,
              totalPaise: true,
              buyerLegalName: true,
              buyerGstin: true,
              buyerState: true,
            },
          },
        },
      }),
      this.prisma.packageChangeRequest.count({ where }),
    ]);

    return { data: rows, total, page, limit };
  }

  async adminApproveRequest(requestId: string, adminUserId: string) {
    const request = await this.prisma.packageChangeRequest.findUnique({
      where: { id: requestId },
      include: {
        targetPlan: true,
        organisation: { select: { id: true, name: true } },
      },
    });
    if (!request) {
      throw new NotFoundException('Package change request not found');
    }
    if (request.status !== 'pending') {
      throw new BadRequestException('Request is no longer pending approval');
    }

    const targetPlan = request.targetPlan;

    // Billing v2: a request raised by a manual-mode checkout keeps that
    // checkout's period rule (an upgrade keeps renewsAt); older requests start
    // a new cycle now, exactly as before.
    const checkout = await this.prisma.billingCheckout.findUnique({
      where: { packageChangeRequestId: requestId },
      select: {
        id: true,
        kind: true,
        organisationId: true,
        toPlanId: true,
        couponId: true,
        couponDiscountPaise: true,
      },
    });
    if (checkout) {
      // Billing v2: users / projects / published pages over the target's
      // limits are paused by applyPlanChange → applyRetention, using the org's
      // saved "choose what stays" (or the default picks) — like a scheduled
      // downgrade. Only what can't be paused blocks the approval.
      await assertPlanFitsAfterRetention(
        this.prisma,
        request.orgId,
        targetPlan,
      );
    } else {
      await assertPlanFitsCurrentUsage(this.prisma, request.orgId, targetPlan);
    }

    // Billing v2: record what was actually kept (worked out before pausing,
    // with the same picks applyRetention uses) on the request.
    const whatStays = checkout
      ? await whatStaysFor(this.prisma, request.orgId, targetPlan, true)
      : null;

    const result = await this.prisma.$transaction(async (tx) => {
      if (whatStays) {
        await tx.packageChangeRequest.update({
          where: { id: requestId },
          data: { whatStays: whatStays as unknown as Prisma.InputJsonValue },
        });
      }
      const { subscription } = await applyPlanChange(tx, {
        organisationId: request.orgId,
        toPlanId: targetPlan.id,
        toInterval: request.billingCycle,
        kind: checkout?.kind ?? 'new',
        source: 'super_admin',
        actorId: adminUserId,
        checkoutId: checkout?.id ?? null,
        requestId,
        requestedById: request.requestedById,
      });
      if (checkout) {
        // Billing v2: record its coupon and keep the renewal coupon in step.
        await settleCoupon(tx, checkout);
        await tx.billingCheckout.update({
          where: { id: checkout.id },
          data: { status: 'approved', fulfilledAt: new Date() },
        });
      } else {
        // An older request: no coupon, and a plan change drops a renewal coupon.
        await tx.subscription.updateMany({
          where: { orgId: request.orgId, status: { not: 'cancelled' } },
          data: { couponId: null, couponRenewalsLeft: null },
        });
      }
      const approvedRequest = await tx.packageChangeRequest.findUniqueOrThrow({
        where: { id: requestId },
      });
      return { approvedRequest, updatedSub: subscription };
    });

    return {
      success: true,
      message: `Package change request approved. Organisation "${request.organisation.name}" is now on the ${targetPlan.name} plan.`,
      ...result,
    };
  }

  async adminRejectRequest(requestId: string, adminUserId: string, dto: RejectPackageChangeRequestDto) {
    const request = await this.prisma.packageChangeRequest.findUnique({
      where: { id: requestId },
      include: {
        targetPlan: { select: { name: true } },
        organisation: { select: { id: true, name: true } },
      },
    });
    if (!request) {
      throw new NotFoundException('Package change request not found');
    }
    if (request.status !== 'pending') {
      throw new BadRequestException('Request is no longer pending approval');
    }

    // Required: the organisation sees it on its Billing page and in the
    // rejection notification.
    const rejectionReason = rejectionReasonOrThrow(dto?.rejectionReason);

    const rejectedRequest = await this.prisma.$transaction(async (tx) => {
      // Conditional, so a concurrent approve/reject can't both succeed.
      const { count } = await tx.packageChangeRequest.updateMany({
        where: { id: requestId, status: 'pending' },
        data: {
          status: 'rejected',
          rejectionReason,
          reviewedAt: new Date(),
          reviewedById: adminUserId,
        },
      });
      if (count === 0) {
        throw new ConflictException('Request is no longer pending approval');
      }
      const req = await tx.packageChangeRequest.findUniqueOrThrow({
        where: { id: requestId },
      });
      // Billing v2: close the manual-mode checkout behind it, if any.
      await tx.billingCheckout.updateMany({
        where: { packageChangeRequestId: requestId, status: 'pending' },
        data: { status: 'rejected', reviewReason: rejectionReason },
      });

      await tx.auditLog.create({
        data: {
          orgId: request.orgId,
          actorId: adminUserId,
          action: 'package_change_request_rejected',
          entity: 'PackageChangeRequest',
          entityId: requestId,
          metadata: {
            rejectionReason,
            targetPlanName: request.targetPlan.name,
          },
        },
      });

      // Org Admins + the member who raised the request — not every member.
      const orgUsers = await tx.user.findMany({
        where: orgBillingRecipientsWhere(request.orgId, request.requestedById),
        select: { id: true },
      });

      if (orgUsers.length > 0) {
        await tx.notification.createMany({
          data: orgUsers.map((u) => ({
            orgId: request.orgId,
            recipientId: u.id,
            type: 'package_change_rejected',
            title: 'Package Change Request Rejected',
            body: `Your request to change package to "${request.targetPlan.name}" was rejected by Super Admin. Reason: ${rejectionReason}`,
            entity: 'PackageChangeRequest',
            entityId: requestId,
          })),
        });
      }

      return req;
    });

    return {
      success: true,
      message: `Package change request rejected for "${request.organisation.name}".`,
      request: rejectedRequest,
    };
  }
}
