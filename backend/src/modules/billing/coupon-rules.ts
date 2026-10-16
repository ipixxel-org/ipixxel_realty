/**
 * Billing v2 coupons — the pure rules (unit-tested). The checks run in the
 * same order, with the same customer wording, as `validateCoupon` in
 * frontend/lib/billing/pricing.ts, so the reason shown is the same.
 * Money is integer paise; dates compare as UTC calendar days (YYYY-MM-DD).
 */
import {
  roundHalfUp,
  taxOn,
  type Quote,
  type QuoteInput,
} from './checkout-quote';

export type CouponKindV2 = 'percent' | 'fixed';
export type CouponDurationV2 = 'first_payment' | 'first_n' | 'forever';
export type CouponIntervalV2 = 'any' | 'monthly' | 'yearly';

/** The coupon fields the rules need (a Prisma Coupon row fits). */
export interface CouponRule {
  id: string;
  code: string;
  kind: CouponKindV2;
  percentOff: number | null;
  amountOffPaise: number | null;
  planIds: string[];
  interval: CouponIntervalV2;
  duration: CouponDurationV2;
  durationCount: number | null;
  validFrom: Date;
  validTo: Date | null;
  totalUses: number | null;
  oncePerOrg: boolean;
  orgIds: string[];
}

export interface CouponCheckContext {
  now: Date;
  orgId: string;
  planId: string;
  interval: 'monthly' | 'yearly';
  /** Plan names by id, for "only works on Growth and Pro". */
  planNames: Record<string, string>;
  /** Organisations that have used it so far (distinct). */
  usesSoFar: number;
  /** Has this organisation used it before? */
  orgHasUsed: boolean;
}

export type CouponCheck = { ok: true } | { ok: false; reason: string };

export const normaliseCouponCode = (raw: string) =>
  raw.trim().toUpperCase().replace(/\s+/g, '');

export const dayOf = (d: Date) => d.toISOString().slice(0, 10);

const dateLabel = (d: Date) =>
  d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });

const inr = (paise: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: paise % 100 ? 2 : 0,
  }).format(paise / 100);

function planList(ids: string[], names: Record<string, string>): string {
  const list = ids.map((id) => names[id] ?? id);
  return list.length <= 1
    ? list.join('')
    : `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
}

export function checkCoupon(
  c: CouponRule,
  ctx: CouponCheckContext,
): CouponCheck {
  const today = dayOf(ctx.now);
  if (dayOf(c.validFrom) > today) {
    return {
      ok: false,
      reason: `${c.code} isn't active yet — it starts on ${dateLabel(c.validFrom)}.`,
    };
  }
  if (c.validTo && dayOf(c.validTo) < today) {
    return {
      ok: false,
      reason: `${c.code} expired on ${dateLabel(c.validTo)}.`,
    };
  }
  if (c.orgIds.length > 0 && !c.orgIds.includes(ctx.orgId)) {
    return {
      ok: false,
      reason: `${c.code} is reserved for specific organisations and isn't available to yours.`,
    };
  }
  if (!c.planIds.includes(ctx.planId)) {
    return {
      ok: false,
      reason: `${c.code} only works on ${planList(c.planIds, ctx.planNames)}.`,
    };
  }
  if (c.interval !== 'any' && c.interval !== ctx.interval) {
    return {
      ok: false,
      reason: `${c.code} only works with ${c.interval} billing.`,
    };
  }
  // An org that already used it isn't a new use of the limit.
  if (c.totalUses != null && !ctx.orgHasUsed && ctx.usesSoFar >= c.totalUses) {
    return { ok: false, reason: `${c.code} has reached its usage limit.` };
  }
  if (c.oncePerOrg && ctx.orgHasUsed) {
    return {
      ok: false,
      reason: `Your organisation has already used ${c.code}.`,
    };
  }
  return { ok: true };
}

/** Discount on an amount (paise), never more than the amount. */
export function couponDiscountPaise(
  c: Pick<CouponRule, 'kind' | 'percentOff' | 'amountOffPaise'>,
  amountPaise: number,
): number {
  if (amountPaise <= 0) return 0;
  if (c.kind === 'percent') {
    return Math.min(
      amountPaise,
      roundHalfUp(amountPaise * (c.percentOff ?? 0), 100),
    );
  }
  return Math.min(amountPaise, c.amountOffPaise ?? 0);
}

/** "20% off the first 3 payments" — same words as the UI. */
export function describeCouponV2(
  c: Pick<
    CouponRule,
    'kind' | 'percentOff' | 'amountOffPaise' | 'duration' | 'durationCount'
  >,
): string {
  const off =
    c.kind === 'percent'
      ? `${c.percentOff}% off`
      : `${inr(c.amountOffPaise ?? 0)} off`;
  const span =
    c.duration === 'first_payment'
      ? 'the first payment'
      : c.duration === 'forever'
        ? 'every payment'
        : `the first ${c.durationCount ?? 1} payments`;
  return `${off} ${span}`;
}

