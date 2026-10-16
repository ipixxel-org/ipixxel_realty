"use client";

import { Icon } from "@/components/icons";
import { useToast } from "@/components/ui/toast";
import { formatDate, formatINR } from "@/lib/billing/pricing";
import type { BillingInterval, RenewalMode } from "@/lib/billing/types";
import { useBillingQuery } from "./context";
import { useInvoiceDownload } from "./invoices";
import { BLink, Kv, Section } from "./ui";

/**
 * "Download invoice" on the success page: finds this payment's invoice (by
 * its checkout) and opens the same document as Settings → Billing → Invoices.
 */
function DownloadInvoiceButton({ checkoutId }: { checkoutId: string }) {
  const { toast } = useToast();
  const download = useInvoiceDownload();
  // Looked up on arrival so the click opens it straight away (no popup blocker).
  // The invoice is issued with the payment, so it's on the first page.
  const { data, reload } = useBillingQuery((c) => c.listInvoices({ page: 1, pageSize: 20 }), [checkoutId]);
  const invoice = data?.data.find((i) => i.checkoutId === checkoutId) ?? null;

  function open() {
    if (invoice) {
      download(invoice.pdfUrl, `Invoice ${invoice.number}`);
      return;
    }
    reload();
    toast({ variant: "info", title: "Your invoice is on its way", description: "It's being prepared and will be listed under Billing → Invoices in a minute." });
  }

  return (
    <button type="button" className="btn btn-ghost" disabled={!data} onClick={open}>
      <Icon name="download" size={15} /> Download invoice
    </button>
  );
}

export interface ReceiptView {
  planId: string;
  planName: string;
  interval: BillingInterval;
  amount: number;
  reference: string;
  activeUntil: string | null;
  couponCode: string | null;
}

export function CheckoutSuccess({ receipt: r, orgName, renewalMode, finishing = false }: { receipt: ReceiptView; orgName: string; renewalMode: RenewalMode; finishing?: boolean }) {
  const paid = r.amount > 0 && r.reference !== "free_coupon";
  return (
    <Section
      title={
        <span className="bl-row" style={{ gap: 8 }}>
          <Icon name="check" size={18} style={{ color: "var(--green)" }} /> Your plan is active
        </span>
      }
    >
      <div className="bl-stack">
        {finishing ? (
          <div className="form-alert" style={{ background: "var(--bg)" }}>
            Payment received. We&apos;re finishing setting up {r.planName} — it usually takes a minute. Refresh Billing shortly; if it hasn&apos;t changed, contact support with
            the reference below.
          </div>
        ) : null}
        <div style={{ fontSize: 15 }}>
          <b>{r.planName}</b> is now active for {orgName}. Every limit and feature on {r.planName} is unlocked, and anything that was paused is back.
        </div>
        <div className="bl-grid4">
          <Kv label="Plan">
            {r.planName} · {r.interval}
          </Kv>
          <Kv label="Paid">{r.amount === 0 ? "₹0 (100% coupon)" : formatINR(r.amount)}</Kv>
          <Kv label="Active until">{r.activeUntil ? formatDate(r.activeUntil) : "—"}</Kv>
          <Kv label="Renewal">{renewalMode === "auto" ? "Automatic" : "Pay now reminder"}</Kv>
        </div>
        {r.couponCode ? <div className="bl-coupon-ok">Coupon {r.couponCode} applied.</div> : null}
        <div className="bl-muted bl-mono">Reference: {r.reference === "free_coupon" ? "no payment — 100% coupon" : r.reference}</div>
        <div className="bl-row">
          <BLink to="overview" className="btn btn-primary">
            Go to billing
          </BLink>
          {paid ? <DownloadInvoiceButton checkoutId={r.reference} /> : null}
        </div>
        {paid ? (
          <div className="bl-muted bl-small">
            Your GST invoice is also listed under <BLink to="invoices">Billing → Invoices</BLink>.
          </div>
        ) : null}
      </div>
    </Section>
  );
}

export function CheckoutFailure({ planId, planName, interval, reason }: { planId: string; planName: string; interval: BillingInterval; reason: string }) {
  return (
    <Section
      title={
        <span className="bl-row" style={{ gap: 8 }}>
          <Icon name="alert" size={18} style={{ color: "var(--rose)" }} /> Payment failed
        </span>
      }
    >
      <div className="bl-stack">
        <div style={{ fontSize: 15 }}>
          We couldn&apos;t complete your payment for <b>{planName}</b>. Your plan hasn&apos;t changed and nothing was charged.
        </div>
        <div className="form-alert">{reason}</div>
        <ul className="bl-muted" style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 4 }}>
          <li>Try another card or UPI app.</li>
          <li>Check your bank hasn&apos;t blocked online payments.</li>
        </ul>
        <div className="bl-row">
          <BLink to="checkout" params={{ plan: planId, interval }} className="btn btn-primary">
            <Icon name="refresh" size={15} /> Try again
          </BLink>
          <BLink to="plans" className="btn btn-ghost">
            Back to plans
          </BLink>
        </div>
      </div>
    </Section>
  );
}
