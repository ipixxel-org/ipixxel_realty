import { formatDate, formatINR } from "./pricing";
import type { BillingOverview, OnlinePaymentView, OrgPlanRequest, PendingUpgrade, PlanChangeBlockedReason, RequestPayment, RequestQuote } from "./types";

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

/** The one "a payment is being checked" message — the API refuses with the same words (payment_review). */
export const PAYMENT_REVIEW_TEXT = "A payment is being checked by our team. You can change plans once it's resolved.";

/** The waiting request that blocks plan changes, or null (a paid order under review is payment_review). */
export function blockingRequest(o: Pick<BillingOverview, "pendingUpgrade"> | null | undefined): PendingUpgrade | null {
  return o?.pendingUpgrade?.status === "pending_approval" ? o.pendingUpgrade : null;
}

/**
 * The one "a change is scheduled" message — the API refuses with the same
 * words (change_scheduled): "You've scheduled a change to Basic on 25 Nov
 * 2026. Click 'Keep Starter' to undo it before choosing another plan."
 */
export function scheduledChangeText(currentPlan: string, targetPlan: string, startsAt: string | null | undefined): string {
  return `You've scheduled a change to ${targetPlan}${startsAt ? ` on ${formatDate(startsAt)}` : ""}. Click 'Keep ${currentPlan}' to undo it before choosing another plan.`;
}

type BlockFields = Pick<
  BillingOverview,
  "pendingUpgrade" | "plan" | "cancelAt" | "downgradeTo" | "downgradeAt" | "planChangeBlockedReason" | "planChangeBlockedMessage"
>;

/**
 * The one check for "can they change plan now?": null, or why not with the
 * message for the tooltip / note. Uses the overview's planChangeBlockedReason;
 * payloads without it (older API) are worked out the same way.
 */
export function planChangeBlock(o: BlockFields | null | undefined): { reason: PlanChangeBlockedReason; message: string } | null {
  if (!o) return null;
  if (o.planChangeBlockedReason === null) return null;
  if (o.planChangeBlockedReason && o.planChangeBlockedMessage) return { reason: o.planChangeBlockedReason, message: o.planChangeBlockedMessage };
  const waiting = blockingRequest(o);
  if (waiting) return { reason: "request_pending", message: pendingRequestText(waiting) };
  if (o.pendingUpgrade?.status === "needs_review") return { reason: "payment_review", message: PAYMENT_REVIEW_TEXT };
  if (!o.plan.isFree && (o.cancelAt || o.downgradeTo)) {
    return {
      reason: "change_scheduled",
      message: scheduledChangeText(o.plan.name, o.downgradeTo?.name ?? "Basic", o.downgradeTo ? o.downgradeAt : o.cancelAt),
    };
  }
  return null;
}

/** How the Super Admin can be paid for a request (Mark as paid). */
export const REQUEST_PAYMENT_METHODS = ["Bank transfer", "UPI", "Cheque", "Cash", "Other"] as const;

/** "Paid · ₹1,178.82 · UPI · UTR 12345 · 23 Oct" */
export function requestPaymentText(p: Pick<RequestPayment, "amount" | "method" | "reference" | "receivedOn">): string {
  const ref = p.reference ? ` · ${p.method === "Cheque" ? "Cheque" : "UTR"} ${p.reference}` : "";
  return `Paid · ${formatINR(p.amount)} · ${p.method}${ref} · ${shortDay(p.receivedOn)}`;
}

/** An online payment's row on the Requests lists (no approval: it applies when paid). */
export const isOnlinePayment = (r: { kind?: string }) => r.kind === "online_payment";

/**
 * The status tag on an online payment row: "Waiting for payment", "Paid online
 * · 27 Oct", "Payment failed", "Expired (not paid)", "Superseded", "Needs
 * review", "Refunded" or "Resolved by our team".
 */
export function onlinePaymentTag(o: Pick<OnlinePaymentView, "state" | "paidAt">): string {
  switch (o.state) {
    case "waiting":
      return "Waiting for payment";
    case "paid":
      return o.paidAt ? `Paid online · ${shortDay(o.paidAt)}` : "Paid online";
    case "failed":
      return "Payment failed";
    case "expired":
      return "Expired (not paid)";
    case "superseded":
      return "Superseded";
    case "needs_review":
      return "Needs review";
    case "refunded":
      return "Refunded";
    case "resolved":
      return "Resolved by our team";
  }
}

/** Badge colour for an online payment's state. */
export const ONLINE_PAYMENT_BADGE: Record<OnlinePaymentView["state"], string> = {
  waiting: "b-amber",
  paid: "b-green",
  failed: "b-rose",
  expired: "b-gray",
  superseded: "b-gray",
  needs_review: "b-amber",
  refunded: "b-gray",
  resolved: "b-gray",
};

/** Where a request is: "Waiting for payment", "Payment received – waiting for approval", or the decision. */
export function requestStage(r: Pick<OrgPlanRequest, "status" | "payment" | "startsAt"> & { online?: OnlinePaymentView | null }): string {
  if (r.online) return onlinePaymentTag(r.online);
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
  awaiting_payment: "Waiting for payment",
  needs_review: "Needs review",
  closed: "Closed",
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

/**
 * When a scheduled change starts: the real date once it took effect ("Took
 * effect 27 Oct 2026" — e.g. a move to Basic during grace applies straight
 * away, before the date it was scheduled for), else "Starts 26 Nov 2026".
 */
export function scheduledEffectiveDate(r: { status: string; startsAt?: string | null; decidedAt?: string | null }): string | null {
  return r.status === "done" && r.decidedAt ? r.decidedAt : (r.startsAt ?? null);
}

export function scheduledDateText(r: { status: string; startsAt?: string | null; decidedAt?: string | null }): string | null {
  if (r.status === "done" && r.decidedAt) return `Took effect ${formatDate(r.decidedAt)}`;
  return r.startsAt ? `Starts ${formatDate(r.startsAt)}` : null;
}
