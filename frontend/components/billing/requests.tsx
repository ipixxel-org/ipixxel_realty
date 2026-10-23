"use client";

import { useState } from "react";
import { useToast } from "@/components/ui/toast";
import { ListPager } from "@/components/ui/list-pager";
import { formatDate, packagePriceText } from "@/lib/billing/pricing";
import { REQUEST_STATUS_LABEL } from "@/lib/billing/requests";
import type { OrgPlanRequest, WhatStays } from "@/lib/billing/types";
import { useBillingEnv, useBillingQuery, useOrgBilling } from "./context";
import { BillingDialog, DialogActions } from "./dialog";
import { BLink, Empty, ErrorNote, Loading, Section } from "./ui";

const STATUS_BADGE: Record<OrgPlanRequest["status"], string> = {
  pending: "b-amber",
  approved: "b-green",
  rejected: "b-rose",
  withdrawn: "b-gray",
};

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
] as const;

/** "Keeps 2 of 3 users · 3 of 4 projects" — what they chose to keep on the requested plan. */
export function whatStaysSummary(w: WhatStays): string {
  return WHAT_STAYS_GROUPS.flatMap(([k, noun]) => {
    const g = w[k];
    return g ? [`${g.kept.length} of ${g.total} ${noun}`] : [];
  }).join(" · ");
}

/** What the request keeps on the new plan, with the names, and a link to change it while pending. */
export function WhatStaysCell({ whatStays: w, pending }: { whatStays: WhatStays | null; pending: boolean }) {
  if (!w) return <span className="bl-muted">Everything fits</span>;
  const source = w.applied ? "Applied when approved" : w.choice === "saved" ? "Your choice" : "Our default picks";
  return (
    <div className="bl-small" data-testid="what-stays">
      <div>
        Keeps <b>{whatStaysSummary(w)}</b>
      </div>
      <div className="bl-muted">{source}</div>
      <details style={{ marginTop: 4 }}>
        <summary style={{ cursor: "pointer" }}>See what stays</summary>
        {WHAT_STAYS_GROUPS.map(([k, noun]) => {
          const g = w[k];
          if (!g) return null;
          return (
            <div key={k} style={{ marginTop: 6 }}>
              <div style={{ textTransform: "capitalize", fontWeight: 600 }}>
                {noun} (limit {g.limit})
              </div>
              <div>Stays active: {g.kept.map((i) => i.name).join(", ") || "—"}</div>
              <div className="bl-muted">
                {w.applied ? "Paused" : "Will be paused"}: {g.paused.map((i) => i.name).join(", ") || "—"}
              </div>
            </div>
          );
        })}
      </details>
      {pending ? (
        <BLink to="chooseWhatStays" params={{ target: w.planId, back: "requests" }} className="btn btn-ghost btn-sm" style={{ marginTop: 6 }}>
          Change what stays
        </BLink>
      ) : null}
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

/** Settings → Billing → Requests: every plan change request, newest first, 10 a page. */
export function RequestsTable({ pageSize = 10 }: { pageSize?: number }) {
  const [page, setPage] = useState(1);
  const [version, setVersion] = useState(0);
  const { data, error } = useBillingQuery((c) => c.listOrgRequests({ page, pageSize }), [page, pageSize, version]);
  return (
    <>
      <Section title="Plan change requests" sub="Requests sent to our team while online payment is off, newest first" flush>
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
                {data.data.map((r) => (
                  <tr key={r.id} data-testid="org-plan-request">
                    <td>
                      {formatDate(r.requestedAt)}
                      <div className="bl-muted bl-small">{r.requestedBy ?? "—"}</div>
                    </td>
                    <td>
                      {r.fromPlan ? `${r.fromPlan.name} → ` : ""}
                      <b>{r.toPlan.name}</b>
                      <div className="bl-muted bl-small" style={{ textTransform: "capitalize" }}>
                        {r.interval}
                      </div>
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>{requestAmount(r) ?? <span className="bl-muted">—</span>}</td>
                    <td>
                      <WhatStaysCell whatStays={r.whatStays} pending={r.status === "pending"} />
                    </td>
                    <td>
                      <span className={`badge ${STATUS_BADGE[r.status]}`}>{REQUEST_STATUS_LABEL[r.status]}</span>
                      {r.status === "rejected" && r.rejectionReason ? (
                        <div className="bl-small" style={{ marginTop: 4, maxWidth: 320 }}>
                          <b>Reason:</b> {r.rejectionReason}
                        </div>
                      ) : null}
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>{r.decidedAt ? formatDate(r.decidedAt) : <span className="bl-muted">—</span>}</td>
                    <td>
                      {r.status === "pending" ? (
                        <WithdrawRequestButton requestId={r.id} toPlan={r.toPlan.name} onWithdrawn={() => setVersion((v) => v + 1)} />
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
      {data ? <ListPager page={page} total={data.total} pageSize={pageSize} onPageChange={setPage} noun="requests" /> : null}
    </>
  );
}
