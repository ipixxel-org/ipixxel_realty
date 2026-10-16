/**
 * Pure billing helpers: dates, money, proration, GST split and coupon
 * validation. No React, no I/O — unit-tested in `__tests__/pricing.test.ts`.
 * Amounts are rupees rounded to the paisa. The backend must apply the same
 * rules; these are the reference implementation.
 */
import type { BillingInterval as Cycle, BillingOverview, BillingPlan, Coupon, PlanId } from "./types";

type ProtoPlan = Pick<BillingPlan, "priceMonthly" | "priceYearly">;
type ProtoCoupon = Coupon;

/** The platform's registered state — decides CGST+SGST vs IGST. */
/** The mock platform's GST state code (Karnataka). The real seller state is a Super Admin setting. */
export const COMPANY_STATE = "29";
export const GST_RATE = 0.18;

/* ------------------------------------------------------------- Rounding */

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function formatINR(amount: number): string {
  const whole = Number.isInteger(amount);
  return `₹${amount.toLocaleString("en-IN", {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

/* ---------------------------------------------------------------- Dates */
// Dates are "YYYY-MM-DD" strings handled in UTC so they never drift by a day.

const DAY_MS = 86_400_000;

function toUtc(iso: string): number {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function fromUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((toUtc(to) - toUtc(from)) / DAY_MS);
}

export function addDays(iso: string, days: number): string {
  return fromUtc(toUtc(iso) + days * DAY_MS);
}

export function addMonths(iso: string, months: number): string {
  const d = new Date(toUtc(iso));
  d.setUTCMonth(d.getUTCMonth() + months);
  return fromUtc(d.getTime());
}

export function addCycle(iso: string, cycle: Cycle): string {
  return addMonths(iso, cycle === "yearly" ? 12 : 1);
}

export function formatDate(iso: string): string {
  return new Date(toUtc(iso)).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function formatShortDate(iso: string): string {
  return new Date(toUtc(iso)).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
}

/* ---------------------------------------------------------------- Plans */

export function planPrice(plan: ProtoPlan, cycle: Cycle): number {
  return cycle === "yearly" ? plan.priceYearly : plan.priceMonthly;
}

/* -------------------------------------------------------- Price display */

/**
 * How a package price is shown everywhere a customer is asked to pay:
 * "₹1,499 + GST" — the package amount before GST, never a GST-inclusive
 * figure. Where GST doesn't apply (`gst: false`): just "₹1,499".
 */
export function packagePriceText(amount: number, opts: { gst?: boolean } = {}): string {
  return opts.gst === false ? formatINR(amount) : `${formatINR(amount)} + GST`;
}

type RenewalPriceSource = Pick<BillingOverview, "renewalBreakdown" | "interval" | "plan" | "paidPlan">;

/**
 * The next renewal, shown like a package price: "₹1,499 + GST". From the
 * renewal checkout's calculation when the backend sends it (a coupon on the
 * subscription comes off first: "₹1,349.10 + GST"), else the plan's price.
 */
export function renewalPriceText(o: RenewalPriceSource): string {
  const b = o.renewalBreakdown;
  if (b) return packagePriceText(b.taxable, { gst: b.gst > 0 });
  const plan = o.paidPlan ?? o.plan;
  return plan.isFree ? "Free" : packagePriceText(planPrice(plan, o.interval));
}

/**
 * Secondary text for the renewal price, or null: the coupon taken off and the
 * total incl. GST ("₹1,499 − ₹149.90 coupon TEN · ₹1,591.94 incl. GST").
 */
export function renewalPriceNote(o: RenewalPriceSource): string | null {
  const b = o.renewalBreakdown;
  if (!b) return null;
  const coupon = b.couponDiscount > 0 ? `${formatINR(b.price)} − ${formatINR(b.couponDiscount)} coupon${b.couponCode ? ` ${b.couponCode}` : ""}` : null;
  const total = b.gst > 0 ? `${formatINR(b.total)} incl. GST` : null;
  return [coupon, total].filter(Boolean).join(" · ") || null;
}

/* ------------------------------------------------------------ Proration */

export interface Proration {
  /** Amount due now: (new − old) × days left ÷ days in cycle, never below 0. */
  charge: number;
  /** New plan's full price minus `charge` — shown as the mid-cycle credit. */
  credit: number;
  newPrice: number;
  oldPrice: number;
  daysLeft: number;
  daysInCycle: number;
}

export function prorate(newPrice: number, oldPrice: number, daysLeft: number, daysInCycle: number): Proration {
  if (daysInCycle <= 0) throw new Error("daysInCycle must be positive");
  const left = Math.min(Math.max(daysLeft, 0), daysInCycle);
  const charge = Math.max(0, round2(((newPrice - oldPrice) * left) / daysInCycle));
  return { charge, credit: round2(newPrice - charge), newPrice, oldPrice, daysLeft: left, daysInCycle };
}

/* ------------------------------------------------------------------ GST */

export type GstSplit =
  | { kind: "intra"; cgst: number; sgst: number; igst: 0; total: number }
  | { kind: "inter"; cgst: 0; sgst: 0; igst: number; total: number };

/**
 * 18% GST: CGST 9% + SGST 9% when the buyer's billing state is the
 * platform's own state (intra-state supply), otherwise IGST 18%.
 */
export function splitGst(taxable: number, billingState: string | null | undefined, companyState: string = COMPANY_STATE): GstSplit {
  const same = (stateCodeOf(billingState) ?? "") === (stateCodeOf(companyState) ?? "-");
  if (same) {
    const half = round2((taxable * GST_RATE) / 2);
    return { kind: "intra", cgst: half, sgst: half, igst: 0, total: round2(half * 2) };
  }
  const igst = round2(taxable * GST_RATE);
  return { kind: "inter", cgst: 0, sgst: 0, igst, total: igst };
}

export function withGst(taxable: number, billingState: string = COMPANY_STATE): number {
  return round2(taxable + splitGst(taxable, billingState).total);
}

/**
 * What paying yearly saves against 12 monthly payments, from the plan's own
 * prices. null when either price isn't set or yearly isn't cheaper — the UI
 * then shows no saving at all.
 */
export function yearlySaving(priceMonthly: number, priceYearly: number): { amount: number; percent: number } | null {
  if (!(priceMonthly > 0) || !(priceYearly > 0)) return null;
  const twelve = priceMonthly * 12;
  if (priceYearly >= twelve) return null;
  return { amount: round2(twelve - priceYearly), percent: Math.round((1 - priceYearly / twelve) * 100) };
}

/* -------------------------------------------------------------- Coupons */

export interface CouponContext {
  planId: PlanId;
  /** Plan id → display name, for the "only works on …" message. */
  planNames: Record<string, string>;
  cycle: Cycle;
  orgId: string;
  today: string;
  /** Codes this org has already redeemed. */
  orgRedeemed: string[];
  /** Organisations that have redeemed this code so far. */
  usesSoFar: number;
}

export type CouponCheck = { ok: true; coupon: ProtoCoupon } | { ok: false; reason: string };

function planList(ids: PlanId[], planNames: Record<string, string>): string {
  const names = ids.map((id) => planNames[id] ?? id);
  return names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export function validateCoupon(rawCode: string, coupons: ProtoCoupon[], ctx: CouponContext): CouponCheck {
  const code = rawCode.trim().toUpperCase();
  if (!code) return { ok: false, reason: "Enter a coupon code." };
  const coupon = coupons.find((c) => c.code.toUpperCase() === code);
  if (!coupon) return { ok: false, reason: `There's no coupon called ${code}. Check the spelling.` };
  if (daysBetween(ctx.today, coupon.validFrom) > 0) {
    return { ok: false, reason: `${coupon.code} isn't active yet — it starts on ${formatDate(coupon.validFrom)}.` };
  }
  if (coupon.validTo && daysBetween(coupon.validTo, ctx.today) > 0) {
    return { ok: false, reason: `${coupon.code} expired on ${formatDate(coupon.validTo)}.` };
  }
  if (coupon.orgIds && !coupon.orgIds.includes(ctx.orgId)) {
    return { ok: false, reason: `${coupon.code} is reserved for specific organisations and isn't available to yours.` };
  }
  if (!coupon.planIds.includes(ctx.planId)) {
    return { ok: false, reason: `${coupon.code} only works on ${planList(coupon.planIds, ctx.planNames)}.` };
  }
  if (coupon.interval !== "any" && coupon.interval !== ctx.cycle) {
    return { ok: false, reason: `${coupon.code} only works with ${coupon.interval} billing.` };
  }
  if (coupon.totalUses != null && ctx.usesSoFar >= coupon.totalUses) {
    return { ok: false, reason: `${coupon.code} has reached its usage limit.` };
  }
  if (coupon.oncePerOrg && ctx.orgRedeemed.map((c) => c.toUpperCase()).includes(coupon.code.toUpperCase())) {
    return { ok: false, reason: `Your organisation has already used ${coupon.code}.` };
  }
  return { ok: true, coupon };
}

