/**
 * Upgrade vs downgrade — ONE rule for every plan card, checkout and downgrade
 * page. Mirrors the backend's planChangeDirection (billing/plan-modules.ts).
 * Rank comes from the backend (free plan first, then monthly price).
 */
import type { BillingInterval, BillingOverview, BillingPlan } from "./types";

export type PlanChangeDirection = "upgrade" | "downgrade" | "same";

/** By rank; same plan: monthly → yearly is an upgrade, yearly → monthly a downgrade. */
export function planChangeDirection(
  from: { rank: number; interval: BillingInterval },
  to: { rank: number; interval: BillingInterval },
): PlanChangeDirection {
  if (to.rank !== from.rank) return to.rank > from.rank ? "upgrade" : "downgrade";
  if (to.interval === from.interval) return "same";
  return to.interval === "yearly" ? "upgrade" : "downgrade";
}

/** Manual mode with the renewal overdue: a paid plan is a request at full price, Basic is immediate. */
export function isOverdueManual(o: BillingOverview, live: boolean): boolean {
  return !live && o.paymentMode === "manual" && (o.status === "past_due" || o.status === "grace_ending");
}

/**
 * Where a plan change goes: "checkout" (upgrade — pay the difference, or send
 * a change request in manual mode), "downgrade" (scheduled for the end of the
 * term; Basic straight away when overdue in manual mode), or null when it's
 * the plan they're on.
 */
export function planChangeRoute(
  o: BillingOverview,
  target: BillingPlan,
  interval: BillingInterval,
  live: boolean,
): "checkout" | "downgrade" | null {
  if (isOverdueManual(o, live)) return target.isFree ? "downgrade" : "checkout";
  // Basic has no yearly billing to switch to.
  if (target.isFree) return o.plan.isFree ? null : "downgrade";
  if (o.plan.isFree) return "checkout";
  const dir = planChangeDirection({ rank: o.plan.rank, interval: o.interval }, { rank: target.rank, interval });
  return dir === "upgrade" ? "checkout" : dir === "downgrade" ? "downgrade" : null;
}
