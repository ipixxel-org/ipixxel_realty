import { Prisma, type PrismaClient } from '@prisma/client';

/**
 * Scheduled plan changes (to Basic, or a smaller plan / yearly → monthly) are
 * recorded in package_change_requests as kind 'scheduled_change' so they show
 * in Settings → Billing → Requests. No approval: a row is `scheduled`, then
 * `done` (it took effect), `undone` ("Keep <plan>") or `replaced` (an upgrade,
 * renewal or another change superseded it). Never `pending` (no approval),
 * but while one is scheduled other plan changes are refused with
 * `change_scheduled` (scheduledChangeBlock) until it takes effect or is
 * undone. A closed row has its date in reviewed_at.
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
  /** "Choose what stays" for the plan (whatStaysFor); null when everything fits. */
  whatStays?: Prisma.InputJsonValue | object | null;
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
      whatStays: input.whatStays ?? undefined,
    },
  });
}

/**
 * Close the org's open scheduled change. `outcome` is 'undone' / 'replaced',
 * or the plan the org has just moved to: `done` when that's the change it
 * scheduled, otherwise `replaced`. `applied` works out "choose what stays"
 * as it's being applied (whatStaysFor(…, applied = true)); only called for a
 * `done` row, and stored on it.
 */
export async function closeScheduledChange(
  db: ScheduledDb,
  orgId: string,
  outcome: 'undone' | 'replaced' | { planId: string; interval: string },
  now: Date = new Date(),
  applied?: () => Promise<unknown>,
): Promise<void> {
  if (!db.packageChangeRequest) return;
  const open = await db.packageChangeRequest.findMany({
    where: { orgId, kind: SCHEDULED_CHANGE, status: 'scheduled' },
    select: {
      id: true,
      targetPlanId: true,
      billingCycle: true,
      whatStays: true,
    },
  });
  for (const row of open) {
    const status =
      typeof outcome === 'string'
        ? outcome
        : row.targetPlanId === outcome.planId &&
            row.billingCycle === outcome.interval
          ? 'done'
          : 'replaced';
    // Taking effect: its copy of "choose what stays" is what was applied.
    const copy =
      status !== 'done'
        ? undefined
        : applied
          ? await applied()
          : row.whatStays && typeof row.whatStays === 'object'
            ? { ...row.whatStays, applied: true }
            : undefined;
    await db.packageChangeRequest.updateMany({
      where: { id: row.id, status: 'scheduled' },
      data: {
        status,
        reviewedAt: now,
        ...(copy !== undefined ? { whatStays: copy ?? Prisma.DbNull } : {}),
      },
    });
  }
}

/** "25 Nov 2026" (UTC calendar day, like the UI's formatDate). */
const longDay = (d: Date) =>
  d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });

/**
 * The one "a change is scheduled" message (API and UI say the same):
 * "You've scheduled a change to Basic on 25 Nov 2026. Click 'Keep Starter'
 * to undo it before choosing another plan."
 */
export function scheduledChangeMessage(
  currentPlan: string,
  targetPlan: string,
  startsAt: Date | null | undefined,
): string {
  const on = startsAt ? ` on ${longDay(startsAt)}` : '';
  return `You've scheduled a change to ${targetPlan}${on}. Click 'Keep ${currentPlan}' to undo it before choosing another plan.`;
}

/**
 * The refusal message while a change to Basic or a smaller plan is
 * scheduled on this subscription, or null. Renewals, "Keep <plan>" and
 * "choose what stays" stay allowed: callers check this only before a new
 * plan change (checkout, change request, scheduling another change).
 */
export async function scheduledChangeBlock(
  db: Pick<PrismaClient, 'plan'>,
  sub: {
    status: string;
    cancelAtPeriodEnd: boolean;
    scheduledPlanId: string | null;
    renewsAt: Date | null;
    graceEndsAt: Date | null;
    plan: { name: string };
  } | null,
): Promise<string | null> {
  if (!sub || (!sub.cancelAtPeriodEnd && !sub.scheduledPlanId)) return null;
  if (sub.cancelAtPeriodEnd) {
    // The free plan (same lookup as findFreePlan; not imported to avoid a cycle).
    const free =
      (await db.plan.findFirst({
        where: { isSystem: true, isActive: true },
      })) ??
      (await db.plan.findFirst({
        where: { isActive: true, priceMonthly: 0, priceYearly: 0 },
        orderBy: { createdAt: 'asc' },
      }));
    return scheduledChangeMessage(
      sub.plan.name,
      free?.name ?? 'Basic',
      sub.status === 'past_due' ? sub.graceEndsAt : sub.renewsAt,
    );
  }
  const target = await db.plan.findUnique({
    where: { id: sub.scheduledPlanId! },
  });
  return scheduledChangeMessage(
    sub.plan.name,
    target?.name ?? 'a smaller plan',
    sub.renewsAt,
  );
}
