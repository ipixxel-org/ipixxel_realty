import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { assertPlanFitsCurrentUsage } from '../../common/utils/plan-quota.util';
import { applyOrgSubscriptionLifecycle } from '../../common/utils/subscription-lifecycle.util';
import { orgBillingRecipientsWhere } from '../../common/utils/notification-recipients.util';
import { CreatePackageChangeRequestDto } from './dto/create-package-change-request.dto';
import { RejectPackageChangeRequestDto } from './dto/reject-package-change-request.dto';
import { ListPackageChangeRequestsDto } from './dto/list-package-change-requests.dto';

const DAY_MS = 24 * 60 * 60 * 1000;

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

  async submitOrgRequest(orgId: string, userId: string, dto: CreatePackageChangeRequestDto) {
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
      include: { targetPlan: { select: { name: true } } },
    });
    if (existingPending) {
      throw new BadRequestException(
        `Your organisation already has a pending package change request for the "${existingPending.targetPlan.name}" plan. Please wait for Super Admin approval or cancel the existing request before submitting a new one.`,
      );
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

    await assertPlanFitsCurrentUsage(this.prisma, orgId, targetPlan);

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
    await assertPlanFitsCurrentUsage(this.prisma, request.orgId, targetPlan);

    const isYearly = request.billingCycle === 'yearly';
    const amount = isYearly ? targetPlan.priceYearly : targetPlan.priceMonthly;
    const mrr = isYearly ? Math.round(amount / 12) : amount;
    const renewsAt = isYearly
      ? new Date(Date.now() + 365 * DAY_MS)
      : new Date(Date.now() + 30 * DAY_MS);

    const activeSub = await this.prisma.subscription.findFirst({
      where: { orgId: request.orgId, status: { not: 'cancelled' } },
    });

    const result = await this.prisma.$transaction(async (tx) => {
      const approvedRequest = await tx.packageChangeRequest.update({
        where: { id: requestId },
        data: {
          status: 'approved',
          reviewedAt: new Date(),
          reviewedById: adminUserId,
        },
      });

      const updatedSub = activeSub
        ? await tx.subscription.update({
            where: { id: activeSub.id },
            data: {
              planId: targetPlan.id,
              billingCycle: request.billingCycle,
              status: 'active',
              amount,
              mrr,
              renewsAt,
              graceEndsAt: null,
              cancelledAt: null,
            },
          })
        : await tx.subscription.create({
            data: {
              orgId: request.orgId,
              planId: targetPlan.id,
              billingCycle: request.billingCycle,
              status: 'active',
              amount,
              mrr,
              currency: 'INR',
              renewsAt,
            },
          });

      await tx.auditLog.create({
        data: {
          orgId: request.orgId,
          actorId: adminUserId,
          action: 'package_change_request_approved',
          entity: 'PackageChangeRequest',
          entityId: requestId,
          metadata: {
            planId: targetPlan.id,
            planName: targetPlan.name,
            billingCycle: request.billingCycle,
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
            type: 'package_change_approved',
            title: 'Package Change Approved',
            body: `Your request to change package to "${targetPlan.name}" has been approved by Super Admin. Your new plan is now active.`,
            entity: 'Subscription',
            entityId: updatedSub.id,
          })),
        });
      }

      return { approvedRequest, updatedSub };
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

    const rejectionReason = dto.rejectionReason?.trim() || undefined;

    const rejectedRequest = await this.prisma.$transaction(async (tx) => {
      const req = await tx.packageChangeRequest.update({
        where: { id: requestId },
        data: {
          status: 'rejected',
          rejectionReason,
          reviewedAt: new Date(),
          reviewedById: adminUserId,
        },
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
            body: `Your request to change package to "${request.targetPlan.name}" was rejected by Super Admin.${
              rejectionReason ? ` Reason: ${rejectionReason}` : ''
            }`,
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
