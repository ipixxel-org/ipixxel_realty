"use client";

import Link from "next/link";
import { formatINR } from "@/lib/billing/pricing";
import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useBillingEnv, useBillingQuery } from "../context";

/**
 * Paid checkouts the server couldn't apply (price changed since the quote,
 * the org no longer fits the plan, …). Read-only: the payment is captured,
 * so the fix is a manual plan change or a refund in Razorpay.
 * Renders nothing while the list is empty.
 */
export function CheckoutsNeedingReview() {
  const { data, error, reload } = useBillingQuery((c) => c.listAdminCheckouts("needs_review"), []);
  const { client } = useBillingEnv();
  const { hasPermission } = useAuth();
  const canEdit = hasPermission("admin_subscriptions", "edit");
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  if (error || !data || data.length === 0) return null;
  /** Close it by hand (plan sorted out another way): the org can change plans again. */
  async function resolve(checkoutId: string) {
    const note = window.prompt("Mark this payment as resolved? Nothing is applied and the organisation can change plans again. Note (optional):");
    if (note === null) return;
    setBusy(checkoutId);
    setActionError(null);
    try {
      await client.resolveAdminCheckout({ checkoutId, note: note.trim() || undefined });
      reload();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Couldn't mark it resolved.");
    } finally {
      setBusy(null);
    }
  }
  return (
    <div style={{ border: "1px solid #fde68a", background: "#fffbeb", borderRadius: 14, padding: 16, marginBottom: 16 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: "#92400e" }}>Paid — needs review ({data.length})</div>
      <p style={{ fontSize: 12, color: "#92400e", margin: "2px 0 10px" }}>
        These organisations paid online, but the plan couldn&apos;t be applied automatically. Their plan changes are on hold until this is resolved: refund
        the payment (Payments &amp; Invoicing), or change their plan by hand and mark it resolved.
      </p>
      {actionError ? <p style={{ fontSize: 12, color: "#b91c1c", margin: "0 0 8px" }}>{actionError}</p> : null}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
          <thead>
            <tr style={{ color: "#92400e", fontSize: 11, fontWeight: 700, textTransform: "uppercase", textAlign: "left" }}>
              <th style={{ padding: "6px 8px" }}>Organisation</th>
              <th style={{ padding: "6px 8px" }}>Plan</th>
              <th style={{ padding: "6px 8px", textAlign: "right" }}>Paid</th>
              <th style={{ padding: "6px 8px" }}>Payment</th>
              <th style={{ padding: "6px 8px" }}>Reason</th>
              <th style={{ padding: "6px 8px" }} />
            </tr>
          </thead>
          <tbody>
            {data.map((c) => (
              <tr key={c.id} style={{ borderTop: "1px solid #fde68a" }}>
                <td style={{ padding: "8px" }}>
                  <Link href={`/admin-console/organisation-detail/${c.organisation.id}`} style={{ color: "#0f172a", fontWeight: 700, textDecoration: "none" }}>
                    {c.organisation.name}
                  </Link>
                </td>
                <td style={{ padding: "8px", whiteSpace: "nowrap" }}>
                  {c.fromPlanName ? `${c.fromPlanName} → ` : ""}
                  <b>{c.toPlanName}</b> · {c.toInterval}
                </td>
                <td style={{ padding: "8px", textAlign: "right", whiteSpace: "nowrap" }}>{formatINR(c.paid ?? c.total)}</td>
                <td style={{ padding: "8px", fontFamily: "monospace", fontSize: 11.5 }}>{c.razorpayPaymentId ?? "—"}</td>
                <td style={{ padding: "8px", color: "#475569" }}>{c.reviewReason ?? "—"}</td>
                <td style={{ padding: "8px", textAlign: "right" }}>
                  {canEdit ? (
                    <button type="button" className="btn btn-ghost btn-sm" disabled={busy === c.id} onClick={() => void resolve(c.id)} data-testid="resolve-checkout">
                      {busy === c.id ? "Saving…" : "Mark resolved"}
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
