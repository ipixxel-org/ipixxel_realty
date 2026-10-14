import { describe, expect, it } from "vitest";
import { COUPONS, PLANS } from "../mock/data";
import {
  addMonths,
  checkGstin,
  couponDiscount,
  daysBetween,
  priceBreakdown,
  prorate,
  splitGst,
  stateCodeOf,
  stateName,
  validateCoupon,
  type CouponContext,
} from "../pricing";

const plan = (id: string) => PLANS.find((p) => p.id === id)!;
const coupon = (code: string) => COUPONS.find((c) => c.code === code)!;
const planNames = Object.fromEntries(PLANS.map((p) => [p.id, p.name]));

describe("dates", () => {
  it("counts days and adds months in UTC", () => {
    expect(daysBetween("2026-10-01", "2026-11-01")).toBe(31);
    expect(daysBetween("2026-10-14", "2026-11-01")).toBe(18);
    expect(addMonths("2026-10-01", 1)).toBe("2026-11-01");
    expect(addMonths("2026-04-01", 12)).toBe("2027-04-01");
  });
});

describe("prorate", () => {
  it("charges (new − old) × days left ÷ days in cycle", () => {
    const p = prorate(5000, 2000, 18, 31);
    expect(p.charge).toBe(1741.94);
    expect(p.credit).toBe(3258.06);
  });

  it("charges the full difference on the first day and nothing on the last", () => {
    expect(prorate(5000, 2000, 31, 31).charge).toBe(3000);
    expect(prorate(5000, 2000, 0, 31).charge).toBe(0);
  });

  it("never goes negative and clamps days left to the cycle", () => {
    expect(prorate(2000, 5000, 10, 31).charge).toBe(0);
    expect(prorate(5000, 2000, 40, 31).charge).toBe(3000);
  });

  it("rejects an empty cycle", () => {
    expect(() => prorate(5000, 2000, 1, 0)).toThrow();
  });
});

describe("splitGst", () => {
  it("splits CGST 9% + SGST 9% inside Karnataka", () => {
    expect(splitGst(5000, "Karnataka")).toEqual({ kind: "intra", cgst: 450, sgst: 450, igst: 0, total: 900 });
  });

  it("charges IGST 18% for other states", () => {
    expect(splitGst(5000, "Maharashtra")).toEqual({ kind: "inter", cgst: 0, sgst: 0, igst: 900, total: 900 });
  });

  it("matches the state case-insensitively and rounds each half to the paisa", () => {
    const g = splitGst(1741.94, " karnataka ");
    expect(g.kind).toBe("intra");
    expect(g.cgst).toBe(156.77);
    expect(g.total).toBe(313.54);
  });
});

describe("validateCoupon", () => {
  const ctx: CouponContext = {
    planId: "growth",
    planNames,
    cycle: "monthly",
    orgId: "org-new",
    today: "2026-10-14",
    orgRedeemed: [],
    usesSoFar: 0,
  };

  it("accepts a valid code, ignoring case and spaces", () => {
    expect(validateCoupon("  launch20 ", COUPONS, ctx).ok).toBe(true);
  });

  it("explains each way a code can be invalid", () => {
    const reason = (code: string, over: Partial<CouponContext> = {}) => {
      const r = validateCoupon(code, COUPONS, { ...ctx, ...over });
      return r.ok ? null : r.reason;
    };
    expect(reason("")).toMatch(/enter a coupon/i);
    expect(reason("NOPE")).toMatch(/no coupon called NOPE/);
    expect(reason("DIWALI25", { cycle: "yearly" })).toMatch(/expired on/);
    expect(reason("PARTNER100")).toMatch(/isn't available to yours/);
    expect(reason("LAUNCH20", { planId: "basic" })).toMatch(/only works on Growth and Pro/);
    expect(reason("LAUNCH20", { cycle: "yearly" })).toMatch(/only works with monthly billing/);
    expect(reason("PARTNER100", { orgId: "org-skyline", usesSoFar: 10 })).toMatch(/usage limit/);
    expect(reason("LAUNCH20", { orgRedeemed: ["LAUNCH20"] })).toMatch(/already used/);
  });

  it("is not yet valid before its start date", () => {
    const r = validateCoupon("PARTNER100", COUPONS, { ...ctx, orgId: "org-skyline", today: "2026-08-01" });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toMatch(/isn't active yet/);
  });
});

describe("couponDiscount", () => {
  it("applies percent and fixed discounts without going below zero", () => {
    expect(couponDiscount(coupon("LAUNCH20"), 2000)).toBe(400);
    expect(couponDiscount(coupon("FLAT500"), 2000)).toBe(500);
    expect(couponDiscount(coupon("FLAT500"), 300)).toBe(300);
    expect(couponDiscount(coupon("PARTNER100"), 5000)).toBe(5000);
  });
});

describe("priceBreakdown", () => {
  it("first purchase with a coupon: price − discount, then GST", () => {
    const b = priceBreakdown({ plan: plan("growth"), cycle: "monthly", coupon: coupon("LAUNCH20"), billingState: "Karnataka" });
    expect(b).toMatchObject({ planPrice: 2000, couponDiscount: 400, taxable: 1600, total: 1888 });
  });

  it("mid-cycle upgrade: prorated charge, then GST", () => {
    const b = priceBreakdown({
      plan: plan("pro"),
      cycle: "monthly",
      upgradeFrom: { plan: plan("growth"), daysLeft: 18, daysInCycle: 31 },
      billingState: "Karnataka",
    });
    expect(b.proration?.charge).toBe(1741.94);
    expect(b.total).toBe(2055.48);
  });

  it("a 100% coupon brings the total to zero", () => {
    expect(priceBreakdown({ plan: plan("pro"), cycle: "monthly", coupon: coupon("PARTNER100"), billingState: "Delhi" }).total).toBe(0);
  });
});

describe("checkGstin", () => {
  it("is optional, checks the format and the state code", () => {
    expect(checkGstin("", "Karnataka")).toBeNull();
    expect(checkGstin("29AABCS1234F1Z5", "Karnataka")).toBeNull();
    expect(checkGstin("29AABCS1234F1Z", "Karnataka")).toMatch(/15 characters/);
    expect(checkGstin("29AABCS1234F1X5", "Karnataka")).toMatch(/doesn't look like/);
    expect(checkGstin("29AABCS1234F1Z5", "Maharashtra")).toMatch(/state code 29/);
  });
});

describe("GST state codes", () => {
  it("maps names and codes both ways", () => {
    expect(stateCodeOf("29")).toBe("29");
    expect(stateCodeOf(" karnataka ")).toBe("29");
    expect(stateCodeOf("Atlantis")).toBeNull();
    expect(stateName("27")).toBe("Maharashtra");
    expect(stateName("97")).toBe("Other Territory");
  });

  it("splits GST by code, the way the API stores the state", () => {
    expect(splitGst(5000, "29").kind).toBe("intra");
    expect(splitGst(5000, "27").kind).toBe("inter");
    expect(splitGst(5000, null).kind).toBe("inter");
  });

  it("checks a GSTIN against a state code", () => {
    expect(checkGstin("29AABCS1234F1Z5", "29")).toBeNull();
    expect(checkGstin("29AABCS1234F1Z5", "27")).toMatch(/Maharashtra \(27\)/);
  });
});
