import type { PrismaClient } from '@prisma/client';

// "Choose what stays" lives in ONE place: the org's latest package change row
// (newest request or scheduled change, whatever its status). Every row with a
// what-stays record can be viewed; older rows show their stored copy as
// history and can never be edited. No service imports here, so
// package-change-requests and billing can both use it.

/** A request / scheduled change that hasn't been decided or taken effect yet. */
export const OPEN_REQUEST_STATUSES = ['pending', 'scheduled'] as const;
/** A request / scheduled change that was applied (the org moved to its plan). */
export const APPLIED_REQUEST_STATUSES = ['approved', 'done'] as const;

export const WHAT_STAYS_NOT_LATEST_MESSAGE =
  "Only the latest request's choice of what stays can be changed. Older requests are history.";

type RowsDb = Pick<PrismaClient, 'subscription' | 'packageChangeRequest'>;
type Row = { id: string; status: string; targetPlanId: string };

const isOpen = (status: string) =>
  (OPEN_REQUEST_STATUSES as readonly string[]).includes(status);
const isApplied = (status: string) =>
  (APPLIED_REQUEST_STATUSES as readonly string[]).includes(status);
const time = (d: Date | null | undefined) => (d ? new Date(d).getTime() : 0);

/** The org's latest row: the newest request or scheduled change, any status. */
export async function latestRequest(
  db: Pick<PrismaClient, 'packageChangeRequest'>,
  orgId: string,
): Promise<Row | null> {
  const rows = await db.packageChangeRequest.findMany({
    where: { orgId },
    select: {
      id: true,
      status: true,
      targetPlanId: true,
      createdAt: true,
    },
  });
  const [latest] = rows.sort((a, b) => time(b.createdAt) - time(a.createdAt));
  return latest
    ? {
        id: latest.id,
        status: latest.status,
        targetPlanId: latest.targetPlanId,
      }
    : null;
}

/** The plan the org is on now (null without a subscription). */
export async function currentPlanId(
  db: Pick<PrismaClient, 'subscription'>,
  orgId: string,
): Promise<string | null> {
  const sub = await db.subscription.findFirst({
    where: { orgId, status: { not: 'cancelled' } },
    select: { planId: true },
  });
  return sub?.planId ?? null;
}

/**
 * Super Admin can change what stays on this row: it's the latest, and still
 * open (pending / scheduled — the planned choice) or applied with the org on
 * its plan (applied at once). Rejected / withdrawn / undone / replaced: no.
 */
export function adminWhatStaysEditable(
  row: Row,
  latestId: string | null,
  planId: string | null,
): boolean {
  if (row.id !== latestId) return false;
  return (
    isOpen(row.status) || (isApplied(row.status) && row.targetPlanId === planId)
  );
}

/**
 * The org's button on its Requests tab, for every row with a what-stays
 * record: "Change what stays" on the latest row while it's open, "View"
 * otherwise (the live state for the latest applied row, history for older
 * rows).
 */
export function orgWhatStaysAction(
  row: { id: string; status: string; whatStays: unknown },
  latestId: string | null,
): 'change' | 'view' | null {
  if (!row.whatStays) return null;
  return row.id === latestId && isOpen(row.status) ? 'change' : 'view';
}

/**
 * Whether a row put the org on its current plan: the latest applied row (by
 * when it was written — updated_at, the database clock; reviewed_at follows
 * the testing clock) is for the current plan. When not (plan assigned
 * directly), Super Admin edits the current plan from the org page instead.
 */
export async function currentPlanSetByRow(
  db: RowsDb,
  orgId: string,
): Promise<boolean> {
  const planId = await currentPlanId(db, orgId);
  if (!planId) return false;
  const applied = await db.packageChangeRequest.findMany({
    where: { orgId, status: { in: [...APPLIED_REQUEST_STATUSES] } },
    select: { id: true, targetPlanId: true, updatedAt: true },
  });
  const [latest] = applied.sort(
    (a, b) => time(b.updatedAt) - time(a.updatedAt),
  );
  return latest?.targetPlanId === planId;
}

/**
 * Where Super Admin changes what stays for this org — ONE place, so the
 * org-page button and the latest row's button never both show:
 * - `latestEditable`: the latest row (open, or applied with the org on its
 *   plan) — its button is the only one;
 * - `orgLevel`: otherwise, and only when no row set the current plan (plan
 *   assigned directly, moved to Basic with no row) — the org-page button.
 */
export interface WhatStaysPlace {
  latestId: string | null;
  planId: string | null;
  latestEditable: boolean;
  orgLevel: boolean;
}

export async function whatStaysPlace(
  db: RowsDb,
  orgId: string,
): Promise<WhatStaysPlace> {
  const [latest, planId] = await Promise.all([
    latestRequest(db, orgId),
    currentPlanId(db, orgId),
  ]);
  const latestEditable =
    !!latest && adminWhatStaysEditable(latest, latest.id, planId);
  return {
    latestId: latest?.id ?? null,
    planId,
    latestEditable,
    orgLevel:
      !latestEditable && !!planId && !(await currentPlanSetByRow(db, orgId)),
  };
}

export { isApplied as isAppliedStatus, isOpen as isOpenStatus };
