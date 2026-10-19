"use client";

import { useState } from "react";
import { Icon } from "@/components/icons";
import type { PaymentRecord } from "@/lib/billing/types";
import { InvoiceDownloadButton } from "../invoices";

/**
 * Order ID cell for the Super Admin payment tables (organisation page →
 * Payments, and Payments & Invoicing): the Razorpay order ID with the payment
 * ID below in smaller text, and a copy button. Offline payments show
 * "Offline" and their reference.
 */
export function OrderIdCell({ payment }: { payment: Pick<PaymentRecord, "orderId" | "gatewayPaymentId" | "reference"> }) {
  const [copied, setCopied] = useState(false);
  if (!payment.orderId) {
    return (
      <div>
        <span className="bl-strong">Offline</span>
        {payment.reference && payment.reference !== "—" ? <div className="bl-muted bl-mono" style={{ fontSize: 11 }}>{payment.reference}</div> : null}
      </div>
    );
  }
  const orderId = payment.orderId;
  async function copy() {
    try {
      await navigator.clipboard.writeText(orderId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked (e.g. insecure context): the ID is selectable text anyway.
    }
  }
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
      <div style={{ minWidth: 0 }}>
        <div className="bl-mono" style={{ fontSize: 12.5, wordBreak: "break-all" }}>
          {orderId}
        </div>
        {payment.gatewayPaymentId ? (
          <div className="bl-muted bl-mono" style={{ fontSize: 11, wordBreak: "break-all" }}>
            {payment.gatewayPaymentId}
          </div>
        ) : null}
      </div>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={() => void copy()}
        aria-label={`Copy order ID ${orderId}`}
        title={copied ? "Copied" : "Copy order ID"}
        style={{ padding: "2px 6px" }}
      >
        <Icon name={copied ? "check" : "copy"} size={13} />
      </button>
    </div>
  );
}

/** "Invoice" (and "Credit note" once refunded): the same documents as the organisation's Billing → Invoices. */
export function PaymentDocuments({ payment }: { payment: Pick<PaymentRecord, "invoice" | "creditNote"> }) {
  if (!payment.invoice && !payment.creditNote) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
      {payment.invoice ? (
        <InvoiceDownloadButton url={payment.invoice.url} name={`Invoice ${payment.invoice.number}`}>
          Invoice
        </InvoiceDownloadButton>
      ) : null}
      {payment.creditNote ? (
        <InvoiceDownloadButton url={payment.creditNote.url} name={`Credit note ${payment.creditNote.number}`}>
          Credit note
        </InvoiceDownloadButton>
      ) : null}
    </div>
  );
}
