/**
 * Manual mode: a coupon the Super Admin adds to a pending request. The
 * request's checkout is re-quoted with the same maths as checkout: the
 * coupon comes off the price before GST (after any proration credit), then
 * GST is worked out again on what's left. Pure; money is integer paise.
 */
import { splitGstPaise, toRupees } from './checkout-quote';
import { couponDiscountPaise, type CouponRule } from './coupon-rules';
import type { RequestQuoteV2 } from './billing.types';

/** The checkout amounts a coupon changes (a BillingCheckout row fits). */
export interface CheckoutAmounts {
  couponId: string | null;
  couponDiscountPaise: number;
  taxablePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  totalPaise: number;
}

export function amountsOf(c: CheckoutAmounts): CheckoutAmounts {
  return {
    couponId: c.couponId,
    couponDiscountPaise: c.couponDiscountPaise,
    taxablePaise: c.taxablePaise,
    cgstPaise: c.cgstPaise,
    sgstPaise: c.sgstPaise,
    igstPaise: c.igstPaise,
    totalPaise: c.totalPaise,
  };
}

/**
 * CGST + SGST (same state) or IGST, as the request was quoted. A quote with
 * no GST at all (₹0) falls back to comparing the buyer and seller states.
 */
export function isIntraState(
  c: CheckoutAmounts & { buyerState: string; sellerSnapshot: unknown },
): boolean {
  if (c.cgstPaise + c.sgstPaise + c.igstPaise > 0) return c.cgstPaise > 0;
  const seller = (c.sellerSnapshot ?? {}) as { state?: string | null };
  return !!c.buyerState && !!seller.state && c.buyerState === seller.state;
}

/**
 * The request's amounts with this coupon instead of whatever coupon the
 * original quote had (one coupon at a time, as in checkout).
 */
export function requoteWithCoupon(
  original: CheckoutAmounts,
  coupon: Pick<CouponRule, 'id' | 'kind' | 'percentOff' | 'amountOffPaise'>,
  intra: boolean,
): CheckoutAmounts {
  const price = original.taxablePaise + original.couponDiscountPaise;
  const discount = couponDiscountPaise(coupon, price);
  const taxable = price - discount;
  const gst = splitGstPaise(taxable, intra);
  return {
    couponId: coupon.id,
    couponDiscountPaise: discount,
    taxablePaise: taxable,
    cgstPaise: gst.cgst,
    sgstPaise: gst.sgst,
    igstPaise: gst.igst,
    totalPaise: taxable + gst.cgst + gst.sgst + gst.igst,
  };
}

/** "₹1,499 − ₹300 coupon (CODE) + GST ₹215.82 = ₹1,414.82", as numbers. */
export function requestQuoteView(
  c: CheckoutAmounts & {
    coupon?: { code: string } | null;
    quoteBeforeCoupon?: unknown;
  },
): RequestQuoteV2 {
  return {
    price: toRupees(c.taxablePaise + c.couponDiscountPaise),
    couponCode: c.couponId ? (c.coupon?.code ?? null) : null,
    couponDiscount: toRupees(c.couponDiscountPaise),
    gst: toRupees(c.cgstPaise + c.sgstPaise + c.igstPaise),
    total: toRupees(c.totalPaise),
    couponAdded: c.quoteBeforeCoupon != null,
  };
}
