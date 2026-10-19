"use client";

import { useEffect, useState } from "react";
import { ListPager } from "@/components/ui/list-pager";
import { useToast } from "@/components/ui/toast";
import { formatDate, formatINR } from "@/lib/billing/pricing";
import type { AdminPaymentRow, PaymentStatus } from "@/lib/billing/types";
import { useBillingEnv, useBillingQuery } from "../context";
import { BillingDialog, DialogActions } from "../dialog";
import { BLink, Empty, ErrorNote, Loading, PAYMENT_STATUS_META, Section } from "../ui";
import { OrderIdCell, PaymentDocuments } from "./payment-cells";

export function RefundDialog({ payment, onClose, onRefunded }: { payment: AdminPaymentRow | null; onClose: () => void; onRefunded: () => void }) {
  const { client, canEdit } = useBillingEnv();
  const { toast } = useToast();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function refund() {
    if (!payment) return;
    setBusy(true);
    try {
      const res = await client.refundPayment({ paymentId: payment.id, reason: reason || undefined });
      toast({ variant: "success", title: `Refunded ${formatINR(res.payment.amount)}`, description: `Credit note ${res.creditNoteNumber} issued to ${res.payment.orgName}.` });
      setReason("");
      onRefunded();
    } catch (e) {
      toast({ variant: "error", title: "Couldn't refund", description: e instanceof Error ? e.message : undefined });
    } finally {
      setBusy(false);
    }
  }

  return (
    <BillingDialog
      open={!!payment}
      onClose={onClose}
      title="Refund payment"
      footer={
        <DialogActions>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            Back
          </button>
          <button type="button" className="btn btn-danger btn-sm" disabled={busy || !canEdit} onClick={() => void refund()}>
            Refund {payment ? formatINR(payment.amount) : ""}
          </button>
        </DialogActions>
      }
    >
      {payment ? (
        <div className="bl-stack" style={{ gap: 12, fontSize: 13.5 }}>
          <div>
            Full refund of <b>{formatINR(payment.amount)}</b> to {payment.orgName} for “{payment.description}”, back to {payment.method}.
          </div>
          <div className="bl-muted" style={{ padding: "10px 12px", background: "var(--bg)", borderRadius: 10 }}>
            Refunds are always the full amount. A <b>credit note</b> is issued against the original GST invoice, cancelling the GST on it.
            {payment.status === "offline" ? " This was paid offline, so send the money back yourself — we only record it." : " The money usually reaches the customer in 5–7 working days."}
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Reason (internal)</label>
            <input className="inp" value={reason} placeholder="Charged twice" onChange={(e) => setReason(e.target.value)} />
          </div>
          <div className="hint">The plan isn&apos;t changed — cancel it separately if needed.</div>
        </div>
      ) : null}
    </BillingDialog>
  );
}

export function AdminPaymentsView({ initialRefundId }: { initialRefundId?: string }) {
  const [status, setStatus] = useState<PaymentStatus | "">("");
  const [orgId, setOrgId] = useState("");
  // Search box text, and the search sent to the server once typing pauses.
  const [searchText, setSearchText] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [picked, setPicked] = useState<AdminPaymentRow | null>(null);
  // Walkthrough: the refund dialog starts open for `initialRefundId` until it's closed once.
  const [initialDone, setInitialDone] = useState(!initialRefundId);
  const { data: orgs } = useBillingQuery((c) => c.listOrgOptions(), []);
  const { data, error, reload } = useBillingQuery(
    (c) => c.listAdminPayments({ status: status || undefined, orgId: orgId || undefined, search: search || undefined, page, pageSize: 10 }),
    [status, orgId, search, page],
  );
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchText.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchText]);
  const refund = picked ?? (initialDone ? null : (data?.data.find((x) => x.id === initialRefundId) ?? null));
  const setRefund = (p: AdminPaymentRow | null) => {
    setInitialDone(true);
    setPicked(p);
  };

  if (error) return <ErrorNote message={error} />;
  return (
    <div className="bl-stack">
      {data ? (
        <div className="bl-grid3">
          <Section title="Collected">
            <div style={{ fontSize: 22, fontWeight: 800 }}>{formatINR(data.totals.collected)}</div>
          </Section>
          <Section title="Refunded">
            <div style={{ fontSize: 22, fontWeight: 800 }}>{formatINR(data.totals.refunded)}</div>
          </Section>
          <Section title="Failed attempts">
            <div style={{ fontSize: 22, fontWeight: 800 }}>{data.totals.failed}</div>
          </Section>
        </div>
      ) : null}
      <div className="bl-row">
        <input
          className="inp"
          type="search"
          style={{ maxWidth: 260 }}
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          placeholder="Search order ID / payment ID"
          aria-label="Search by order ID or payment ID"
        />
        <select
          className="inp"
          style={{ maxWidth: 240 }}
          value={orgId}
          onChange={(e) => {
            setOrgId(e.target.value);
            setPage(1);
          }}
          aria-label="Filter by organisation"
        >
          <option value="">All organisations</option>
          {(orgs ?? []).map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
        <select
          className="inp"
          style={{ maxWidth: 200 }}
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as PaymentStatus | "");
            setPage(1);
          }}
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          {Object.entries(PAYMENT_STATUS_META).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </select>
      </div>
      <Section title={data ? `${data.total} payments` : "Payments"} flush>
        {!data ? (
          <Loading what="payments" />
        ) : data.total === 0 ? (
          <Empty>No payments match.</Empty>
        ) : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Organisation</th>
                  <th>For</th>
                  <th>Order ID</th>
                  <th>Method</th>
                  <th style={{ textAlign: "right" }}>Amount</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.data.map((p) => (
                  <tr key={p.id}>
                    <td style={{ whiteSpace: "nowrap" }}>{formatDate(p.createdAt)}</td>
                    <td>
                      <BLink to="adminSubscription" params={{ orgId: p.orgId }} className="bl-strong" style={{ color: "inherit" }}>
                        {p.orgName}
                      </BLink>
                    </td>
                    <td>
                      {p.description}
                      {p.couponCode ? (
                        <span className="badge b-violet" style={{ marginLeft: 6 }}>
                          {p.couponCode}
                        </span>
                      ) : null}
                    </td>
                    <td>
                      <OrderIdCell payment={p} />
                    </td>
                    <td>{p.method}</td>
                    <td style={{ textAlign: "right", fontWeight: 700 }}>{formatINR(p.amount)}</td>
                    <td>
                      <span className={`badge ${PAYMENT_STATUS_META[p.status].badge}`}>{PAYMENT_STATUS_META[p.status].label}</span>
                      {p.failureReason ? <div style={{ fontSize: 11, color: "var(--rose)", marginTop: 3 }}>{p.failureReason}</div> : null}
                    </td>
                    <td>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, justifyContent: "flex-end" }}>
                        <PaymentDocuments payment={p} />
                        {(p.status === "captured" || p.status === "offline") && p.amount > 0 ? (
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRefund(p)}>
                            Refund
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
      {data ? <ListPager page={page} total={data.total} onPageChange={setPage} noun="payments" /> : null}
      <RefundDialog
        payment={refund}
        onClose={() => setRefund(null)}
        onRefunded={() => {
          setRefund(null);
          reload();
        }}
      />
    </div>
  );
}
