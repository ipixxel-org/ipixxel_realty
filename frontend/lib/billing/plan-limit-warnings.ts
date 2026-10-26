/**
 * Super Admin plans editor: a plan should allow at least as much as every
 * cheaper plan. This only warns — it never blocks a save.
 */
import { formatINR } from "./pricing";
import type { BillingPlan, PlanLimits } from "./types";

export interface PlanLimitWarning {
  /** The bigger plan whose limit is lower. */
  planId: string;
  /** The cheaper plan that allows more. */
  cheaperId: string;
  key: keyof PlanLimits;
  text: string;
}

const LIMIT_NOUNS: { key: keyof PlanLimits; noun: string }[] = [
  { key: "users", noun: "users" },
  { key: "projects", noun: "projects" },
  { key: "landingPages", noun: "landing pages" },
  { key: "templates", noun: "templates" },
];

const priceLabel = (p: BillingPlan) => (p.isFree ? "free" : formatINR(p.priceMonthly));
/** null = unlimited. */
const amount = (n: number | null) => n ?? Infinity;
/** Offered to organisations: active, and Basic or a paid plan (internal ₹0 plans aren't offered). */
const offered = (p: BillingPlan) => p.isActive !== false && (p.isFree || p.priceMonthly > 0 || p.priceYearly > 0);
/**
 * Same order as the billing rank (free plan first, then monthly price), from
 * the prices themselves so an unsaved price edit counts.
 */
const cheaperThan = (c: BillingPlan, p: BillingPlan) => !p.isFree && (c.isFree || c.priceMonthly < p.priceMonthly);

/**
 * One warning per plan and limit, against the cheaper plan that allows the
 * most — e.g. "Starter (₹999) allows fewer users than Basic (free)".
 */
export function planLimitWarnings(plans: BillingPlan[]): PlanLimitWarning[] {
  const list = plans.filter(offered);
  const out: PlanLimitWarning[] = [];
  for (const plan of list) {
    const cheaper = list.filter((c) => cheaperThan(c, plan));
    for (const { key, noun } of LIMIT_NOUNS) {
      const best = cheaper.reduce<BillingPlan | null>((m, c) => (!m || amount(c.limits[key]) > amount(m.limits[key]) ? c : m), null);
      if (best && amount(plan.limits[key]) < amount(best.limits[key])) {
        out.push({
          planId: plan.id,
          cheaperId: best.id,
          key,
          text: `${plan.name} (${priceLabel(plan)}) allows fewer ${noun} than ${best.name} (${priceLabel(best)})`,
        });
      }
    }
  }
  return out;
}

/** Warnings that involve this plan, with the draft in place of the saved copy. */
export function planLimitWarningsFor(draft: BillingPlan, plans: BillingPlan[]): PlanLimitWarning[] {
  const merged = plans.some((p) => p.id === draft.id) ? plans.map((p) => (p.id === draft.id ? draft : p)) : [...plans, draft];
  return planLimitWarnings(merged).filter((w) => w.planId === draft.id || w.cheaperId === draft.id);
}