/**
 * Renewals a coupon still covers after the payment it's first used on:
 * first_payment 0, first_n count − 1, forever null (every renewal).
 */
export function renewalsCoveredAfterFirst(
  c: Pick<CouponRule, 'duration' | 'durationCount'>,
): number | null {
  if (c.duration === 'forever') return null;
  if (c.duration === 'first_n') return Math.max(0, (c.durationCount ?? 1) - 1);
  return 0;
}

export type CouponStatusV2 = 'active' | 'scheduled' | 'expired' | 'used_up';

/** Same rule as frontend/lib/billing/coupons.ts couponStatusFor. */
export function couponStatus(
  c: Pick<CouponRule, 'validFrom' | 'validTo' | 'totalUses'>,
  uses: number,
  now: Date,
): CouponStatusV2 {
  const today = dayOf(now);
  if (dayOf(c.validFrom) > today) return 'scheduled';
  if (c.validTo && dayOf(c.validTo) < today) return 'expired';
  if (c.totalUses != null && uses >= c.totalUses) return 'used_up';
  return 'active';
}

/**
 * What the next renewal charges, made up the same way as the renewal
 * checkout (quoteRenewal, then withCoupon): the plan price, any coupon still
 * on the subscription taken off before GST, GST on what's left. Used by the
 * overview so "Pay now · ₹X" and its breakdown equal the charge.
 */
export function renewalCharge(
  pricePaise: number,
  coupon: Pick<CouponRule, 'kind' | 'percentOff' | 'amountOffPaise'> | null,
  parties: Pick<QuoteInput, 'buyer' | 'seller'>,
): {
  subtotalPaise: number;
  couponDiscountPaise: number;
  taxablePaise: number;
  gstPaise: number;
  totalPaise: number;
} {
  const discount = coupon ? couponDiscountPaise(coupon, pricePaise) : 0;
  const taxable = pricePaise - discount;
  const tax = taxOn(taxable, parties);
  return {
    subtotalPaise: pricePaise,
    couponDiscountPaise: discount,
    taxablePaise: taxable,
    gstPaise: tax.cgstPaise + tax.sgstPaise + tax.igstPaise,
    totalPaise: tax.totalPaise,
  };
}

/**
 * Org Billing → Coupons: which coupons an organisation sees — the ones
 * reserved for it, and open ones a Super Admin chose to list. Coupons that
 * haven't started yet are left out.
 */
export function couponVisibleToOrg(
  c: Pick<CouponRule, 'orgIds' | 'validFrom'> & { showToCustomers: boolean },
  orgId: string,
  now: Date,
): boolean {
  if (dayOf(c.validFrom) > dayOf(now)) return false;
  return c.orgIds.length > 0 ? c.orgIds.includes(orgId) : c.showToCustomers;
}

export type OrgCouponStatus = 'available' | 'redeemed' | 'expired' | 'used_up';

/**
 * A coupon's status for one organisation: redeemed (it used a once-per-org
 * coupon), expired, used up (the limit was reached by others), else
 * available — the same checks, in the same order, as checkCoupon.
 */
export function orgCouponStatus(
  c: Pick<CouponRule, 'validTo' | 'totalUses' | 'oncePerOrg'>,
  ctx: { now: Date; usesSoFar: number; orgHasUsed: boolean },
): OrgCouponStatus {
  if (ctx.orgHasUsed && c.oncePerOrg) return 'redeemed';
  if (c.validTo && dayOf(c.validTo) < dayOf(ctx.now)) return 'expired';
  if (c.totalUses != null && !ctx.orgHasUsed && ctx.usesSoFar >= c.totalUses) {
    return 'used_up';
  }
  return 'available';
}

/**
 * Take a coupon off a quote: the discount comes off the taxable value
 * (after any proration credit), then GST is worked out again on what's left.
 */
export function withCoupon(
  q: Quote,
  c: CouponRule & { description: string },
  parties: Pick<QuoteInput, 'buyer' | 'seller'>,
  renewalsLeft: number | null,
): Quote {
  const discount = couponDiscountPaise(c, q.taxablePaise);
  const taxable = q.taxablePaise - discount;
  return {
    ...q,
    taxablePaise: taxable,
    ...taxOn(taxable, parties),
    couponDiscountPaise: discount,
    coupon: {
      id: c.id,
      code: c.code,
      description: c.description || describeCouponV2(c),
      renewalsLeft,
    },
  };
}
