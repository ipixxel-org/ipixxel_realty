/**
 * Billing v2 plan versions.
 *
 * The plans row always holds the latest price, limits and features
 * (capabilities); billing.plan_versions keeps a snapshot per version. Saving a
 * change to any of those creates the next version. An org keeps the version
 * it bought (subscriptions.plan_version_id) until its next renewal, so every
 * read of "the org's plan" goes through effectivePlan(): the plan row with the
 * org's version laid over it.
 *
 * Versions are always recorded, but only applied with BILLING_V2 on the
 * server; with it off every org follows the latest values, as before.
 */
import type { PlanVersion, PrismaClient } from '@prisma/client';
import { isBillingV2Server } from './billing-clock.util';

/** What a version holds. */
export interface PlanTerms {
  priceMonthly: number;
  priceYearly: number;
  limits: unknown;
  capabilities: unknown;
}

/** Capabilities that read as ON when the key is missing (see plan-modules.ts). */
const ON_BY_DEFAULT = new Set(['teamChat', 'metaLeadAds']);

const asObject = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};

/** A limit as it's enforced: a whole number, or null for unlimited. */
function limitValue(raw: unknown): number | null {
  if (typeof raw === 'number')
    return Number.isFinite(raw) && raw >= 0 ? raw : null;
  if (typeof raw === 'string') {
    const n = parseInt(raw, 10);
    return Number.isNaN(n) || n < 0 ? null : n;
  }
  return null;
}

function sameLimits(a: unknown, b: unknown): boolean {
  const x = asObject(a);
  const y = asObject(b);
  const keys = new Set([...Object.keys(x), ...Object.keys(y)]);
  for (const k of keys) if (limitValue(x[k]) !== limitValue(y[k])) return false;
  return true;
}

function sameCapabilities(a: unknown, b: unknown): boolean {
  const x = asObject(a);
  const y = asObject(b);
  const on = (o: Record<string, unknown>, k: string) =>
    o[k] === undefined ? ON_BY_DEFAULT.has(k) : o[k] === true;
  const keys = new Set([...Object.keys(x), ...Object.keys(y)]);
  for (const k of keys) if (on(x, k) !== on(y, k)) return false;
  return true;
}

/**
 * Same price, limits and features — so no new version. Compares what's
 * enforced, not the stored JSON: reordered keys, "3" vs 3, or a missing key
 * vs its default don't count as a change.
 */
export function sameTerms(a: PlanTerms, b: PlanTerms): boolean {
  return (
    a.priceMonthly === b.priceMonthly &&
    a.priceYearly === b.priceYearly &&
    sameLimits(a.limits, b.limits) &&
    sameCapabilities(a.capabilities, b.capabilities)
  );
}

/** Versions are applied only with billing v2 on the server. */
export function planVersionsApplied(): boolean {
  return isBillingV2Server();
}

/** Any client or transaction; old test mocks without the table are tolerated. */
type VersionDb = {
  planVersion?: Pick<PrismaClient['planVersion'], 'findFirst' | 'create'>;
  plan?: Pick<PrismaClient['plan'], 'findUnique'>;
};

/** The plan's newest version, or null (none recorded yet). */
export function latestPlanVersion(
  db: VersionDb,
  planId: string,
): Promise<PlanVersion | null> {
  if (!db.planVersion) return Promise.resolve(null);
  return db.planVersion.findFirst({
    where: { planId },
    orderBy: { version: 'desc' },
  });
}

/**
 * Make sure the plan's newest version matches its current values: returns it
 * when it does, otherwise creates the next version (v1 when there is none).
 * Called after every plan save, and before pointing a subscription at the
 * latest version (so a plan from before the migration still gets a v1).
 */
export async function ensureLatestPlanVersion(
  db: VersionDb,
  plan: PlanTerms & { id: string },
  createdById: string | null = null,
): Promise<PlanVersion | null> {
  if (!db.planVersion) return null;
  const latest = await latestPlanVersion(db, plan.id);
  if (latest && sameTerms(latest, plan)) return latest;
  try {
    return await db.planVersion.create({
      data: {
        planId: plan.id,
        version: (latest?.version ?? 0) + 1,
        priceMonthly: plan.priceMonthly,
        priceYearly: plan.priceYearly,
        limits: plan.limits ?? undefined,
        capabilities: plan.capabilities ?? {},
        createdById,
      },
    });
  } catch (e) {
    // Two saves at once: the other one made this version number.
    if ((e as { code?: string }).code === 'P2002')
      return latestPlanVersion(db, plan.id);
    throw e;
  }
}

/** The id of the plan's latest version, for a subscription moving onto it. */
export async function latestPlanVersionId(
  db: VersionDb,
  planId: string,
): Promise<string | null> {
  if (!db.planVersion || !db.plan?.findUnique) return null;
  const plan = await db.plan.findUnique({ where: { id: planId } });
  if (!plan) return null;
  return (await ensureLatestPlanVersion(db, plan))?.id ?? null;
}

/**
 * The plan as the org has it: the plan row with the org's version's price,
 * limits and features laid over it. The latest values when there's no
 * version, it belongs to another plan, or versions aren't applied (flag off).
 */
export function effectivePlan<P extends PlanTerms & { id?: string }>(
  plan: P,
  version:
    (PlanTerms & { planId: string; version?: number }) | null | undefined,
): P {
  if (!plan || !version || !planVersionsApplied()) return plan;
  if (plan.id !== undefined && version.planId !== plan.id) return plan;
  return {
    ...plan,
    priceMonthly: version.priceMonthly,
    priceYearly: version.priceYearly,
    limits: version.limits,
    capabilities: version.capabilities,
  };
}

/** Include for a subscription read that needs the org's plan. */
export const SUB_PLAN_INCLUDE = { plan: true, planVersion: true } as const;

/** A subscription read with SUB_PLAN_INCLUDE, its `plan` replaced by effectivePlan(). */
export function withEffectivePlan<
  S extends
    | {
        plan?: (PlanTerms & { id?: string }) | null;
        planVersion?: (PlanTerms & { planId: string }) | null;
      }
    | null
    | undefined,
>(sub: S): S {
  if (!sub || !sub.plan) return sub;
  return { ...sub, plan: effectivePlan(sub.plan, sub.planVersion) };
}