export function couponDiscount(coupon: ProtoCoupon, amount: number): number {
  if (amount <= 0) return 0;
  if (coupon.kind === "percent") return Math.min(amount, round2((amount * coupon.value) / 100));
  return Math.min(amount, coupon.value);
}

export function describeCoupon(c: ProtoCoupon): string {
  const off = c.kind === "percent" ? `${c.value}% off` : `${formatINR(c.value)} off`;
  const span =
    c.duration === "first_payment"
      ? "the first payment"
      : c.duration === "forever"
        ? "every payment"
        : `the first ${c.durationCount ?? 1} payments`;
  return `${off} ${span}`;
}

/* ------------------------------------------------------- Price breakdown */

export interface Breakdown {
  planPrice: number;
  proration: Proration | null;
  /** Amount after the mid-cycle credit, before the coupon. */
  afterProration: number;
  couponDiscount: number;
  taxable: number;
  gst: GstSplit;
  total: number;
}

export function priceBreakdown(opts: {
  plan: ProtoPlan;
  cycle: Cycle;
  coupon?: ProtoCoupon | null;
  /** Upgrading mid-cycle from this plan. */
  upgradeFrom?: { plan: ProtoPlan; daysLeft: number; daysInCycle: number } | null;
  billingState: string;
}): Breakdown {
  const price = planPrice(opts.plan, opts.cycle);
  const proration = opts.upgradeFrom
    ? prorate(price, planPrice(opts.upgradeFrom.plan, opts.cycle), opts.upgradeFrom.daysLeft, opts.upgradeFrom.daysInCycle)
    : null;
  const afterProration = proration ? proration.charge : price;
  const discount = opts.coupon ? couponDiscount(opts.coupon, afterProration) : 0;
  const taxable = round2(afterProration - discount);
  const gst = splitGst(taxable, opts.billingState);
  return {
    planPrice: price,
    proration,
    afterProration,
    couponDiscount: discount,
    taxable,
    gst,
    total: round2(taxable + gst.total),
  };
}

