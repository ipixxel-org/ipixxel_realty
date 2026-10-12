"use client";

import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/icons";
import { Modal, ModalActions } from "@/components/ui/modal";
import { LIST_PAGE_SIZE, ListPager } from "@/components/ui/list-pager";
import { useAuth } from "@/lib/auth-context";
import { createAdminTestPaymentOrder, getAdminOrganisationsList, getAdminPayments } from "@/lib/api";
import { formatPaise, openCheckout, paymentStatusStyle } from "@/lib/razorpay";
import type { AdminPaymentRow, PaymentStatus } from "@/lib/types";

const STATUS_OPTIONS: { value: "" | PaymentStatus; label: string }[] = [
  { value: "", label: "All statuses" },
  { value: "created", label: "Created" },
  { value: "pending", label: "Pending" },
  { value: "captured", label: "Captured" },
  { value: "failed", label: "Failed" },
  { value: "refunded", label: "Refunded" },
];

const TH: React.CSSProperties = { padding: "10px 16px", textAlign: "left" };
const TD: React.CSSProperties = { padding: "12px 16px" };
const SELECT: React.CSSProperties = {
  padding: "8px 12px",
  border: "1px solid #cbd5e1",
  borderRadius: 10,
  fontSize: 13,
  background: "#fff",
};

type Notice = { kind: "ok" | "err"; text: string } | null;

