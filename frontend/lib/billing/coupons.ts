/** Coupon status rule shared by the mock client and the backend contract. Pure. */
import { daysBetween } from "./pricing";
import type { Coupon, CouponStatus } from "./types";

export function couponStatusFor(c: Coupon, uses: number, today: string): CouponStatus {
  if (daysBetween(today, c.validFrom) > 0) return "scheduled";
  if (c.validTo && daysBetween(c.validTo, today) > 0) return "expired";
  if (c.totalUses != null && uses >= c.totalUses) return "used_up";
  return "active";
}
