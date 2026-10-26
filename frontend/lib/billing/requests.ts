import { formatINR } from "./pricing";
import type { BillingOverview, OrgPlanRequest, PendingUpgrade, RequestPayment, RequestQuote } from "./types";

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

/** How the Super Admin can be paid for a request (Mark as paid). */
export const REQUEST_PAYMENT_METHODS = ["Bank transfer", "UPI", "Cheque", "Cash", "Other"] as const;

/** "Paid · ₹1,178.82 · UPI · UTR 12345 · 23 Oct" */
export function requestPaymentText(p: Pick<RequestPayment, "amount" | "method" | "reference" | "receivedOn">): string {
  const ref = p.reference ? ` · ${p.method === "Cheque" ? "Cheque" : "UTR"} ${p.reference}` : "";
  return `Paid · ${formatINR(p.amount)} · ${p.method}${ref} · ${shortDay(p.receivedOn)}`;
}

/** Where a request is: "Waiting for payment", "Payment received – waiting for approval", or the decision. */
export function requestStage(r: Pick<OrgPlanRequest, "status" | "payment" | "startsAt">): string {
  if (r.status === "scheduled") return r.startsAt ? `Scheduled (applies on ${shortDay(r.startsAt)})` : "Scheduled";
  if (r.status !== "pending") return REQUEST_STATUS_LABEL[r.status];
  return r.payment ? "Payment received – waiting for approval" : "Waiting for payment";
}

/** "Renewal of Pro" / "Change to Starter" (older rows: "Change to Pro"). */
export function requestTitle(r: { label?: string; toPlan: { name: string } }): string {
  return r.label ?? `Change to ${r.toPlan.name}`;
}

/** "₹1,499 − ₹300 coupon + GST" (no coupon: "₹1,499 + GST"). */
export function requestPriceText(q: RequestQuote): string {
  const coupon = q.couponCode ? ` − ${formatINR(q.couponDiscount)} coupon` : "";
  return `${formatINR(q.price)}${coupon} + GST`;
}

/** "₹1,499 − ₹300 coupon (CODE) + GST ₹215.82 = ₹1,414.82" */
export function requestBreakdownText(q: RequestQuote): string {
  const coupon = q.couponCode ? ` − ${formatINR(q.couponDiscount)} coupon (${q.couponCode})` : "";
  return `${formatINR(q.price)}${coupon} + GST ${formatINR(q.gst)} = ${formatINR(q.total)}`;
}

/** Shown on a request when the org fell back to Basic while it waited. */
export const MOVED_TO_BASIC_WHILE_WAITING = "Org moved to Basic while waiting";

export const REQUEST_STATUS_LABEL: Record<OrgPlanRequest["status"], string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
  scheduled: "Scheduled",
  done: "Done",
  undone: "Undone",
  replaced: "Replaced",
};

/** A scheduled change (to Basic / a smaller plan) recorded on the list — no approval. */
export const isScheduledChange = (r: { kind?: string }) => r.kind === "scheduled_change";

/** Tag on scheduled-change rows. */
export const NO_APPROVAL_NEEDED = "No approval needed";

/** "Nothing to pay now" (Basic), or "₹999 + GST from 22 Dec" for a smaller paid plan. */
export function scheduledAmountText(amount: number | null | undefined, startsAt: string | null | undefined): string {
  if (!amount) return "Nothing to pay now";
  return `${formatINR(amount)} + GST${startsAt ? ` from ${shortDay(startsAt)}` : ""}`;
}
