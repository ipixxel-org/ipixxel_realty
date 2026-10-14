/**
 * Billing v2 price quote — the server is the only calculator. Pure and
 * unit-tested; previewCheckout shows it and startCheckout recomputes it.
 *
 * Money is integer PAISE throughout. One rounding rule everywhere:
 * `roundHalfUp(n / d)` on non-negative integers, done in integer arithmetic
 * (no floats) — used for proration and for each tax component. Each tax
 * component is computed on the taxable value on its own; the total is
 * taxable + components. Display values are paise / 100.
 *
 * Kinds:
 *  - new                    no active paid plan: full price, new cycle starts now
 *  - upgrade_same_interval  (newPrice − oldPrice) × daysLeft ÷ daysInCycle;
 *                           renewsAt unchanged
 *  - interval_change        monthly → yearly: yearly price − unused credit of the
 *                           current monthly cycle (oldPrice × daysLeft ÷ daysInCycle);
 *                           a new yearly cycle starts now
 */
import type { BillingWarning, CheckoutKind } from './billing.types';

export type Interval = 'monthly' | 'yearly';

/** Cycle lengths match how the existing subscription code sets renewsAt. */
export const CYCLE_DAYS: Record<Interval, number> = {
  monthly: 30,
  yearly: 365,
};
/** Razorpay's minimum order (₹1). */
export const MIN_ONLINE_PAISE = 100;
const DAY_MS = 86_400_000;

export type QuoteErrorCode =
  | 'plan_not_found'
  | 'free_plan'
  | 'same_plan'
  | 'lower_plan'
  | 'yearly_to_monthly';

