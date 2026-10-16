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

export function isFreePlan(
  plan: Pick<PlanRow, 'isSystem' | 'priceMonthly' | 'priceYearly'>,
): boolean {
  return plan.isSystem || (plan.priceMonthly === 0 && plan.priceYearly === 0);
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

/** Free plan first, then by monthly price, then age — rank is the position. */
export function sortPlans<T extends PlanRow>(plans: T[]): T[] {
  return [...plans].sort(
    (a, b) =>
      Number(isFreePlan(b)) - Number(isFreePlan(a)) ||
      a.priceMonthly - b.priceMonthly ||
      a.createdAt.getTime() - b.createdAt.getTime(),
  );
}

export function toBillingPlan(plan: PlanRow, rank: number): BillingPlanV2 {
  return {
    id: plan.id,
    name: plan.name,
    tagline: plan.description ?? '',
    priceMonthly: plan.priceMonthly,
    priceYearly: plan.priceYearly,
    isFree: isFreePlan(plan),
    rank,
    limits: planLimitsV2(plan),
    modules: planModulesV2(plan),
  };
}

export function toBillingPlans(plans: PlanRow[]): BillingPlanV2[] {
  return sortPlans(plans).map((p, i) => toBillingPlan(p, i));
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
