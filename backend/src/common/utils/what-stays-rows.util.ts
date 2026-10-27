import type { PrismaClient } from '@prisma/client';

// Which package change rows "choose what stays" can still change. No service
// imports here, so package-change-requests and billing can both use it.

/** A request / scheduled change the org can still change what stays for. */
export const OPEN_REQUEST_STATUSES = ['pending', 'scheduled'] as const;
/** A request / scheduled change that was applied (the org moved to its plan). */
export const APPLIED_REQUEST_STATUSES = ['approved', 'done'] as const;

/**
 * The applied request (approved request, or scheduled change done) that put
 * the org on its current plan: the latest applied one to that plan. Super
 * Admin can still change what stays on it (applied at once); older applied
 * rows are history.
 */
export async function currentPlanRequestId(
  db: Pick<PrismaClient, 'subscription' | 'packageChangeRequest'>,
  orgId: string,
): Promise<string | null> {
  const sub = await db.subscription.findFirst({
    where: { orgId, status: { not: 'cancelled' } },
    select: { planId: true },
  });
  if (!sub) return null;
  const latest = await db.packageChangeRequest.findFirst({
    where: { orgId, status: { in: [...APPLIED_REQUEST_STATUSES] } },
    orderBy: [{ reviewedAt: 'desc' }, { createdAt: 'desc' }],
    select: { id: true, targetPlanId: true },
  });
  return latest?.targetPlanId === sub.planId ? latest.id : null;
}

/** Super Admin can change what stays on this row: open, or the current plan's. */
export function adminCanEditWhatStays(
  row: { id: string; status: string },
  currentId: string | null,
): boolean {
  return (
    (OPEN_REQUEST_STATUSES as readonly string[]).includes(row.status) ||
    row.id === currentId
  );
}

export const WHAT_STAYS_OLD_REQUEST_MESSAGE =
  "Only an open request's choice, or the one for the organisation's current plan, can be changed.";
