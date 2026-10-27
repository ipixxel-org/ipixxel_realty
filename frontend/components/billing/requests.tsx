"use client";

import { useState } from "react";
import { useToast } from "@/components/ui/toast";
import { ListPager } from "@/components/ui/list-pager";
import { formatDate, formatINR, packagePriceText } from "@/lib/billing/pricing";
import {
  isScheduledChange,
  MOVED_TO_BASIC_WHILE_WAITING,
  NO_APPROVAL_NEEDED,
  requestPaymentText,
  requestPriceText,
  requestStage,
  requestTitle,
  scheduledAmountText,
} from "@/lib/billing/requests";
import type { OrgPlanRequest, WhatStays } from "@/lib/billing/types";
import { UndoButton } from "./banners";
import { useBillingEnv, useBillingQuery, useOrgBilling } from "./context";
import { BillingDialog, DialogActions } from "./dialog";
import { BLink, Empty, ErrorNote, Loading, Section } from "./ui";

const STATUS_BADGE: Record<OrgPlanRequest["status"], string> = {
  pending: "b-amber",
  approved: "b-green",
  rejected: "b-rose",
  withdrawn: "b-gray",
  scheduled: "b-indigo",
  done: "b-green",
  undone: "b-gray",
  replaced: "b-gray",
};

/** "No approval needed" — on scheduled-change rows. */
export function NoApprovalTag() {
  return (
    <span className="badge b-gray" style={{ marginLeft: 6 }} data-testid="no-approval-tag">
      {NO_APPROVAL_NEEDED}
    </span>
  );
}

/** "₹500 + GST · prorated". */
export function requestAmount(r: Pick<OrgPlanRequest, "amount" | "amountNote">): string | null {
  if (r.amount == null) return null;
  const note = r.amountNote === "prorated" ? " · prorated" : r.amountNote === "less_monthly_credit" ? " · less monthly credit" : "";
  return `${packagePriceText(r.amount)}${note}`;
}

const WHAT_STAYS_GROUPS = [
  ["users", "users"],
  ["projects", "projects"],
  ["landingPages", "published pages"],
  ["templates", "templates"],
] as const;

/** "Keeps 2 of 3 users · 3 of 4 projects" — what they chose to keep on the requested plan. */
export function whatStaysSummary(w: WhatStays): string {
  return WHAT_STAYS_GROUPS.flatMap(([k, noun]) => {
    const g = w[k];
    return g ? [`${g.kept.length} of ${g.total} ${noun}`] : [];
  }).join(" · ");
}

/**
 * What the request keeps on the new plan: the short summary and one button —
 * "Change what stays" while it's open (pending, or a scheduled change not yet
 * in effect), "View" once decided or applied. Both open the choose-what-stays
 * page for this request; the API makes it read-only once it's locked.
 */
export function WhatStaysCell({ whatStays: w, editable, requestId }: { whatStays: WhatStays | null; editable: boolean; requestId?: string }) {
  if (!w) return <span className="bl-muted">Everything fits</span>;
  return (
    <div className="bl-small" data-testid="what-stays">
      <div>
        Keeps <b>{whatStaysSummary(w)}</b>
      </div>
      <BLink to="chooseWhatStays" params={{ target: w.planId, back: "requests", request: requestId }} className="btn btn-ghost btn-sm" style={{ marginTop: 6 }}>
        {editable ? "Change what stays" : "View"}
      </BLink>
    </div>
  );
}

/** Withdraw a pending request (billing:edit), after a confirm. Its checkout is cancelled; plan buttons work again. */
export function WithdrawRequestButton({
  requestId,
  toPlan,
  className = "btn btn-ghost btn-sm",
  onWithdrawn,
}: {
  requestId: string;
  toPlan: string;
  className?: string;
  onWithdrawn?: () => void;
}) {
  const { client, canEdit } = useBillingEnv();
  const { refresh } = useOrgBilling();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!canEdit) return null;
  async function withdraw() {
    setBusy(true);
    try {
      await client.withdrawRequest(requestId);
      await refresh();
      toast({ variant: "success", title: "Request withdrawn", description: "You can change your plan again." });
      setOpen(false);
      onWithdrawn?.();
    } catch (e) {
      toast({ variant: "error", title: "Couldn't withdraw the request", description: e instanceof Error ? e.message : undefined });
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button type="button" className={className} style={{ color: "var(--rose, #e11d48)" }} onClick={() => setOpen(true)}>
        Withdraw
      </button>
      <BillingDialog
        open={open}
        onClose={() => (busy ? undefined : setOpen(false))}
        title="Withdraw this request?"
        description={`Your request for ${toPlan} will be withdrawn and our team won't act on it. You stay on your current plan and can send a new request any time.`}
        footer={
          <DialogActions>
            <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setOpen(false)}>
              Keep request
            </button>
            <button type="button" className="btn btn-danger btn-sm" disabled={busy} onClick={() => void withdraw()}>
              {busy ? "Withdrawing…" : "Withdraw request"}
            </button>
          </DialogActions>
        }
      />
    </>
  );
}

/** Once our team has recorded the payment the request can't be withdrawn here. */
export const CONTACT_TO_WITHDRAW = "Contact us to withdraw";

