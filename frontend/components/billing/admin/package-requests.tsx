"use client";

import { useCallback, useEffect, useState } from "react";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { useToast } from "@/components/ui/toast";
import { approvePackageChangeRequest, getAdminPackageChangeRequests, rejectPackageChangeRequest } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { formatDate, packagePriceText } from "@/lib/billing/pricing";
import type { PackageChangeRequestRow } from "@/lib/types";
import { Empty, ErrorNote, Loading, Section } from "../ui";
import { RejectRequestDialog } from "./reject-request-dialog";

/** Anchor of the section; Package Requests → Open scrolls here. */
export const PACKAGE_REQUESTS_ANCHOR = "package-requests";

const STATUS_BADGE: Record<string, string> = {
  pending: "b-amber",
  approved: "b-green",
  rejected: "b-rose",
  cancelled: "b-gray",
};

const person = (u: PackageChangeRequestRow["requestedBy"] | PackageChangeRequestRow["reviewedBy"]) =>
  u ? `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.email : null;

/** "₹500 + GST · prorated": what the request charges (its checkout), else the plan price for the cycle. */
export function requestAmountText(r: PackageChangeRequestRow): string | null {
  const c = r.billingCheckout;
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
 */
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
  const [busy, setBusy] = useState(false);
  const orgName = rows?.[0]?.organisation?.name ?? "this organisation";

  const load = useCallback(async () => {
    try {
      const res = await getAdminPackageChangeRequests({ orgId, limit: 100 });
      setRows(res.data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load package requests.");
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
      <Section title="Package requests" sub="Upgrade requests from this organisation, newest first" flush>
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
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const amount = requestAmountText(r);
                  return (
                    <tr key={r.id} data-testid="org-package-request">
                      <td>
                        <b>{person(r.requestedBy) ?? "Admin"}</b>
                        <div className="bl-muted bl-small">{formatDate(r.createdAt)}</div>
                      </td>
                      <td>
                        {r.currentPlan?.name ?? "Current"} → <b>{r.targetPlan?.name ?? "Target"}</b>
                        <div className="bl-muted bl-small" style={{ textTransform: "capitalize" }}>
                          {r.billingCycle}
                        </div>
                      </td>
                      <td style={{ whiteSpace: "nowrap" }}>{amount ?? <span className="bl-muted">—</span>}</td>
                      <td>
                        <span className={`badge ${STATUS_BADGE[r.status] ?? "b-gray"}`} style={{ textTransform: "capitalize" }}>
                          {r.status}
                        </span>
                        {r.status !== "pending" && (r.reviewedAt || r.reviewedBy) ? (
                          <div className="bl-muted bl-small" style={{ marginTop: 4 }}>
                            {r.status === "cancelled" ? "Cancelled" : r.status === "approved" ? "Approved" : "Rejected"}
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
                            {canApprove ? (
                              <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => setApproving(r)}>
                                Approve
                              </button>
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
        message={approving ? `Approve upgrade to ${approving.targetPlan?.name ?? "the new plan"} for ${orgName}?` : undefined}
        confirmLabel="Approve"
        busy={busy}
        onConfirm={() => void approve()}
        onClose={() => setApproving(null)}
      />
      <RejectRequestDialog
        key={rejecting?.id ?? "none"}
        open={!!rejecting}
        orgName={orgName}
        busy={busy}
        error={rejectError}
        onReject={(reason) => void reject(reason)}
        onClose={() => setRejecting(null)}
      />
    </div>
  );
}
