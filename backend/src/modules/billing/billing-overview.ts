/**
 * Pure assembly of the v2 billing overview from real rows (unit-tested).
 * Nothing in here touches the database.
 */
import type {
  BillingInterval,
  BillingOverviewV2,
  BillingPlanV2,
  BillingProfileV2,
  PaymentMode,
  ManualReason,
  PendingUpgradeV2,
  SubscriptionStatusV2,
} from './billing.types';

const DAY_MS = 86_400_000;
export const GST_RATE = 0.18;

export const round2 = (n: number) =>
  Math.round((n + Number.EPSILON) * 100) / 100;
const isoDate = (d: Date) => d.toISOString().slice(0, 10);
const daysUntil = (to: Date, now: Date) =>
  Math.ceil((to.getTime() - now.getTime()) / DAY_MS);

export interface OverviewInput {
  now: Date;
  orgName: string;
  ownerName: string;
  billingProfile?: BillingProfileV2 | null;
  pendingUpgrade?: PendingUpgradeV2 | null;
  /** The org's plan (subscription plan, or the free plan when it has none). */
  plan: BillingPlanV2;
  subscription: {
    status:
      'active' | 'trial' | 'past_due' | 'expired' | 'paused' | 'cancelled';
    billingCycle: BillingInterval;
    renewsAt: Date | null;
    graceEndsAt: Date | null;
    /** Step 4: cancellation / downgrade scheduled for the end of the term. */
    cancelAtPeriodEnd?: boolean;
    scheduled?: { plan: BillingPlanV2; interval: BillingInterval } | null;
  } | null;
  counts: {
    users: number;
    projects: number;
    landingPages: number;
    templates: number;
  };
  notifyDays: number;
  graceDays: number;
  mode: { mode: PaymentMode; reason: ManualReason | null };
  /**
   * Next renewal incl. GST in paise, worked out like the renewal checkout
   * (taxOn). When absent, price × 1.18.
   */
  renewalTotalPaise?: number | null;
}

export function deriveStatus(
  input: Pick<OverviewInput, 'plan' | 'subscription' | 'now' | 'notifyDays'>,
): SubscriptionStatusV2 {
  const sub = input.subscription;
  if (!sub || input.plan.isFree) return 'free';
  switch (sub.status) {
    case 'active':
    case 'trial':
      // Cancelling: nothing to renew. A scheduled downgrade still renews
      // (at the smaller plan's price), so the renewal window shows first.
      if (sub.cancelAtPeriodEnd) return 'cancellation_scheduled';
      if (
        sub.renewsAt &&
        daysUntil(sub.renewsAt, input.now) <= input.notifyDays
      ) {
        return 'renewal_due';
      }
      return sub.scheduled ? 'downgrade_scheduled' : 'active';
    case 'past_due':
      if (sub.cancelAtPeriodEnd) return 'cancellation_scheduled';
      return sub.graceEndsAt && daysUntil(sub.graceEndsAt, input.now) <= 1
        ? 'grace_ending'
        : 'past_due';
    default:
      // expired / paused — today's "restrict" behaviour keeps the paid plan but blocks publishing.
      return 'expired';
  }
}

export function buildOverview(input: OverviewInput): BillingOverviewV2 {
  const { plan, subscription: sub, now } = input;
  const status = deriveStatus(input);
  const paid = !plan.isFree;
  const interval: BillingInterval = sub?.billingCycle ?? 'monthly';
  // renewsAt is set to now + 30 / 365 days by the existing subscription code.
  const cycleDays = interval === 'yearly' ? 365 : 30;
  const periodEnd = paid && sub?.renewsAt ? sub.renewsAt : null;
  const periodStart = periodEnd
    ? new Date(periodEnd.getTime() - cycleDays * DAY_MS)
    : null;
  const inGrace =
    status === 'past_due' ||
    status === 'grace_ending' ||
    (status === 'cancellation_scheduled' && sub?.status === 'past_due');
  const scheduled = sub?.scheduled ?? null;
  // The next term is charged at the scheduled plan's price.
  const next = scheduled ?? { plan, interval };
  const price =
    next.interval === 'yearly' ? next.plan.priceYearly : next.plan.priceMonthly;
  const cancelling = !!sub?.cancelAtPeriodEnd;

  return {
    orgName: input.orgName,
    ownerName: input.ownerName,
    plan,
    paidPlan: paid ? plan : null,
    interval,
    status,
    paymentMode: input.mode.mode,
    paymentModeReason: input.mode.reason,
    autoRenewAvailable: false,
    renewalMode: 'manual',
    paymentMethod: null,
    billingProfile: input.billingProfile ?? null,
    pendingUpgrade: input.pendingUpgrade ?? null,
    periodStart: periodStart ? isoDate(periodStart) : null,
    periodEnd: periodEnd ? isoDate(periodEnd) : null,
    daysLeftInPeriod:
      periodEnd && status !== 'expired' && !inGrace
        ? Math.max(0, daysUntil(periodEnd, now))
        : 0,
    daysInPeriod: periodEnd ? cycleDays : 0,
    dueDate:
      inGrace || status === 'expired'
        ? periodEnd
          ? isoDate(periodEnd)
          : null
        : null,
    graceEndsAt: inGrace && sub?.graceEndsAt ? isoDate(sub.graceEndsAt) : null,
    graceDays: input.graceDays,
    graceDay:
      inGrace && periodEnd
        ? Math.max(
            1,
            Math.floor((now.getTime() - periodEnd.getTime()) / DAY_MS) + 1,
          )
        : 0,
    graceDaysLeft:
      inGrace && sub?.graceEndsAt
        ? Math.max(0, daysUntil(sub.graceEndsAt, now))
        : 0,
    movedToBasicAt: null,
    cancelAt: cancelling
      ? sub?.status === 'past_due' && sub.graceEndsAt
        ? isoDate(sub.graceEndsAt)
        : periodEnd
          ? isoDate(periodEnd)
          : null
      : null,
    downgradeTo: scheduled?.plan ?? null,
    downgradeInterval: scheduled?.interval ?? null,
    downgradeAt: scheduled && periodEnd ? isoDate(periodEnd) : null,
    renewalAmount:
      !paid || cancelling
        ? null
        : input.renewalTotalPaise != null
          ? input.renewalTotalPaise / 100
          : round2(price * (1 + GST_RATE)),
    usage: [
      {
        key: 'users',
        label: 'Users',
        used: input.counts.users,
        limit: plan.limits.users,
      },
      {
        key: 'projects',
        label: 'Projects',
        used: input.counts.projects,
        limit: plan.limits.projects,
      },
      {
        key: 'landingPages',
        label: 'Landing pages',
        used: input.counts.landingPages,
        limit: plan.limits.landingPages,
      },
      {
        key: 'templates',
        label: 'Templates',
        used: input.counts.templates,
        limit: plan.limits.templates,
      },
    ],
    locked: { users: 0, projects: 0, landingPages: 0 },
    retention: null,
  };
}