/**
 * Settings → Billing → Requests: every plan change request, and every change
 * scheduled for the end of the term (no approval), newest first, 10 a page.
 */
export function RequestsTable({ pageSize = 10 }: { pageSize?: number }) {
  const [page, setPage] = useState(1);
  const [version, setVersion] = useState(0);
  const { client } = useBillingEnv();
  const { overview } = useOrgBilling();
  const { data, error } = useBillingQuery((c) => c.listOrgRequests({ page, pageSize }), [page, pageSize, version]);
  return (
    <>
      <Section title="Plan change requests" sub="Requests sent to our team while online payment is off, and plan changes scheduled for the end of your term, newest first" flush>
        {error ? (
          <div style={{ padding: 16 }}>
            <ErrorNote message={error} />
          </div>
        ) : !data ? (
          <Loading what="requests" />
        ) : data.total === 0 ? (
          <Empty>No plan change requests yet.</Empty>
        ) : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Requested</th>
                  <th>Change</th>
                  <th>Amount</th>
                  <th>What stays</th>
                  <th>Status</th>
                  <th>Decided</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.data.map((r) => {
                  const scheduled = isScheduledChange(r);
                  return (
                  <tr key={r.id} data-testid="org-plan-request">
                    <td>
                      {formatDate(r.requestedAt)}
                      <div className="bl-muted bl-small">{r.requestedBy ?? "—"}</div>
                    </td>
                    <td>
                      <b>{requestTitle(r)}</b>
                      {r.overdue ? (
                        <span className="badge b-amber" style={{ marginLeft: 6 }}>
                          overdue renewal
                        </span>
                      ) : null}
                      <div className="bl-muted bl-small">
                        {r.fromPlan ? `${r.fromPlan.name} → ${r.toPlan.name}` : r.toPlan.name} · <span style={{ textTransform: "capitalize" }}>{r.interval}</span>
                      </div>
                      {r.movedToBasicAt ? (
                        <div className="bl-small" style={{ marginTop: 4, color: "var(--amber-700, #b45309)" }}>
                          {MOVED_TO_BASIC_WHILE_WAITING} ({formatDate(r.movedToBasicAt)})
                        </div>
                      ) : null}
                      {scheduled && r.startsAt ? <div className="bl-small" style={{ marginTop: 4 }}>Starts {formatDate(r.startsAt)}</div> : null}
                      {scheduled && r.reason ? (
                        <div className="bl-small bl-muted" style={{ marginTop: 2, maxWidth: 320 }}>
                          Reason: {r.reason}
                        </div>
                      ) : null}
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {/* With a coupon: "₹1,499 − ₹300 coupon + GST". */}
                      {scheduled ? scheduledAmountText(r.amount, r.startsAt) : r.quote?.couponCode ? <span data-testid="request-coupon-amount">{requestPriceText(r.quote)}</span> : (requestAmount(r) ?? <span className="bl-muted">—</span>)}
                      {r.total != null ? (
                        <div className="bl-muted bl-small">
                          {formatINR(r.total)} incl. GST{r.quote?.couponCode ? ` · coupon ${r.quote.couponCode}` : ""}
                        </div>
                      ) : null}
                    </td>
                    <td>
                      <WhatStaysCell whatStays={r.whatStays} editable={r.status === "pending" || r.status === "scheduled"} requestId={r.id} />
                    </td>
                    <td>
                      <span className={`badge ${STATUS_BADGE[r.status]}`}>{requestStage(r)}</span>
                      {scheduled ? <NoApprovalTag /> : null}
                      {r.payment && r.payment.status !== "refund_due" ? (
                        <div className="bl-small bl-muted" style={{ marginTop: 4 }}>
                          {requestPaymentText(r.payment)}
                        </div>
                      ) : null}
                      {r.status === "rejected" && r.rejectionReason ? (
                        <div className="bl-small" style={{ marginTop: 4, maxWidth: 320 }}>
                          <b>Reason:</b> {r.rejectionReason}
                        </div>
                      ) : null}
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>{r.decidedAt ? formatDate(r.decidedAt) : <span className="bl-muted">—</span>}</td>
                    <td>
                      {r.status === "scheduled" && overview ? (
                        // The same undo as the banner's "Keep <plan>".
                        <UndoButton
                          label={`Keep ${overview.plan.name}`}
                          run={() => (overview.downgradeTo ? client.undoDowngrade() : client.undoCancel())}
                          done={`You'll stay on ${overview.plan.name}.`}
                          onDone={() => setVersion((v) => v + 1)}
                        />
                      ) : r.status !== "pending" ? null : r.payment ? (
                        // Paid: our team has the money, so withdrawing goes through them.
                        <span className="bl-muted bl-small" title="We've received the payment for this request">
                          {CONTACT_TO_WITHDRAW}
                        </span>
                      ) : (
                        <WithdrawRequestButton requestId={r.id} toPlan={r.toPlan.name} onWithdrawn={() => setVersion((v) => v + 1)} />
                      )}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>
      {data ? <ListPager page={page} total={data.total} pageSize={pageSize} onPageChange={setPage} noun="requests" /> : null}
    </>
  );
}