/* ------------------------------------------------------------- Indian states */

/** GST state / UT codes (the first two characters of a GSTIN) — same list as the backend. */
export const INDIAN_STATES: { name: string; code: string }[] = [
  { name: "Andaman and Nicobar Islands", code: "35" },
  { name: "Andhra Pradesh", code: "37" },
  { name: "Arunachal Pradesh", code: "12" },
  { name: "Assam", code: "18" },
  { name: "Bihar", code: "10" },
  { name: "Chandigarh", code: "04" },
  { name: "Chhattisgarh", code: "22" },
  { name: "Dadra and Nagar Haveli and Daman and Diu", code: "26" },
  { name: "Delhi", code: "07" },
  { name: "Goa", code: "30" },
  { name: "Gujarat", code: "24" },
  { name: "Haryana", code: "06" },
  { name: "Himachal Pradesh", code: "02" },
  { name: "Jammu and Kashmir", code: "01" },
  { name: "Jharkhand", code: "20" },
  { name: "Karnataka", code: "29" },
  { name: "Kerala", code: "32" },
  { name: "Ladakh", code: "38" },
  { name: "Lakshadweep", code: "31" },
  { name: "Madhya Pradesh", code: "23" },
  { name: "Maharashtra", code: "27" },
  { name: "Manipur", code: "14" },
  { name: "Meghalaya", code: "17" },
  { name: "Mizoram", code: "15" },
  { name: "Nagaland", code: "13" },
  { name: "Odisha", code: "21" },
  { name: "Puducherry", code: "34" },
  { name: "Punjab", code: "03" },
  { name: "Rajasthan", code: "08" },
  { name: "Sikkim", code: "11" },
  { name: "Tamil Nadu", code: "33" },
  { name: "Telangana", code: "36" },
  { name: "Tripura", code: "16" },
  { name: "Uttar Pradesh", code: "09" },
  { name: "Uttarakhand", code: "05" },
  { name: "West Bengal", code: "19" },
  { name: "Other Territory", code: "97" },
];

/** "29" → "Karnataka"; unknown codes come back as given. */
export function stateName(code: string | null | undefined): string {
  if (!code) return "";
  return INDIAN_STATES.find((s) => s.code === code)?.name ?? code;
}

/** Accepts a code ("29") or a name ("Karnataka"); returns the code, or null. */
export function stateCodeOf(value: string | null | undefined): string | null {
  const v = (value ?? "").trim();
  if (!v) return null;
  const hit = INDIAN_STATES.find((s) => s.code === v || s.name.toLowerCase() === v.toLowerCase());
  return hit?.code ?? null;
}

const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

/** Returns an error message, or null when the GSTIN is empty (optional) or valid. `state` is a GST state code. */
export function checkGstin(raw: string | null | undefined, state: string | null | undefined): string | null {
  const gstin = (raw ?? "").trim().toUpperCase();
  if (!gstin) return null;
  if (gstin.length !== 15) return "A GSTIN has 15 characters.";
  if (!GSTIN_RE.test(gstin)) return "That doesn't look like a GSTIN (format: 29ABCDE1234F1Z5).";
  const code = stateCodeOf(state);
  if (code && gstin.slice(0, 2) !== code) {
    return `This GSTIN is registered in state code ${gstin.slice(0, 2)}, but the state chosen is ${stateName(code)} (${code}).`;
  }
  return null;
}
