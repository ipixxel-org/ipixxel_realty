import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type OfflinePayment } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import {
  assertPlanFitsAfterRetention,
  assertPlanFitsCurrentUsage,
} from '../../common/utils/plan-quota.util';
import { applyPlanChange } from '../../common/utils/plan-change.util';
import { effectivePlan } from '../../common/utils/plan-version.util';
import { whatStaysFor } from '../../common/utils/retention.util';
import {
  isAppliedStatus,
  whatStaysPlace,
  type WhatStaysPlace,
} from '../../common/utils/what-stays-rows.util';
import {
  expireStaleCheckouts,
  invoicesByCheckout,
  ONLINE_CHECKOUT_SELECT,
  onlinePaymentView,
} from '../billing/online-rows';
import { settleCoupon } from '../billing/coupon-settlement';
import { findCouponFor } from '../billing/coupon-lookup';
import { normaliseCouponCode } from '../billing/coupon-rules';
import {
  amountsOf,
  isIntraState,
  requestQuoteView,
  requoteWithCoupon,
  type CheckoutAmounts,
} from '../billing/request-coupon';
import {
  issueCheckoutInvoice,
  issueOfflineInvoice,
  type InvoiceParty,
} from '../billing/invoice.util';
import { isFreePlan } from '../billing/plan-modules';
import { billingNow } from '../../common/utils/billing-clock.util';
import { applyOrgSubscriptionLifecycle } from '../../common/utils/subscription-lifecycle.util';
import { scheduledChangeBlock } from '../../common/utils/scheduled-change.util';
import { orgBillingRecipientsWhere } from '../../common/utils/notification-recipients.util';
import { CreatePackageChangeRequestDto } from './dto/create-package-change-request.dto';
import {
  REJECTION_REASON_MAX,
  REJECTION_REASON_MIN,
  RejectPackageChangeRequestDto,
} from './dto/reject-package-change-request.dto';
import { ListPackageChangeRequestsDto } from './dto/list-package-change-requests.dto';
import type { MarkRequestPaidDto } from './dto/mark-request-paid.dto';

/** A 400 the UI can branch on (same shape as billing's billingError). */
function requestError(code: string, message: string) {
  return new BadRequestException({
    statusCode: 400,
    error: 'Bad Request',
    code,
    message,
  });
}

/** Offline payment statuses for a payment marked against a request. */
export const REQUEST_PAYMENT_STATUS = {
  /** Marked paid; the request is still pending. */
  awaiting: 'awaiting_approval',
  /** The request was rejected after being marked paid: refund outside the app. */
  refundDue: 'refund_due',
} as const;

/**
 * How a request reads: "Renewal of Pro" (same plan, a renewal) or "Change to
 * Starter", and whether it was sent while the renewal was overdue.
 */
