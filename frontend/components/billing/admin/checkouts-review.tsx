"use client";

import Link from "next/link";
import { formatINR } from "@/lib/billing/pricing";
import { useBillingQuery } from "../context";

/**
 * Paid checkouts the server couldn't apply (price changed since the quote,
 * the org no longer fits the plan, …). Read-only: the payment is captured,
 * so the fix is a manual plan change or a refund in Razorpay.
 * Renders nothing while the list is empty.
 */
export function CheckoutsNeedingReview() {
  const { data, error } = useBillingQuery((c) => c.listAdminCheckouts("needs_review"), []);
  if (error || !data || data.length === 0) return null;
  return (
    <div style={{ border: "1px solid #fde68a", background: "#fffbeb", borderRadius: 14, padding: 16, marginBottom: 16 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: "#92400e" }}>Paid — needs review ({data.length})</div>
      <p style={{ fontSize: 12, color: "#92400e", margin: "2px 0 10px" }}>
        These organisations paid online, but the plan couldn&apos;t be applied automatically. Change their plan by hand or refund the payment in Razorpay.
      </p>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
          <thead>
            <tr style={{ color: "#92400e", fontSize: 11, fontWeight: 700, textTransform: "uppercase", textAlign: "left" }}>
              <th style={{ padding: "6px 8px" }}>Organisation</th>
              <th style={{ padding: "6px 8px" }}>Plan</th>
              <th style={{ padding: "6px 8px", textAlign: "right" }}>Paid</th>
              <th style={{ padding: "6px 8px" }}>Payment</th>
              <th style={{ padding: "6px 8px" }}>Reason</th>
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
