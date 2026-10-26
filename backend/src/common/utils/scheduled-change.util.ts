import type { PrismaClient } from '@prisma/client';

/**
 * Scheduled plan changes (to Basic, or a smaller plan / yearly → monthly) are
 * recorded in package_change_requests as kind 'scheduled_change' so they show
 * in Settings → Billing → Requests. No approval: a row is `scheduled`, then
 * `done` (it took effect), `undone` ("Keep <plan>") or `replaced` (an upgrade,
 * renewal or another change superseded it). Never `pending`, so it never
 * blocks anything. A closed row has its date in reviewed_at.
 */
type ScheduledDb = Partial<Pick<PrismaClient, 'packageChangeRequest'>>;

export const SCHEDULED_CHANGE = 'scheduled_change' as const;

export interface ScheduledChangeInput {
  orgId: string;
  requestedById: string;
  fromPlanId: string;
  toPlanId: string;
  interval: 'monthly' | 'yearly';
  /** When it applies (end of the term, or of grace). */
  startsAt: Date | null;
  reason?: string | null;
  /** The smaller plan's price from then (rupees, before GST); null for Basic. */
  amount: number | null;
  now?: Date;
}

/** Record a newly scheduled change; an older open one is replaced by it. */
export async function recordScheduledChange(
  db: ScheduledDb,
  input: ScheduledChangeInput,
): Promise<void> {
  if (!db.packageChangeRequest) return;
  const now = input.now ?? new Date();
  await closeScheduledChange(db, input.orgId, 'replaced', now);
  await db.packageChangeRequest.create({
    data: {
      orgId: input.orgId,
      requestedById: input.requestedById,
      currentPlanId: input.fromPlanId,
      targetPlanId: input.toPlanId,
      billingCycle: input.interval,
      kind: SCHEDULED_CHANGE,
      status: 'scheduled',
      reason: input.reason ?? null,
      startsAt: input.startsAt ?? now,
      scheduledAmount: input.amount,
    },
  });
}

/**
 * Close the org's open scheduled change. `outcome` is 'undone' / 'replaced',
 * or the plan the org has just moved to: `done` when that's the change it
 * scheduled, otherwise `replaced`.
 */
export async function closeScheduledChange(
  db: ScheduledDb,
  orgId: string,
  outcome: 'undone' | 'replaced' | { planId: string; interval: string },
  now: Date = new Date(),
): Promise<void> {
  if (!db.packageChangeRequest) return;
  const open = await db.packageChangeRequest.findMany({
    where: { orgId, kind: SCHEDULED_CHANGE, status: 'scheduled' },
    select: { id: true, targetPlanId: true, billingCycle: true },
  });
  for (const row of open) {
    const status =
      typeof outcome === 'string'
        ? outcome
        : row.targetPlanId === outcome.planId &&
            row.billingCycle === outcome.interval
          ? 'done'
          : 'replaced';
    await db.packageChangeRequest.updateMany({
      where: { id: row.id, status: 'scheduled' },
      data: { status, reviewedAt: now },
    });
  }
}
