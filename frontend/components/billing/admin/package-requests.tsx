"use client";

import { useCallback, useEffect, useState } from "react";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { useToast } from "@/components/ui/toast";
import {
  applyPackageChangeRequestCoupon,
  approvePackageChangeRequest,
  clearPackageChangeRequestPayment,
  getAdminPackageChangeRequests,
  markPackageChangeRequestPaid,
  rejectPackageChangeRequest,
  removePackageChangeRequestCoupon,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { formatDate, formatINR, packagePriceText } from "@/lib/billing/pricing";
import {
  isScheduledChange,
  MOVED_TO_BASIC_WHILE_WAITING,
  REQUEST_STATUS_LABEL,
  requestPaymentText,
  requestPriceText,
  requestStage,
  requestTitle,
  scheduledAmountText,
} from "@/lib/billing/requests";
import type { RequestQuote, ScheduledChangeStatus } from "@/lib/billing/types";
import type { PackageChangeRequestRow } from "@/lib/types";
import { Empty, ErrorNote, Loading, Section } from "../ui";
import { MarkPaidDialog, type MarkPaidValues } from "./mark-paid-dialog";
import { RejectRequestDialog } from "./reject-request-dialog";
import { NoApprovalTag, whatStaysSummary } from "../requests";
import { ChooseWhatStaysScreen } from "../choose-what-stays";
import { BillingDialog } from "../dialog";

/** Anchor of the section; Package Requests → Open scrolls here. */
export const PACKAGE_REQUESTS_ANCHOR = "package-requests";

const STATUS_BADGE: Record<string, string> = {
  pending: "b-amber",
  approved: "b-green",
  rejected: "b-rose",
  cancelled: "b-gray",
  scheduled: "b-indigo",
  done: "b-green",
  undone: "b-gray",
  replaced: "b-gray",
};

const person = (u: PackageChangeRequestRow["requestedBy"] | PackageChangeRequestRow["reviewedBy"]) =>
  u ? `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.email : null;

/** "₹500 + GST · prorated": what the request charges (its checkout), else the plan price for the cycle. */
/** The request's total incl. GST (rupees), when it has a checkout. */
export const requestTotal = (r: PackageChangeRequestRow): number | null =>
  r.billingCheckout ? r.billingCheckout.totalPaise / 100 : null;

/** Approve needs Mark as paid first — unless it's an older request or there's nothing to pay. */
export function approveBlockedReason(r: PackageChangeRequestRow): string | null {
  const total = requestTotal(r);
  if (total == null || total === 0 || r.payment) return null;
  return "Mark this request as paid before approving it.";
}

/** The request's price breakdown (from the API, else worked out from its checkout). */
export function requestQuote(r: PackageChangeRequestRow): RequestQuote | null {
  if (r.quote) return r.quote;
  const c = r.billingCheckout;
  if (!c) return null;
  return {
    price: c.taxablePaise / 100,
    couponCode: null,
    couponDiscount: 0,
    gst: (c.cgstPaise + c.sgstPaise + c.igstPaise) / 100,
    total: c.totalPaise / 100,
    couponAdded: false,
  };
}

export function requestAmountText(r: PackageChangeRequestRow): string | null {
  if (isScheduledChange(r)) return scheduledAmountText(r.scheduledAmount, r.startsAt);
  const c = r.billingCheckout;
  // With a coupon: "₹1,499 − ₹300 coupon + GST".
  if (r.quote?.couponCode) return requestPriceText(r.quote);
  if (c) {
    const note = c.kind === "upgrade_same_interval" ? " · prorated" : c.kind === "interval_change" ? " · less monthly credit" : "";
    return `${packagePriceText(c.taxablePaise / 100)}${note}`;
  }
  const plan = r.targetPlan as { priceMonthly?: number; priceYearly?: number } | undefined;
  const price = r.billingCycle === "yearly" ? plan?.priceYearly : plan?.priceMonthly;
  return typeof price === "number" ? packagePriceText(price) : null;
}

/**
 * Super Admin → org subscription page: this org's package change requests,
 * newest first. Pending ones are approved / rejected here (the same API as
 * before); decided ones show who decided, when, and the rejection reason.
 * Scheduled changes (to Basic / a smaller plan) are listed read-only: they
 * need no approval.
 */
/**
 * Super Admin "Choose what stays" for one organisation — any time, also after
 * the org's own choice is locked. Before the change applies it updates the
 * saved choice; once the org is on that plan it applies straight away (and the
 * org is notified). Without `requestId` it's for the org's current plan.
 */
export function AdminWhatStaysButton({
  orgId,
  orgName,
  requestId,
  targetPlanId,
  label,
  editable = true,
  onSaved,
}: {
  orgId: string;
  orgName?: string;
  requestId?: string;
  targetPlanId?: string;
  label?: string;
  /** false: "View what stays", read-only (older applied or closed rows). */
  editable?: boolean;
  onSaved?: () => void;
}) {
  const { hasPermission } = useAuth();
  const [open, setOpen] = useState(false);
  const canEdit = editable && hasPermission("admin_subscriptions", "edit");
  label = label ?? (canEdit ? "Choose what stays" : "View what stays");
  return (
    <>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(true)} data-testid="admin-choose-what-stays">
        {label}
      </button>
      <BillingDialog open={open} onClose={() => setOpen(false)} title={`${label}${orgName ? ` — ${orgName}` : ""}`} size="lg">
        <ChooseWhatStaysScreen
          admin={{ orgId, orgName }}
          requestId={requestId}
          targetPlanId={targetPlanId}
          onSaved={() => {
            setOpen(false);
            onSaved?.();
          }}
        />
      </BillingDialog>
    </>
  );
}

export function OrgPackageRequests({ orgId, onChanged }: { orgId: string; onChanged?: () => void }) {
  const { hasPermission } = useAuth();
  const { toast } = useToast();
  const canApprove = hasPermission("admin_subscriptions", "approve");
  const canReject = hasPermission("admin_subscriptions", "delete");
  const [rows, setRows] = useState<PackageChangeRequestRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [approving, setApproving] = useState<PackageChangeRequestRow | null>(null);
  const [rejecting, setRejecting] = useState<PackageChangeRequestRow | null>(null);
  const [rejectError, setRejectError] = useState<string | null>(null);
  const [paying, setPaying] = useState<PackageChangeRequestRow | null>(null);
  const [payError, setPayError] = useState<string | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const orgName = rows?.[0]?.organisation?.name ?? "this organisation";

  const load = useCallback(async (): Promise<PackageChangeRequestRow[] | null> => {
    try {
      const res = await getAdminPackageChangeRequests({ orgId, limit: 100 });
      setRows(res.data);
      setError(null);
      return res.data;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load package requests.");
      return null;
    }
  }, [orgId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount / org change
    void load();
  }, [load]);

  // Arriving from Package Requests → Open: bring this section into view once it has rendered.
  useEffect(() => {
    if (rows === null || typeof window === "undefined" || window.location.hash !== `#${PACKAGE_REQUESTS_ANCHOR}`) return;
    document.getElementById(PACKAGE_REQUESTS_ANCHOR)?.scrollIntoView({ block: "start" });
  }, [rows]);

  async function approve() {
    if (!approving) return;
    setBusy(true);
    try {
      await approvePackageChangeRequest(approving.id);
      toast({ variant: "success", title: `Approved — ${orgName} is now on ${approving.targetPlan?.name ?? "the new plan"}` });
      setApproving(null);
      await load();
      onChanged?.();
    } catch (e) {
      toast({ variant: "error", title: "Couldn't approve the request", description: e instanceof Error ? e.message : undefined });
    } finally {
      setBusy(false);
    }
  }

  async function savePayment(v: MarkPaidValues) {
    if (!paying) return;
    setBusy(true);
    setPayError(null);
    try {
      await markPackageChangeRequestPaid(paying.id, {
        method: v.method,
        reference: v.reference || undefined,
        receivedOn: v.receivedOn,
        note: v.note || undefined,
      });
      toast({ variant: "success", title: "Marked as paid", description: "You can approve the request now." });
      setPaying(null);
      await load();
    } catch (e) {
      setPayError(e instanceof Error ? e.message : "Couldn't save the payment.");
    } finally {
      setBusy(false);
    }
  }

  async function clearPayment() {
    if (!paying) return;
    setBusy(true);
    setPayError(null);
    try {
      await clearPackageChangeRequestPayment(paying.id);
      toast({ variant: "success", title: "Payment cleared" });
      setPaying(null);
      await load();
    } catch (e) {
      setPayError(e instanceof Error ? e.message : "Couldn't clear the payment.");
    } finally {
      setBusy(false);
    }
  }

  /** Apply / remove the request's coupon; the dialog stays open on the re-quoted request. */
  async function changeCoupon(code: string | null) {
    if (!paying) return;
    setBusy(true);
    setCouponError(null);
    setPayError(null);
    try {
      const res = code ? await applyPackageChangeRequestCoupon(paying.id, code) : await removePackageChangeRequestCoupon(paying.id);
      toast({
        variant: "success",
        title: code ? `Coupon ${code.toUpperCase()} applied` : "Coupon removed",
        description: res.paymentCleared ? "The payment recorded was cleared. Mark it as paid again." : undefined,
      });
      const fresh = await load();
      const row = fresh?.find((x) => x.id === paying.id);
      if (row) setPaying(row);
    } catch (e) {
      setCouponError(e instanceof Error ? e.message : "Couldn't change the coupon.");
    } finally {
      setBusy(false);
    }
  }

  async function reject(reason: string) {
    if (!rejecting) return;
    setBusy(true);
    setRejectError(null);
    try {
      await rejectPackageChangeRequest(rejecting.id, reason);
      toast({ variant: "success", title: "Request rejected", description: "The organisation can see the reason on its Billing page." });
      setRejecting(null);
      await load();
      onChanged?.();
    } catch (e) {
      setRejectError(e instanceof Error ? e.message : "Couldn't reject the request.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div id={PACKAGE_REQUESTS_ANCHOR} style={{ scrollMarginTop: 16 }}>
      <Section title="Package requests" sub="Plan change and renewal requests from this organisation, newest first: Mark as paid, then Approve. Scheduled changes need no approval." flush>
        {error ? (
          <div style={{ padding: 16 }}>
            <ErrorNote message={error} />
          </div>
        ) : rows === null ? (
          <Loading what="package requests" />
        ) : rows.length === 0 ? (
          <Empty>No package requests from this organisation.</Empty>
        ) : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Requested</th>
                  <th>Change</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th style={{ textAlign: "right" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const amount = requestAmountText(r);
                  const scheduled = isScheduledChange(r);
                  // A scheduled-change row only ever has one of these statuses.
                  const scheduledStatus = r.status as ScheduledChangeStatus;
                  return (
                    <tr key={r.id} data-testid="org-package-request">
                      <td>
                        <b>{person(r.requestedBy) ?? "Admin"}</b>
                        <div className="bl-muted bl-small">{formatDate(r.createdAt)}</div>
                      </td>
                      <td>
                        <b>{requestTitle({ label: r.label, toPlan: { name: r.targetPlan?.name ?? "Target" } })}</b>
                        {r.overdue ? (
                          <span className="badge b-amber" style={{ marginLeft: 6 }}>
                            overdue renewal
                          </span>
                        ) : null}
                        <div className="bl-muted bl-small">
                          {r.currentPlan?.name ?? "Current"} → {r.targetPlan?.name ?? "Target"} · <span style={{ textTransform: "capitalize" }}>{r.billingCycle}</span>
                        </div>
                        {r.movedToBasicAt ? (
                          <div className="bl-small" style={{ marginTop: 4, color: "var(--amber-700, #b45309)" }} data-testid="moved-to-basic-note">
                            {MOVED_TO_BASIC_WHILE_WAITING} ({formatDate(r.movedToBasicAt)})
                          </div>
                        ) : null}
                        {scheduled && r.startsAt ? <div className="bl-small" style={{ marginTop: 4 }}>Starts {formatDate(r.startsAt)}</div> : null}
                        {scheduled && r.reason ? (
                          <div className="bl-small bl-muted" style={{ marginTop: 2, maxWidth: 320 }}>
                            Reason: {r.reason}
                          </div>
                        ) : null}
                        {r.whatStays ? (
                          // What the org chose to keep (the rest is paused on approval).
                          <div className="bl-small" style={{ marginTop: 4 }} data-testid="admin-what-stays">
                            Keeps {whatStaysSummary(r.whatStays)}
                          </div>
                        ) : null}
                      </td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        {amount ?? <span className="bl-muted">—</span>}
                        {requestTotal(r) != null ? <div className="bl-muted bl-small">{formatINR(requestTotal(r)!)} incl. GST</div> : null}
                        {r.payment ? (
                          <div className="bl-small" style={{ marginTop: 4, color: r.payment.status === "refund_due" ? "var(--rose, #e11d48)" : "var(--green, #16a34a)" }} data-testid="request-payment">
                            {requestPaymentText(r.payment)}
                            {r.payment.status === "refund_due" ? " · rejected – refund due" : ""}
                          </div>
                        ) : r.status === "pending" && requestTotal(r) ? (
                          <div className="bl-muted bl-small" style={{ marginTop: 4 }}>
                            Waiting for payment
                          </div>
                        ) : null}
                      </td>
                      <td>
                        {scheduled ? (
                          <>
                            <span className={`badge ${STATUS_BADGE[r.status] ?? "b-gray"}`} data-testid="scheduled-change-status">
                              {requestStage({ status: scheduledStatus, payment: null, startsAt: r.startsAt })}
                            </span>
                            <NoApprovalTag />
                            {r.status !== "scheduled" && r.reviewedAt ? (
                              <div className="bl-muted bl-small" style={{ marginTop: 4 }}>
                                {REQUEST_STATUS_LABEL[scheduledStatus]} on {formatDate(r.reviewedAt)}
                              </div>
                            ) : null}
                          </>
                        ) : (
                          <span className={`badge ${STATUS_BADGE[r.status] ?? "b-gray"}`} style={{ textTransform: "capitalize" }}>
                            {r.status === "cancelled" ? "withdrawn" : r.status}
                          </span>
                        )}
                        {!scheduled && r.status !== "pending" && (r.reviewedAt || r.reviewedBy) ? (
                          <div className="bl-muted bl-small" style={{ marginTop: 4 }}>
                            {r.status === "cancelled" ? "Withdrawn" : r.status === "approved" ? "Approved" : "Rejected"}
                            {person(r.reviewedBy) ? ` by ${person(r.reviewedBy)}` : ""}
                            {r.reviewedAt ? ` on ${formatDate(r.reviewedAt)}` : ""}
                          </div>
                        ) : null}
                        {r.status === "rejected" && r.rejectionReason ? (
                          <div className="bl-small" style={{ marginTop: 4, maxWidth: 320 }}>
                            <b>Reason:</b> {r.rejectionReason}
                          </div>
                        ) : null}
                      </td>
                      <td>
                        {r.status === "pending" ? (
                          <div className="bl-row" style={{ gap: 6, justifyContent: "flex-end", flexWrap: "nowrap" }}>
                            {canApprove && requestTotal(r) != null ? (
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                disabled={busy}
                                onClick={() => {
                                  setPayError(null);
                                  setCouponError(null);
                                  setPaying(r);
                                }}
                              >
                                {/* ₹0 after a 100% coupon: nothing to pay, only the coupon to change. */}
                                {requestTotal(r) === 0 ? "Edit coupon" : r.payment ? "Edit payment" : "Mark as paid"}
                              </button>
                            ) : null}
                            {canApprove ? (
                              <span title={approveBlockedReason(r) ?? undefined} style={{ display: "inline-flex" }}>
                                <button
                                  type="button"
                                  className="btn btn-primary btn-sm"
                                  disabled={busy || !!approveBlockedReason(r)}
                                  style={approveBlockedReason(r) ? { opacity: 0.65, cursor: "not-allowed" } : undefined}
                                  onClick={() => setApproving(r)}
                                >
                                  Approve
                                </button>
                              </span>
                            ) : null}
                            {canReject ? (
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                style={{ color: "#ef4444" }}
                                disabled={busy}
                                onClick={() => {
                                  setRejectError(null);
                                  setRejecting(r);
                                }}
                              >
                                Reject
                              </button>
                            ) : null}
                            {r.whatStays ? (
                              <AdminWhatStaysButton
                                orgId={orgId}
                                orgName={r.organisation?.name}
                                requestId={r.id}
                                targetPlanId={r.targetPlanId}
                                editable={!!r.whatStaysEditable}
                                onSaved={() => {
                                  void load();
                                  onChanged?.();
                                }}
                              />
                            ) : null}
                          </div>
                        ) : r.whatStays ? (
                          // Editable while open, or for the row that put the org on its current plan; view-only otherwise.
                          <div className="bl-row" style={{ justifyContent: "flex-end" }}>
                            <AdminWhatStaysButton
                              orgId={orgId}
                              orgName={r.organisation?.name}
                              requestId={r.id}
                              targetPlanId={r.targetPlanId}
                              editable={!!r.whatStaysEditable}
                              onSaved={() => {
                                void load();
                                onChanged?.();
                              }}
                            />
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <ConfirmModal
        open={!!approving}
        title="Approve this request?"
        message={
          approving
            ? `Approve "${requestTitle({ label: approving.label, toPlan: { name: approving.targetPlan?.name ?? "the new plan" } })}" for ${orgName}?${approving.payment ? " The GST invoice is issued and emailed now." : ""}`
            : undefined
        }
        confirmLabel="Approve"
        busy={busy}
        onConfirm={() => void approve()}
        onClose={() => setApproving(null)}
      />
      {paying ? (
        <MarkPaidDialog
          key={paying.id}
          open
          orgName={orgName}
          title={requestTitle({ label: paying.label, toPlan: { name: paying.targetPlan?.name ?? "the new plan" } })}
          quote={requestQuote(paying) ?? { price: 0, couponCode: null, couponDiscount: 0, gst: 0, total: 0, couponAdded: false }}
          existing={paying.payment}
          busy={busy}
          error={payError}
          couponError={couponError}
          onSave={(v) => void savePayment(v)}
          onClear={() => void clearPayment()}
          onApplyCoupon={(code) => void changeCoupon(code)}
          onRemoveCoupon={() => void changeCoupon(null)}
          onClose={() => setPaying(null)}
        />
      ) : null}
      <RejectRequestDialog
        key={rejecting?.id ?? "none"}
        open={!!rejecting}
        orgName={orgName}
        paidAmount={rejecting?.payment && rejecting.payment.status === "awaiting_approval" ? rejecting.payment.amount : null}
        busy={busy}
        error={rejectError}
        onReject={(reason) => void reject(reason)}
        onClose={() => setRejecting(null)}
      />
    </div>
  );
}
