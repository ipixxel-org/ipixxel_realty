import { ConflictException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { orgBillingRecipientsWhere } from './notification-recipients.util';

const DAY_MS = 24 * 60 * 60 * 1000;
const CYCLE_DAYS = { monthly: 30, yearly: 365 } as const;

export type PlanChangeKind =
  'new' | 'upgrade_same_interval' | 'interval_change';

export interface ApplyPlanChangeInput {
  organisationId: string;
  toPlanId: string;
  toInterval: 'monthly' | 'yearly';
  /**
   * Period rule: 'new' and 'interval_change' start a fresh cycle now;
   * 'upgrade_same_interval' keeps the current renewsAt.
   */
  kind: PlanChangeKind;
  source: 'payment' | 'super_admin';
  /** The Super Admin who approved; null for a payment. */
  actorId: string | null;
  /** Billing v2 checkout behind this change, if any. */
  checkoutId?: string | null;
  /** Package change request being approved, if any (pending → approved, once). */
  requestId?: string | null;
  /** Also notified: the member who asked for the change. */
  requestedById?: string | null;
  now?: Date;
}

/**
 * THE one path that moves an organisation onto a plan — used by Super Admin
 * approval (PackageChangeRequestsService.adminApproveRequest) and by a
 * captured plan payment (BillingCheckoutService). Must run inside the
 * caller's transaction. It:
 *  - flips the request pending → approved with a conditional update, so two
 *    concurrent approvals can't both succeed (the loser gets a 409);
 *  - updates or creates the subscription with the period rules above, and
 *    amount / mrr exactly as before;
 *  - writes the audit log (source + actor) and the existing notifications.
 * Usage limits are the caller's job (assertPlanFitsCurrentUsage).
 */
export async function applyPlanChange(
  tx: Prisma.TransactionClient,
  input: ApplyPlanChangeInput,
) {
  const now = input.now ?? new Date();
  const plan = await tx.plan.findUniqueOrThrow({
    where: { id: input.toPlanId },
  });

  if (input.requestId) {
    const { count } = await tx.packageChangeRequest.updateMany({
      where: { id: input.requestId, status: 'pending' },
      data: {
        status: 'approved',
        reviewedAt: now,
        reviewedById: input.actorId,
      },
    });
    if (count === 0) {
      throw new ConflictException('Request is no longer pending approval');
    }
  }

  const isYearly = input.toInterval === 'yearly';
  const amount = isYearly ? plan.priceYearly : plan.priceMonthly;
  const mrr = isYearly ? Math.round(amount / 12) : amount;
  const freshRenewsAt = new Date(
    now.getTime() + CYCLE_DAYS[input.toInterval] * DAY_MS,
  );

  const activeSub = await tx.subscription.findFirst({
    where: { orgId: input.organisationId, status: { not: 'cancelled' } },
  });
  const renewsAt =
    input.kind === 'upgrade_same_interval' && activeSub?.renewsAt
      ? activeSub.renewsAt
      : freshRenewsAt;

  const subscription = activeSub
    ? await tx.subscription.update({
        where: { id: activeSub.id },
        data: {
          planId: plan.id,
          billingCycle: input.toInterval,
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
          orgId: input.organisationId,
          planId: plan.id,
          billingCycle: input.toInterval,
          status: 'active',
          amount,
          mrr,
          currency: 'INR',
          renewsAt,
        },
      });

  await tx.auditLog.create({
    data: {
      orgId: input.organisationId,
      actorId: input.actorId,
      // Approvals keep the action they always had; payments get their own.
      action: input.requestId
        ? 'package_change_request_approved'
        : 'plan_purchased',
      entity: input.requestId ? 'PackageChangeRequest' : 'Subscription',
      entityId: input.requestId ?? subscription.id,
      metadata: {
        planId: plan.id,
        planName: plan.name,
        billingCycle: input.toInterval,
        kind: input.kind,
        source: input.source,
        checkoutId: input.checkoutId ?? null,
        renewsAt: renewsAt.toISOString(),
      },
    },
  });

  // Org Admins + the member who asked — not every member.
  const recipients = await tx.user.findMany({
    where: orgBillingRecipientsWhere(
      input.organisationId,
      input.requestedById ?? null,
    ),
    select: { id: true },
  });
  if (recipients.length > 0) {
    const approved = input.source === 'super_admin';
    await tx.notification.createMany({
      data: recipients.map((u) => ({
        orgId: input.organisationId,
        recipientId: u.id,
        // Same notification type for both (no enum change); the text differs.
        type: 'package_change_approved' as const,
        title: approved ? 'Package Change Approved' : 'Plan Activated',
        body: approved
          ? `Your request to change package to "${plan.name}" has been approved by Super Admin. Your new plan is now active.`
          : `Payment received. Your organisation is now on the "${plan.name}" plan.`,
        entity: 'Subscription',
        entityId: subscription.id,
      })),
    });
  }

  return { plan, subscription };
}