export class QuoteError extends Error {
  constructor(
    readonly code: QuoteErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export interface QuotePlan {
  id: string;
  name: string;
  /** Whole rupees. */
  priceMonthly: number;
  priceYearly: number;
  rank: number;
  isFree: boolean;
}

export interface QuoteInput {
  now: Date;
  target: QuotePlan;
  interval: Interval;
  current: {
    plan: QuotePlan;
    interval: Interval;
    status: string;
    renewsAt: Date | null;
  } | null;
  /** Buyer's GST state code (null = unknown) and ISO country. */
  buyer: { state: string | null; country: string };
  seller: { state: string | null };
}

export interface Quote {
  kind: CheckoutKind;
  fromPlan: QuotePlan | null;
  fromInterval: Interval | null;
  toPlan: QuotePlan;
  toInterval: Interval;
  /** Full price of the chosen plan + interval. */
  subtotalPaise: number;
  /** Taken off the subtotal (unused part of what was already paid). */
  creditPaise: number;
  taxablePaise: number;
  gstKind: 'intra' | 'inter';
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  totalPaise: number;
  /** For upgrades / interval changes: the proration inputs. */
  proration: {
    oldPricePaise: number;
    newPricePaise: number;
    daysLeft: number;
    daysInCycle: number;
  } | null;
  periodEnd: Date;
  /** Pre-GST price of each later renewal. */
  recurringPaise: number;
  warnings: BillingWarning[];
}

/** round(n / d) half up, for non-negative integers, without floats. */
export function roundHalfUp(n: number, d: number): number {
  if (!Number.isSafeInteger(n) || !Number.isSafeInteger(d) || n < 0 || d <= 0) {
    throw new Error(`roundHalfUp needs non-negative integers (got ${n}/${d})`);
  }
  return Math.floor((2 * n + d) / (2 * d));
}

export const pricePaise = (p: QuotePlan, interval: Interval) =>
  (interval === 'yearly' ? p.priceYearly : p.priceMonthly) * 100;

export function daysLeftIn(
  renewsAt: Date,
  now: Date,
  cycleDays: number,
): number {
  const left = Math.ceil((renewsAt.getTime() - now.getTime()) / DAY_MS);
  return Math.min(Math.max(left, 0), cycleDays);
}

export function splitGstPaise(
  taxablePaise: number,
  intra: boolean,
): { cgst: number; sgst: number; igst: number } {
  if (intra) {
    const half = roundHalfUp(taxablePaise * 9, 100);
    return { cgst: half, sgst: half, igst: 0 };
  }
  return { cgst: 0, sgst: 0, igst: roundHalfUp(taxablePaise * 18, 100) };
}

function hasActivePaidPlan(current: QuoteInput['current'], now: Date): boolean {
  return (
    !!current &&
    !current.plan.isFree &&
    (current.status === 'active' || current.status === 'trial') &&
    !!current.renewsAt &&
    current.renewsAt.getTime() > now.getTime()
  );
}

/** Decide the kind, or reject (current plan, lower or free plan, yearly → monthly). */
export function quoteKind(
  input: Pick<QuoteInput, 'now' | 'target' | 'interval' | 'current'>,
): CheckoutKind {
  const { target, interval, current, now } = input;
  if (target.isFree) {
    throw new QuoteError(
      'free_plan',
      `${target.name} is free — there's nothing to buy.`,
    );
  }
  if (
    current &&
    current.plan.id === target.id &&
    current.interval === interval
  ) {
    throw new QuoteError(
      'same_plan',
      `You're already on ${target.name} (${interval}).`,
    );
  }
  if (!hasActivePaidPlan(current, now)) return 'new';

  const cur = current!;
  if (target.rank < cur.plan.rank) {
    throw new QuoteError(
      'lower_plan',
      `${target.name} is smaller than your ${cur.plan.name} plan. Moving down is a downgrade, which starts at the end of your billing period.`,
    );
  }
  if (cur.interval === 'yearly' && interval === 'monthly') {
    throw new QuoteError(
      'yearly_to_monthly',
      "You're on yearly billing. Switching to monthly happens at your renewal, not mid-year.",
    );
  }
  return cur.interval === interval
    ? 'upgrade_same_interval'
    : 'interval_change';
}

export function quoteCheckout(input: QuoteInput): Quote {
  const kind = quoteKind(input);
  const { target, interval, now } = input;
  const cur = input.current;
  const subtotal = pricePaise(target, interval);
  let credit = 0;
  let taxable = subtotal;
  let proration: Quote['proration'] = null;
  let periodEnd = new Date(now.getTime() + CYCLE_DAYS[interval] * DAY_MS);

  if (kind === 'upgrade_same_interval') {
    const cycle = CYCLE_DAYS[interval];
    const daysLeft = daysLeftIn(cur!.renewsAt!, now, cycle);
    const oldP = pricePaise(cur!.plan, interval);
    const charge = roundHalfUp(Math.max(0, subtotal - oldP) * daysLeft, cycle);
    taxable = charge;
    credit = subtotal - charge;
    proration = {
      oldPricePaise: oldP,
      newPricePaise: subtotal,
      daysLeft,
      daysInCycle: cycle,
    };
    periodEnd = cur!.renewsAt!;
  } else if (kind === 'interval_change') {
    const cycle = CYCLE_DAYS[cur!.interval];
    const daysLeft = daysLeftIn(cur!.renewsAt!, now, cycle);
    const oldP = pricePaise(cur!.plan, cur!.interval);
    credit = Math.min(subtotal, roundHalfUp(oldP * daysLeft, cycle));
    taxable = subtotal - credit;
    proration = {
      oldPricePaise: oldP,
      newPricePaise: subtotal,
      daysLeft,
      daysInCycle: cycle,
    };
  }

  const warnings: BillingWarning[] = [];
  if (!input.seller.state) {
    warnings.push({
      code: 'seller_state_missing',
      message: "The company's GST state isn't set, so this is charged as IGST.",
    });
  }
  // TODO(billing): buyers outside India — export of services. IGST for now.
  const india = input.buyer.country.toUpperCase() === 'IN';
  if (!india) {
    warnings.push({
      code: 'buyer_outside_india',
      message: 'Billing address is outside India; charged as IGST for now.',
    });
  }
  const intra =
    india &&
    !!input.seller.state &&
    !!input.buyer.state &&
    input.buyer.state === input.seller.state;
  const gst = splitGstPaise(taxable, intra);

  return {
    kind,
    // The plan the org is on when quoted (free or not) — fulfilment checks
    // it is still the same before applying the change.
    fromPlan: cur ? cur.plan : null,
    fromInterval: cur ? cur.interval : null,
    toPlan: target,
    toInterval: interval,
    subtotalPaise: subtotal,
    creditPaise: credit,
    taxablePaise: taxable,
    gstKind: intra ? 'intra' : 'inter',
    cgstPaise: gst.cgst,
    sgstPaise: gst.sgst,
    igstPaise: gst.igst,
    totalPaise: taxable + gst.cgst + gst.sgst + gst.igst,
    proration,
    periodEnd,
    recurringPaise: subtotal,
    warnings,
  };
}

export const toRupees = (paise: number) => paise / 100;
