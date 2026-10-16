import type { Prisma } from '@prisma/client';
import { renewalsCoveredAfterFirst } from './coupon-rules';

type Tx = Pick<
  Prisma.TransactionClient,
  'subscription' | 'coupon' | 'couponRedemption'
>;

/** The checkout fields this needs (a BillingCheckout row fits). */
export interface SettledCheckout {
  id: string;
  organisationId: string;
  toPlanId: string;
  kind: 'new' | 'upgrade_same_interval' | 'interval_change' | 'renewal';
  couponId: string | null;
  couponDiscountPaise: number;
}

/**
 * After a checkout's plan change is applied (payment captured, ₹0
 * activation, or Super Admin approval), inside the same transaction:
 *  - record the redemption (once per checkout — the unique checkoutId);
 *  - keep the subscription's renewal coupon in step: a purchase attaches a
 *    first_n / forever coupon (or clears an old one); a renewal that used the
 *    attached coupon counts one renewal off it; a renewal that didn't (the
 *    smaller plan isn't covered) drops it.
 */
export async function settleCoupon(tx: Tx, c: SettledCheckout) {
  const sub = await tx.subscription.findFirst({
    where: { orgId: c.organisationId, status: { not: 'cancelled' } },
  });
  if (!sub) return;

  if (c.couponId && c.couponDiscountPaise > 0) {
    await tx.couponRedemption.upsert({
      where: { checkoutId: c.id },
      create: {
        couponId: c.couponId,
        organisationId: c.organisationId,
        checkoutId: c.id,
        planId: c.toPlanId,
        discountPaise: c.couponDiscountPaise,
      },
      update: {},
    });
  }

  let couponId: string | null = null;
  let left: number | null = null;
  if (c.kind === 'renewal') {
    if (c.couponId && sub.couponId === c.couponId) {
      left = sub.couponRenewalsLeft == null ? null : sub.couponRenewalsLeft - 1;
      couponId = left === null || left > 0 ? c.couponId : null;
    }
  } else if (c.couponId) {
    const coupon = await tx.coupon.findUnique({ where: { id: c.couponId } });
    const after = coupon ? renewalsCoveredAfterFirst(coupon) : 0;
    if (coupon && (after === null || after > 0)) {
      couponId = coupon.id;
      left = after;
    }
  }
  await tx.subscription.update({
    where: { id: sub.id },
    data: { couponId, couponRenewalsLeft: couponId ? left : null },
  });
}
