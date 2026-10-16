import { ConflictException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { orgBillingRecipientsWhere } from './notification-recipients.util';
import { applyRetention } from './retention.util';
import { billingNow } from './billing-clock.util';

const DAY_MS = 24 * 60 * 60 * 1000;
const CYCLE_DAYS = { monthly: 30, yearly: 365 } as const;

/** Subscription fields that clear a scheduled cancellation / downgrade. */
export const NO_SCHEDULED_CHANGE = {
  cancelAtPeriodEnd: false,
  cancelReason: null,
  scheduledPlanId: null,
  scheduledInterval: null,
  changeScheduledAt: null,
} as const;

export type PlanChangeKind =
  'new' | 'upgrade_same_interval' | 'interval_change' | 'renewal';

/**
 * The next term when a subscription is renewed ("pay each time"). While the
 * term or its grace window is still running (active / trial / past_due) the
 * new term continues from renewsAt, so paying early loses no days and paying
 * in grace covers the days already used. Once expired — or if that term
 * would already be over — it starts now. Shared by the renewal quote and by
 * applyPlanChange so the preview and the applied date always agree.
 */
export function renewalPeriodEnd(
  sub: { status: string; renewsAt: Date | null },
  interval: 'monthly' | 'yearly',
  now: Date,
): Date {
  const cycleMs = CYCLE_DAYS[interval] * DAY_MS;
  const continues =
    !!sub.renewsAt && ['active', 'trial', 'past_due'].includes(sub.status);
  const end = new Date(
    (continues ? sub.renewsAt!.getTime() : now.getTime()) + cycleMs,
  );
  return end.getTime() > now.getTime()
    ? end
    : new Date(now.getTime() + cycleMs);
}

export interface ApplyPlanChangeInput {
  organisationId: string;
  toPlanId: string;
  toInterval: 'monthly' | 'yearly';
  /**
   * Period rule: 'new' and 'interval_change' start a fresh cycle now;
   * 'upgrade_same_interval' keeps the current renewsAt; 'renewal' adds one
   * term (renewalPeriodEnd) — on a scheduled smaller plan / interval if the
   * caller passes it as toPlanId / toInterval.
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
  const now = input.now ?? billingNow();
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
      : input.kind === 'renewal' && activeSub
        ? renewalPeriodEnd(activeSub, input.toInterval, now)
        : freshRenewsAt;
  const renewed = input.kind === 'renewal';

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
          graceExtensionDays: 0,
          cancelledAt: null,
          // Any plan change (upgrade, renewal, approval) replaces a scheduled
          // cancellation or downgrade; a renewal has just applied it.
          ...NO_SCHEDULED_CHANGE,
          movedToBasicAt: null,
          previousPlanId: null,
          previousInterval: null,
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

  // "Choose what stays": a bigger plan brings paused things back; a smaller
  // one (a renewal onto a scheduled downgrade) pauses what doesn't fit.
  await applyRetention(tx, input.organisationId, plan, now);

  await tx.auditLog.create({
    data: {
      orgId: input.organisationId,
      actorId: input.actorId,
      // Approvals keep the action they always had; payments get their own.
      action: input.requestId
        ? 'package_change_request_approved'
        : renewed
          ? 'subscription_renewed'
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
    // An approved request reads as an approval; a renewal (paid online, or
    // recorded offline by a Super Admin) reads as a renewal.
    const approved = input.source === 'super_admin' && !renewed;
    await tx.notification.createMany({
      data: recipients.map((u) => ({
        orgId: input.organisationId,
        recipientId: u.id,
        // Same notification type for both (no enum change); the text differs.
        type: 'package_change_approved' as const,
        title: approved
          ? 'Package Change Approved'
          : renewed
            ? 'Plan Renewed'
            : 'Plan Activated',
        body: approved
          ? `Your request to change package to "${plan.name}" has been approved by Super Admin. Your new plan is now active.`
          : renewed
            ? `Payment received. Your "${plan.name}" plan is renewed until ${renewsAt.toISOString().slice(0, 10)}.`
            : `Payment received. Your organisation is now on the "${plan.name}" plan.`,
        entity: 'Subscription',
        entityId: subscription.id,
      })),
    });
  }

  return { plan, subscription };
}
