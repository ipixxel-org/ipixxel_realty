/**
 * Billing v2 plan mapping: Plan row ↔ BillingPlanV2.
 *
 * Team chat and Meta lead ads aren't in the capability catalog (the legacy
 * plan editor must look unchanged), so v2 keeps them as reserved keys:
 *   Plan.capabilities.teamChat / .metaLeadAds  (boolean)
 *   Plan.limits.metaPages                      (number | null = unlimited)
 * A missing key means "not configured yet" and reads as ON / unlimited —
 * neither feature is plan-gated today, so turning billing v2 on must not
 * silently take them away. PlansService.update() carries these keys over
 * when the legacy editor replaces the maps.
 */
import { resolveLimit } from '../../common/utils/plan-quota.util';
import type {
  BillingPlanV2,
  PlanLimitsV2,
  PlanModulesV2,
} from './billing.types';

export const V2_CAPABILITY_KEYS = ['teamChat', 'metaLeadAds'] as const;
export const V2_LIMIT_KEYS = ['metaPages'] as const;

export interface PlanRow {
  id: string;
  name: string;
  description: string | null;
  priceMonthly: number;
  priceYearly: number;
  limits: unknown;
  capabilities: unknown;
  isSystem: boolean;
  isActive: boolean;
  createdAt: Date;
}

const asObject = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};

const finiteOrNull = (n: number): number | null => (n === Infinity ? null : n);

/**
 * The free plan (Basic) is the platform's system plan — not any plan that
 * happens to cost ₹0. An internal ₹0 plan (e.g. "Demo" on staging) is a normal
 * plan: it can be edited and deleted, and it is never offered to organisations
 * (isInternalPlan).
 */
export function isFreePlan(
  plan: Pick<PlanRow, 'isSystem' | 'priceMonthly' | 'priceYearly'>,
): boolean {
  return plan.isSystem;
}

/** A ₹0 plan that isn't Basic: assigned by the Super Admin only, never offered or bought. */
export function isInternalPlan(
  plan: Pick<PlanRow, 'isSystem' | 'priceMonthly' | 'priceYearly'>,
): boolean {
  return !plan.isSystem && plan.priceMonthly === 0 && plan.priceYearly === 0;
}

export function planLimitsV2(plan: Pick<PlanRow, 'limits'>): PlanLimitsV2 {
  return {
    users: finiteOrNull(resolveLimit(plan, 'users')),
    projects: finiteOrNull(resolveLimit(plan, 'projects')),
    landingPages: finiteOrNull(resolveLimit(plan, 'landingPages')),
    templates: finiteOrNull(resolveLimit(plan, 'templates')),
  };
}

export function planModulesV2(
  plan: Pick<PlanRow, 'capabilities' | 'limits'>,
): PlanModulesV2 {
  const caps = asObject(plan.capabilities);
  const limits = asObject(plan.limits);
  const metaLeadAds =
    caps.metaLeadAds === undefined ? true : caps.metaLeadAds === true;
  const pages = limits.metaPages;
  return {
    teamChat: caps.teamChat === undefined ? true : caps.teamChat === true,
    metaLeadAds,
    metaPages: !metaLeadAds
      ? 0
      : typeof pages === 'number' && Number.isFinite(pages) && pages >= 0
        ? Math.floor(pages)
        : null,
    whatsapp: caps.whatsappIntegration === true,
    aiCalling: false,
  };
}

type RankRow = Pick<
  PlanRow,
  'id' | 'isSystem' | 'isActive' | 'priceMonthly' | 'priceYearly' | 'createdAt'
>;

function comparePlans(a: RankRow, b: RankRow): number {
  return (
    Number(isFreePlan(b)) - Number(isFreePlan(a)) ||
    a.priceMonthly - b.priceMonthly ||
    a.createdAt.getTime() - b.createdAt.getTime()
  );
}

/** Free plan first, then by monthly price, then age. */
export function sortPlans<T extends RankRow>(plans: T[]): T[] {
  return [...plans].sort(comparePlans);
}

/**
 * The ONE rank rule (upgrade vs downgrade): a plan's position among the plans
 * organisations can pick — active and not internal — in sortPlans order, so
 * Basic is 0 and every screen and endpoint agrees with GET /org/billing/plans.
 * A plan that isn't offered (internal ₹0 or archived) sits halfway between its
 * neighbours (e.g. 0.5), so it never ties with an offered plan.
 */
export function planRanker(plans: RankRow[]): (plan: RankRow) => number {
  const offered = sortPlans(
    plans.filter((p) => p.isActive && !isInternalPlan(p)),
  );
  return (plan) => {
    const i = offered.findIndex((p) => p.id === plan.id);
    if (i !== -1) return i;
    return offered.filter((p) => comparePlans(p, plan) < 0).length - 0.5;
  };
}

export type PlanChangeDirection = 'upgrade' | 'downgrade' | 'same';

/**
 * Upgrade or downgrade, by rank. Same plan: monthly → yearly is an upgrade,
 * yearly → monthly a downgrade. Mirrored in frontend lib/billing/direction.ts.
 */
export function planChangeDirection(
  from: { rank: number; interval: 'monthly' | 'yearly' },
  to: { rank: number; interval: 'monthly' | 'yearly' },
): PlanChangeDirection {
  if (to.rank !== from.rank)
    return to.rank > from.rank ? 'upgrade' : 'downgrade';
  if (to.interval === from.interval) return 'same';
  return to.interval === 'yearly' ? 'upgrade' : 'downgrade';
}

export function toBillingPlan(plan: PlanRow, rank: number): BillingPlanV2 {
  return {
    id: plan.id,
    name: plan.name,
    tagline: plan.description ?? '',
    priceMonthly: plan.priceMonthly,
    priceYearly: plan.priceYearly,
    isFree: isFreePlan(plan),
    isActive: plan.isActive,
    rank,
    limits: planLimitsV2(plan),
    modules: planModulesV2(plan),
  };
}

export function toBillingPlans(plans: PlanRow[]): BillingPlanV2[] {
  const rank = planRanker(plans);
  return sortPlans(plans).map((p) => toBillingPlan(p, rank(p)));
}

/**
 * Legacy plan saves replace `limits` / `capabilities` wholesale with
 * catalog-only maps; keep the v2-only keys from the stored row.
 */
export function carryV2Keys(
  stored: { limits: unknown; capabilities: unknown },
  next: {
    limits?: Record<string, unknown>;
    capabilities?: Record<string, unknown>;
  },
) {
  const out: {
    limits?: Record<string, unknown>;
    capabilities?: Record<string, unknown>;
  } = {};
  if (next.limits) {
    const old = asObject(stored.limits);
    out.limits = { ...next.limits };
    for (const k of V2_LIMIT_KEYS)
      if (k in old && !(k in out.limits)) out.limits[k] = old[k];
  }
  if (next.capabilities) {
    const old = asObject(stored.capabilities);
    out.capabilities = { ...next.capabilities };
    for (const k of V2_CAPABILITY_KEYS)
      if (k in old && !(k in out.capabilities)) out.capabilities[k] = old[k];
  }
  return out;
}
