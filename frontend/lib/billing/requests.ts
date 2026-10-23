import type { BillingOverview, OrgPlanRequest, PendingUpgrade } from "./types";

/** "22 Oct" (UTC calendar day, like the API). */
function shortDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
}

/**
 * The one "already waiting" message — the API sends the same words when it
 * refuses a second request: "You already have a pending request (Starter →
 * Pro, sent 22 Oct). Wait for approval or withdraw it."
 */
export function pendingRequestText(p: Pick<PendingUpgrade, "fromPlan" | "toPlan" | "createdAt">): string {
  const change = p.fromPlan ? `${p.fromPlan.name} → ${p.toPlan.name}` : p.toPlan.name;
  return `You already have a pending request (${change}, sent ${shortDay(p.createdAt)}). Wait for approval or withdraw it.`;
}

/** The waiting request that blocks plan changes, or null (a paid order under review doesn't). */
export function blockingRequest(o: Pick<BillingOverview, "pendingUpgrade"> | null | undefined): PendingUpgrade | null {
  return o?.pendingUpgrade?.status === "pending_approval" ? o.pendingUpgrade : null;
}

export const REQUEST_STATUS_LABEL: Record<OrgPlanRequest["status"], string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
};
