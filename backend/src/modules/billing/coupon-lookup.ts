import type { Coupon } from '@prisma/client';
import type { PrismaService } from '../../database/prisma.service';
import { checkCoupon } from './coupon-rules';

type Db = Pick<PrismaService, 'coupon' | 'couponRedemption'>;

/**
 * Look up an entered coupon and check it for this org, plan and interval —
 * the checkout's rules and wording (also used for a coupon the Super Admin
 * adds to a manual-mode request).
 */
export async function findCouponFor(
  db: Db,
  code: string,
  ctx: {
    orgId: string;
    planId: string;
    interval: 'monthly' | 'yearly';
    now: Date;
    plans: { id: string; name: string }[];
  },
): Promise<{ coupon: Coupon } | { error: string }> {
  const coupon = await db.coupon.findUnique({ where: { code } });
  if (!coupon) {
    return { error: `There's no coupon called ${code}. Check the spelling.` };
  }
  const redeemers = await db.couponRedemption.findMany({
    where: { couponId: coupon.id },
    select: { organisationId: true },
    distinct: ['organisationId'],
  });
  const check = checkCoupon(coupon, {
    now: ctx.now,
    orgId: ctx.orgId,
    planId: ctx.planId,
    interval: ctx.interval,
    planNames: Object.fromEntries(ctx.plans.map((p) => [p.id, p.name])),
    usesSoFar: redeemers.length,
    orgHasUsed: redeemers.some((r) => r.organisationId === ctx.orgId),
  });
  return check.ok ? { coupon } : { error: check.reason };
}