export function requestLabel(
  checkout: {
    kind: string;
    fromPlanId: string | null;
    toPlanId: string;
    overdue?: boolean | null;
  } | null,
  targetName: string,
): { label: string; overdue: boolean } {
  const renewal =
    checkout?.kind === 'renewal' && checkout.fromPlanId === checkout.toPlanId;
  return {
    label: renewal ? `Renewal of ${targetName}` : `Change to ${targetName}`,
    overdue: !!checkout?.overdue,
  };
}

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

  /**
   * Set by the billing module (BillingInvoiceMailer): emails an invoice issued
   * on approval. Not awaited — the approval doesn't wait for SMTP.
   */
  invoiceIssued?: (invoiceId: string) => Promise<unknown>;

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
        // Legacy history: approval requests only (not scheduled changes).
        where: {
          orgId,
          status: { not: 'pending' },
          kind: { not: 'scheduled_change' },
        },
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
    opts: {
      usage?: 'strict' | 'after_retention';
      /** A renewal (or overdue change) request may be for the current plan. */
      renewal?: boolean;
    } = {},
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
    // A change to Basic / a smaller plan is scheduled: undo it ("Keep <plan>")
    // first. A renewal (at the scheduled plan's price) is still allowed.
    const scheduled = opts.renewal
      ? null
      : await scheduledChangeBlock(this.prisma, sub);
    if (scheduled) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        code: 'change_scheduled',
        message: scheduled,
      });
    }

    const targetPlan = await this.prisma.plan.findUnique({
      where: { id: dto.targetPlanId },
    });
    if (!targetPlan || !targetPlan.isActive) {
      throw new NotFoundException('Selected plan not found or inactive');
    }

    const requestedCycle = dto.billingCycle ?? sub.billingCycle;
    const samePlan = sub.planId === targetPlan.id;
    if (samePlan && sub.billingCycle === requestedCycle && !opts.renewal) {
      throw new BadRequestException(
        'Your organisation is already on this plan and billing cycle.',
      );
    }

    if (opts.renewal && samePlan) {
      // Renewing what the org already has: nothing to check.
    } else if (opts.usage === 'after_retention') {
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
    const paid = await this.prisma.offlinePayment.findUnique({
      where: { packageChangeRequestId: requestId },
      select: { id: true },
    });
    if (paid) {
      throw requestError(
        'request_paid',
        "We've already received the payment for this request, so it can't be withdrawn here. Contact us to withdraw it.",
      );
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
    // Unpaid online orders past their 30 minutes read as expired.
    await expireStaleCheckouts(this.prisma, query.orgId);

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
          offlinePayment: true,
          billingCheckout: {
            select: {
              id: true,
              kind: true,
              fromPlanId: true,
              toPlanId: true,
              overdue: true,
              taxablePaise: true,
              cgstPaise: true,
              sgstPaise: true,
              igstPaise: true,
              totalPaise: true,
              buyerLegalName: true,
              buyerGstin: true,
              buyerState: true,
              couponId: true,
              couponDiscountPaise: true,
              quoteBeforeCoupon: true,
              coupon: { select: { code: true } },
              ...ONLINE_CHECKOUT_SELECT,
            },
          },
        },
      }),
      this.prisma.packageChangeRequest.count({ where }),
    ]);
    const invoices = await invoicesByCheckout(
      this.prisma,
      rows
        .filter((r) => r.kind === 'online_payment')
        .map((r) => r.billingCheckout?.id),
    );
    // Super Admin "Choose what stays": editable only on each org's latest row
    // (open, or applied with the org on its plan) — the same decision as the
    // org page's button (whatStaysPlace), so only one of them shows. Every
    // other row with a record gets "View what stays" (history). The latest
    // applied row is the current plan's place even without a copy yet.
    const placeByOrg = new Map<string, WhatStaysPlace>();
    for (const orgId of new Set(rows.map((r) => r.orgId))) {
      placeByOrg.set(orgId, await whatStaysPlace(this.prisma, orgId));
    }
    const editable = (r: (typeof rows)[number]) => {
      const place = placeByOrg.get(r.orgId);
      return (
        !!place?.latestEditable &&
        place.latestId === r.id &&
        (!!r.whatStays || isAppliedStatus(r.status))
      );
    };

    return {
      data: rows.map((r) => {
        const { offlinePayment, ...rest } = r;
        return {
          ...rest,
          whatStaysEditable: editable(r),
          // Online payments: paid / waiting / failed …, order id, invoice and
          // (Super Admin only) why it needs review.
          online: onlinePaymentView(
            r,
            r.billingCheckout,
            r.billingCheckout ? invoices.get(r.billingCheckout.id) : undefined,
            true,
          ),
          ...requestLabel(r.billingCheckout, r.targetPlan.name),
          payment: offlinePayment ? requestPaymentView(offlinePayment) : null,
          quote: r.billingCheckout ? requestQuoteView(r.billingCheckout) : null,
        };
      }),
      total,
      page,
      limit,
    };
  }

  /* ------------------------------------------------------ Mark as paid */

  /**
   * Super Admin, manual mode: record the payment received for a pending
   * request (an offline payment linked to it). The amount is always the
   * request's current total incl. GST (any amount sent is ignored). Can be
   * edited or cleared until the request is approved or rejected. Approval
   * then invoices it.
   */
  async markPaid(
    requestId: string,
    adminUserId: string,
    dto: MarkRequestPaidDto,
  ) {
    const { request, checkout } = await this.pendingWithCheckout(requestId);
    const amountPaise = checkout.totalPaise;
    if (!(amountPaise > 0)) {
      throw requestError(
        'nothing_to_pay',
        'This request comes to ₹0, so there is nothing to mark paid. Approve it directly.',
      );
    }
    const reference = (dto.reference ?? '').trim();
    if (!reference && dto.method !== 'Cash') {
      throw requestError(
        'reference_required',
        'Enter the UTR or cheque number (only cash needs none).',
      );
    }
    const receivedOn = new Date(`${dto.receivedOn}T00:00:00.000Z`);
    if (Number.isNaN(receivedOn.getTime())) {
      throw requestError(
        'date_invalid',
        'Enter the date the payment was received.',
      );
    }
    if (dto.receivedOn > billingNow().toISOString().slice(0, 10)) {
      throw requestError(
        'date_in_future',
        "The payment date can't be in the future.",
      );
    }
    const data = {
      amountPaise,
      method: dto.method,
      reference,
      receivedOn,
      note: dto.note?.trim() || null,
      recordedById: adminUserId,
    };
    const payment = await this.prisma.offlinePayment.upsert({
      where: { packageChangeRequestId: requestId },
      create: {
        ...data,
        organisationId: request.orgId,
        packageChangeRequestId: requestId,
        status: REQUEST_PAYMENT_STATUS.awaiting,
      },
      update: data,
    });
    await this.audit(
      request.orgId,
      adminUserId,
      'request_marked_paid',
      requestId,
      {
        amount: amountPaise / 100,
        method: dto.method,
        reference,
        receivedOn: dto.receivedOn,
      },
    );
    return { success: true, payment: requestPaymentView(payment) };
  }

  /** Undo "Mark as paid" while the request is still pending. */
  async clearPayment(requestId: string, adminUserId: string) {
    const { request } = await this.pendingWithCheckout(requestId);
    const { count } = await this.prisma.offlinePayment.deleteMany({
      where: {
        packageChangeRequestId: requestId,
        status: REQUEST_PAYMENT_STATUS.awaiting,
      },
    });
    if (count > 0) {
      await this.audit(
        request.orgId,
        adminUserId,
        'request_payment_cleared',
        requestId,
        {},
      );
    }
    return { success: true, payment: null };
  }

  private async pendingWithCheckout(
    requestId: string,
    notPending = 'Only a pending request can be marked paid.',
  ) {
    const request = await this.prisma.packageChangeRequest.findUnique({
      where: { id: requestId },
      include: { billingCheckout: { include: { coupon: true } } },
    });
    if (!request)
      throw new NotFoundException('Package change request not found');
    if (request.status !== 'pending') {
      throw requestError('request_not_pending', notPending);
    }
    const { billingCheckout: checkout, ...rest } = request;
    if (!checkout) {
      throw requestError(
        'request_without_checkout',
        'This older request has no price to pay. Approve it as before.',
      );
    }
    return { request: rest, checkout };
  }

  /* ------------------------------------------------------------ Coupon */

  /**
   * Super Admin, manual mode: take a coupon off a pending request. Checked
   * with the checkout's rules and wording (plan, interval, dates, uses), then
   * the request is re-quoted (coupon before GST) and the new amounts saved
   * on its checkout, so the request total, the org's Requests tab and the
   * invoice all use them. Replaces any coupon the quote had. A payment
   * already marked is cleared (it was for the old total).
   */
  async applyCoupon(requestId: string, adminUserId: string, rawCode: string) {
    const { request, checkout } = await this.pendingWithCheckout(
      requestId,
      'Coupons can only be changed on a pending request.',
    );
    const code = normaliseCouponCode(rawCode ?? '');
    if (!code) throw requestError('coupon_required', 'Enter a coupon code.');
    const plans = await this.prisma.plan.findMany({
      select: { id: true, name: true },
    });
    const found = await findCouponFor(this.prisma, code, {
      orgId: request.orgId,
      planId: checkout.toPlanId,
      interval: checkout.toInterval,
      now: billingNow(),
      plans,
    });
    if ('error' in found) throw requestError('coupon_invalid', found.error);
    const original =
      (checkout.quoteBeforeCoupon as CheckoutAmounts | null) ??
      amountsOf(checkout);
    const next = requoteWithCoupon(
      original,
      found.coupon,
      isIntraState(checkout),
    );
    const paymentCleared = await this.saveQuote(
      checkout.id,
      requestId,
      next,
      original,
    );
    await this.audit(
      request.orgId,
      adminUserId,
      'request_coupon_applied',
      requestId,
      {
        code: found.coupon.code,
        discount: next.couponDiscountPaise / 100,
        total: next.totalPaise / 100,
        paymentCleared,
      },
    );
    return {
      success: true,
      quote: requestQuoteView({
        ...next,
        coupon: found.coupon,
        quoteBeforeCoupon: original,
      }),
      paymentCleared,
    };
  }

  /** Undo applyCoupon: the request's original quote comes back. */
  async removeCoupon(requestId: string, adminUserId: string) {
    const { request, checkout } = await this.pendingWithCheckout(
      requestId,
      'Coupons can only be changed on a pending request.',
    );
    const original = checkout.quoteBeforeCoupon as CheckoutAmounts | null;
    if (!original) {
      return {
        success: true,
        quote: requestQuoteView(checkout),
        paymentCleared: false,
      };
    }
    const paymentCleared = await this.saveQuote(
      checkout.id,
      requestId,
      original,
      null,
    );
    await this.audit(
      request.orgId,
      adminUserId,
      'request_coupon_removed',
      requestId,
      { total: original.totalPaise / 100, paymentCleared },
    );
    const coupon = original.couponId
      ? await this.prisma.coupon.findUnique({
          where: { id: original.couponId },
          select: { code: true },
        })
      : null;
    return {
      success: true,
      quote: requestQuoteView({ ...original, coupon }),
      paymentCleared,
    };
  }

  /** New amounts on the checkout; a payment marked for the old total is cleared. */
  private async saveQuote(
    checkoutId: string,
    requestId: string,
    amounts: CheckoutAmounts,
    original: CheckoutAmounts | null,
  ): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      await tx.billingCheckout.update({
        where: { id: checkoutId },
        data: {
          ...amounts,
          quoteBeforeCoupon: original
            ? (original as unknown as Prisma.InputJsonValue)
            : Prisma.DbNull,
        },
      });
      const { count } = await tx.offlinePayment.deleteMany({
        where: {
          packageChangeRequestId: requestId,
          status: REQUEST_PAYMENT_STATUS.awaiting,
        },
      });
      return count > 0;
    });
  }

  private audit(
    orgId: string,
    actorId: string,
    action: string,
    entityId: string,
    metadata: Record<string, unknown>,
  ) {
    return this.prisma.auditLog
      .create({
        data: {
          orgId,
          actorId,
          action,
          entity: 'PackageChangeRequest',
          entityId,
          metadata: metadata as Prisma.InputJsonValue,
        },
      })
      .catch(() => undefined);
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

    // Billing v2: a request raised by a manual-mode checkout keeps that
    // checkout's period rule (an upgrade keeps renewsAt); older requests start
    // a new cycle now, exactly as before.
    const checkout = await this.prisma.billingCheckout.findUnique({
      where: { packageChangeRequestId: requestId },
    });
    // The version quoted when the request was sent (what the org gets), even
    // if the plan was edited while it waited.
    const targetPlan = effectivePlan(
      request.targetPlan,
      checkout?.planVersionId
        ? await this.prisma.planVersion?.findUnique({
            where: { id: checkout.planVersionId },
          })
        : null,
    );
    // Manual mode: Mark as paid comes first (unless there's nothing to pay).
    const payment = checkout
      ? await this.prisma.offlinePayment.findUnique({
          where: { packageChangeRequestId: requestId },
        })
      : null;
    if (checkout && !payment && checkout.totalPaise > 0) {
      throw requestError(
        'payment_required',
        'Mark this request as paid before approving it.',
      );
    }
    // Option A: the org fell back to Basic while waiting — the new term starts
    // on the day the payment was received, not at the old renewal date.
    const sub = checkout
      ? await this.prisma.subscription.findFirst({
          where: { orgId: request.orgId, status: { not: 'cancelled' } },
          include: { plan: true },
        })
      : null;
    const periodStart =
      sub && isFreePlan(sub.plan)
        ? (payment?.receivedOn ?? billingNow())
        : null;
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
        periodStart,
        // The version quoted when the request was sent, even if the plan changed since.
        planVersionId: checkout?.planVersionId ?? null,
      });
      let invoiceId: string | null = null;
      if (checkout) {
        // Applied once: a second approval finds the checkout fulfilled.
        const { count } = await tx.billingCheckout.updateMany({
          where: { id: checkout.id, fulfilledAt: null },
          data: { status: 'approved', fulfilledAt: new Date() },
        });
        if (count === 0) {
          throw new ConflictException('Request is no longer pending approval');
        }
        // Billing v2: record its coupon and keep the renewal coupon in step.
        await settleCoupon(tx, checkout);
        if (payment) {
          invoiceId = (await this.invoiceRequestPayment(tx, checkout, payment))
            .id;
        }
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
      return { approvedRequest, updatedSub: subscription, invoiceId };
    });
    // The GST invoice by email to the owner and admins (not awaited).
    if (result.invoiceId) void this.invoiceIssued?.(result.invoiceId);

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
      // Marked paid: kept, to be refunded outside the app. No invoice.
      await tx.offlinePayment.updateMany({
        where: {
          packageChangeRequestId: requestId,
          status: REQUEST_PAYMENT_STATUS.awaiting,
        },
        data: { status: REQUEST_PAYMENT_STATUS.refundDue },
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

  /**
   * The GST invoice for a request's payment, issued on approval: the request's
   * quoted breakdown when the amount received equals its total, otherwise the
   * offline rule (the amount is GST-inclusive). The payment becomes received.
   */
  private async invoiceRequestPayment(
    tx: Prisma.TransactionClient,
    checkout: NonNullable<
      Awaited<ReturnType<PrismaService['billingCheckout']['findUnique']>>
    >,
    payment: OfflinePayment,
  ) {
    await tx.offlinePayment.update({
      where: { id: payment.id },
      data: { status: 'received' },
    });
    if (payment.amountPaise === checkout.totalPaise) {
      const inv = await issueCheckoutInvoice(
        tx,
        checkout,
        payment.receivedOn,
        payment.id,
      );
      if (inv) return inv;
    }
    const plan = await tx.plan.findUnique({ where: { id: checkout.toPlanId } });
    const seller = (checkout.sellerSnapshot ?? {}) as Partial<InvoiceParty>;
    return issueOfflineInvoice(tx, {
      organisationId: checkout.organisationId,
      offlinePaymentId: payment.id,
      checkoutId: checkout.id,
      totalPaise: payment.amountPaise,
      description: `${plan?.name ?? 'Plan'} · ${checkout.toInterval} · ${checkout.kind === 'renewal' ? 'renewal' : 'purchase'} (paid offline)`,
      seller: {
        ...seller,
        legalName: seller.legalName ?? '',
        gstin: seller.gstin ?? null,
        state: seller.state ?? null,
      },
      at: payment.receivedOn,
    });
  }
}

/** A payment marked against a request, as the APIs return it (rupees, YYYY-MM-DD). */
export function requestPaymentView(p: OfflinePayment) {
  return {
    id: p.id,
    amount: p.amountPaise / 100,
    method: p.method,
    reference: p.reference,
    receivedOn: p.receivedOn.toISOString().slice(0, 10),
    note: p.note,
    status: p.status as
      'awaiting_approval' | 'received' | 'refund_due' | 'refunded',
  };
}
