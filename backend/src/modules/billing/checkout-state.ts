/**
 * Small checkout queries shared by the overview, the checkout service and the
 * lifecycle sweeper. Plain functions over Prisma so the sweeper (another
 * module) can call them without a Nest dependency.
 */
import type { PrismaClient } from '@prisma/client';
import type { PendingUpgradeV2 } from './billing.types';

type Db = Pick<PrismaClient, 'billingCheckout' | 'packageChangeRequest'>;

/**
 * Online checkouts left unpaid past expiresAt become `expired`. Called lazily
 * (overview, start checkout) and by the hourly lifecycle sweep. A payment that
 * still arrives later is handled: fulfilment accepts an expired checkout as
 * long as the quote still matches the org's plan.
 */
export async function expireStaleCheckouts(
  db: Db,
  orgId?: string,
  now = new Date(),
): Promise<number> {
  const { count } = await db.billingCheckout.updateMany({
    where: {
      ...(orgId ? { organisationId: orgId } : {}),
      status: 'pending',
      mode: 'online',
      expiresAt: { lt: now },
    },
    data: { status: 'expired' },
  });
  return count;
}

/**
 * What the org is waiting on: a pending upgrade request (billing v2 or an
 * older one), else a paid checkout a Super Admin must review.
 */
export async function findPendingUpgrade(
  db: Db,
  orgId: string,
): Promise<PendingUpgradeV2 | null> {
  const request = await db.packageChangeRequest.findFirst({
    where: { orgId, status: 'pending' },
    orderBy: { createdAt: 'desc' },
    include: {
      targetPlan: { select: { id: true, name: true } },
      billingCheckout: { select: { id: true } },
    },
  });
  if (request) {
    return {
      status: 'pending_approval',
      requestId: request.id,
      checkoutId: request.billingCheckout?.id ?? null,
      toPlan: request.targetPlan,
      interval: request.billingCycle,
      createdAt: request.createdAt.toISOString(),
    };
  }
  const review = await db.billingCheckout.findFirst({
    where: { organisationId: orgId, status: 'needs_review' },
    orderBy: { updatedAt: 'desc' },
    include: { toPlan: { select: { id: true, name: true } } },
  });
  if (!review) return null;
  return {
    status: 'needs_review',
    requestId: review.packageChangeRequestId,
    checkoutId: review.id,
    toPlan: review.toPlan,
    interval: review.toInterval,
    createdAt: review.createdAt.toISOString(),
  };
}