export default function AdminPaymentsPage() {
  const { user, hasPermission } = useAuth();
  const canView = hasPermission("admin_subscriptions", "view");
  const isSuperAdmin = !!(user?.platformUnrestricted || user?.roleKeys?.includes("super_admin"));

  const [rows, setRows] = useState<AdminPaymentRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<"" | PaymentStatus>("");
  const [orgFilter, setOrgFilter] = useState("");
  const [orgs, setOrgs] = useState<{ id: string; name: string }[]>([]);
  const [mode, setMode] = useState<"test" | "live" | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [testOpen, setTestOpen] = useState(false);
  const [testOrg, setTestOrg] = useState("");
  const [testBusy, setTestBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  const load = useCallback(
    async (p = page) => {
      setLoading(true);
      setError(null);
      try {
        const res = await getAdminPayments({
          page: p,
          limit: LIST_PAGE_SIZE,
          status: status || undefined,
          organisationId: orgFilter || undefined,
        });
        setRows(res.data);
        setTotal(res.total);
        setMode(res.mode);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load payments.");
      } finally {
        setLoading(false);
      }
    },
    [page, status, orgFilter],
  );

  useEffect(() => {
    if (!canView) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-change, same as the other console lists
    void load(page);
  }, [canView, load, page]);

  useEffect(() => {
    if (!canView) return;
    getAdminOrganisationsList().then(setOrgs).catch(() => setOrgs([]));
  }, [canView]);

  async function startTestPayment() {
    if (!testOrg) return;
    setTestBusy(true);
    setNotice(null);
    try {
      const order = await createAdminTestPaymentOrder(testOrg);
      setTestOpen(false);
      await openCheckout({
        ...order,
        verifyPath: "/admin/payments/verify",
        onSuccess: (payment) => {
          setTestBusy(false);
          setNotice({
            kind: "ok",
            text:
              payment.status === "captured"
                ? `Test payment of ${formatPaise(payment.amount, payment.currency)} captured (${payment.razorpayPaymentId}).`
                : `Payment authorised; waiting for capture (status: ${payment.status}). The webhook will update it.`,
          });
          setPage(1);
          void load(1);
        },
        onFailure: (_reason, message) => {
          setTestBusy(false);
          setNotice({ kind: "err", text: message });
          void load(page);
        },
      });
    } catch (err) {
      setTestBusy(false);
      setNotice({ kind: "err", text: err instanceof Error ? err.message : "Could not start the test payment." });
    }
  }

  if (!canView) {
    return (
      <div className="card" style={{ padding: 32, textAlign: "center" }}>
        <h1 style={{ margin: "0 0 8px", fontSize: 22 }}>Access restricted</h1>
        <p className="muted" style={{ margin: 0 }}>You don&apos;t have permission to view payments.</p>
      </div>
    );
  }

  const testDisabledReason =
    mode === null ? "Razorpay keys are not configured." : mode !== "test" ? "Only available with a Razorpay test key (rzp_test_…)." : null;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 20, flexWrap: "wrap", gap: 16 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, color: "#0f1424", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4 }}>
            BILLING
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: "#0f172a", margin: 0, letterSpacing: "-0.02em" }}>Payments</h1>
          <p style={{ fontSize: 13, color: "#64748b", marginTop: 4, marginBottom: 0 }}>
            Razorpay payments across all organisations.
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {mode ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 12,
                fontWeight: 600,
                padding: "5px 12px",
                borderRadius: 999,
                ...(mode === "test"
                  ? { color: "#d97706", background: "rgba(245, 158, 11, 0.1)" }
                  : { color: "#10b981", background: "rgba(16, 185, 129, 0.08)" }),
              }}
            >
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: "currentColor", display: "inline-block" }} />
              {mode === "test" ? "Test mode" : "Live mode"}
            </div>
          ) : null}
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void load(page)} disabled={loading}>
            <Icon name="refresh" size={14} /> Refresh
          </button>
          {isSuperAdmin ? (
            <button
              type="button"
              onClick={() => {
                setTestOrg(orgFilter || "");
                setTestOpen(true);
              }}
              disabled={!!testDisabledReason || testBusy}
              title={testDisabledReason ?? "Create a ₹1 test order and open Checkout"}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 14px",
                borderRadius: 10,
                background: "#0f1424",
                color: "#fff",
                fontSize: 13,
                fontWeight: 600,
                border: "none",
                cursor: testDisabledReason || testBusy ? "not-allowed" : "pointer",
                opacity: testDisabledReason || testBusy ? 0.5 : 1,
              }}
            >
              <Icon name="plus" size={14} /> {testBusy ? "Processing…" : "Test payment"}
            </button>
          ) : null}
        </div>
      </div>

      {notice ? (
        <div
          role="status"
          style={{
            marginBottom: 16,
            padding: "10px 14px",
            borderRadius: 10,
            fontSize: 13,
            ...(notice.kind === "ok"
              ? { background: "rgba(16, 185, 129, 0.08)", color: "#047857" }
              : { background: "rgba(239, 68, 68, 0.08)", color: "#b91c1c" }),
          }}
        >
          {notice.text}
        </div>
      ) : null}

      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <select
          aria-label="Filter by organisation"
          value={orgFilter}
          onChange={(e) => {
            setOrgFilter(e.target.value);
            setPage(1);
          }}
          style={SELECT}
        >
          <option value="">All organisations</option>
          {orgs.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by status"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as "" | PaymentStatus);
            setPage(1);
          }}
          style={SELECT}
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div style={{ border: "1px solid #e2e8f0", borderRadius: 14, overflow: "hidden", background: "#fff" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #f1f5f9", background: "#f8fafc", color: "#64748b", fontSize: 11, fontWeight: 700, textTransform: "uppercase" }}>
                <th style={TH}>DATE</th>
                <th style={TH}>ORGANISATION</th>
                <th style={TH}>PURPOSE</th>
                <th style={{ ...TH, textAlign: "right" }}>AMOUNT</th>
                <th style={{ ...TH, textAlign: "center" }}>STATUS</th>
                <th style={TH}>RAZORPAY</th>
              </tr>
            </thead>
            <tbody>
              {error ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: 32, color: "#ef4444" }}>
                    {error}
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: 32, color: "#94a3b8" }}>
                    {loading ? "Loading…" : "No payments found."}
                  </td>
                </tr>
              ) : (
                rows.map((p) => (
                  <tr key={p.id} style={{ borderBottom: "1px solid #f8fafc" }}>
                    <td style={{ ...TD, color: "#64748b", fontSize: 12, whiteSpace: "nowrap" }}>
                      {new Date(p.createdAt).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </td>
                    <td style={TD}>
                      <div style={{ color: "#0f172a", fontWeight: 700 }}>{p.organisation.name}</div>
                      <div style={{ fontSize: 11, color: "#64748b" }}>
                        by {[p.createdBy.firstName, p.createdBy.lastName].filter(Boolean).join(" ") || p.createdBy.email}
                      </div>
                    </td>
                    <td style={TD}>
                      <span style={{ padding: "3px 8px", borderRadius: 6, background: "#f1f5f9", color: "#475569", fontWeight: 600, fontSize: 11 }}>
                        {p.purpose}
                      </span>
                      {p.referenceId ? <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>{p.referenceType}: {p.referenceId}</div> : null}
                    </td>
                    <td style={{ ...TD, textAlign: "right", fontWeight: 700, color: "#0f172a", whiteSpace: "nowrap" }}>
                      {formatPaise(p.amount, p.currency)}
                    </td>
                    <td style={{ ...TD, textAlign: "center" }}>
                      <span style={{ padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: 700, ...paymentStatusStyle(p.status) }}>
                        {p.status}
                      </span>
                      {p.failureReason ? <div style={{ fontSize: 11, color: "#ef4444", marginTop: 4 }}>{p.failureReason}</div> : null}
                    </td>
                    <td style={{ ...TD, fontSize: 11, color: "#64748b", fontFamily: "ui-monospace, monospace" }}>
                      <div>{p.razorpayOrderId}</div>
                      {p.razorpayPaymentId ? <div>{p.razorpayPaymentId}</div> : null}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      <ListPager page={page} total={total} onPageChange={setPage} loading={loading} noun="payments" />

      <Modal
        open={testOpen}
        onClose={() => setTestOpen(false)}
        title="Test payment"
        description="Creates a ₹1 Razorpay order (purpose: test) for the chosen organisation and opens Checkout. Test mode only — use Razorpay's test cards or UPI success@razorpay."
        size="sm"
        footer={
          <ModalActions>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setTestOpen(false)}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => void startTestPayment()} disabled={!testOrg || testBusy}>
              {testBusy ? "Creating order…" : "Pay ₹1.00"}
            </button>
          </ModalActions>
        }
      >
        <label htmlFor="test-pay-org" style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 6 }}>
          Organisation
        </label>
        <select id="test-pay-org" value={testOrg} onChange={(e) => setTestOrg(e.target.value)} style={{ ...SELECT, width: "100%" }}>
          <option value="">Select an organisation…</option>
          {orgs.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      </Modal>
    </div>
  );
}
