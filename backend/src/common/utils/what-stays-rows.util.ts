import type { PrismaClient } from '@prisma/client';

// Which package change rows "choose what stays" can still change. No service
// imports here, so package-change-requests and billing can both use it.

/** A request / scheduled change the org can still change what stays for. */
export const OPEN_REQUEST_STATUSES = ['pending', 'scheduled'] as const;
/** A request / scheduled change that was applied (the org moved to its plan). */
export const APPLIED_REQUEST_STATUSES = ['approved', 'done'] as const;

/**
 * The row that put the org on its current plan: the latest row whose change
 * actually took effect (an approved request, or a scheduled change that's
 * done), when its plan is the org's current plan — else none (the plan was
 * set some other way, e.g. by Super Admin or a payment; the org-level
 * "Change what stays" covers that). Super Admin can still change what stays
 * on it (applied at once); older applied rows are history.
 *
 * "Latest" is when the row was last written (updated_at, the database
 * clock): an applied row is only written again when it's applied or when
 * Super Admin edits this same row. reviewed_at can't be used — approvals
 * take it from billingNow(), which BILLING_CLOCK_OVERRIDE moves in testing.
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
  const applied = await db.packageChangeRequest.findMany({
    where: { orgId, status: { in: [...APPLIED_REQUEST_STATUSES] } },
    select: { id: true, targetPlanId: true, updatedAt: true },
  });
  const time = (d: Date | null | undefined) => (d ? new Date(d).getTime() : 0);
  const latest = applied.sort(
    (a, b) => time(b.updatedAt) - time(a.updatedAt),
  )[0];
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
