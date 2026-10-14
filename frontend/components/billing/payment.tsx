"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/icons";
import { formatINR } from "@/lib/billing/pricing";
import type { CheckoutReceipt, RenewalMode, StartCheckoutRequest } from "@/lib/billing/types";
import { useBillingEnv } from "./context";

type PopupOutcome = { kind: "success" } | { kind: "failure"; reason: string } | { kind: "closed" };

const DECLINED = "Your bank declined the payment. No money was taken.";

/**
 * Stand-in for Razorpay Checkout while the mock billing client is active.
 * Clearly labelled; the presenter picks the outcome (pay, or simulate a
 * decline). Closing it = the customer closed the popup.
 */
export function SimulatedPaymentPopup({
  open,
  amount,
  title,
  subtitle,
  renewalMode,
  onOutcome,
}: {
  open: boolean;
  amount: number;
  title: string;
  subtitle: string;
  renewalMode: RenewalMode;
  onOutcome: (o: PopupOutcome) => void;
}) {
  const { inlineDialogs } = useBillingEnv();
  const auto = renewalMode === "auto";
  const methods = auto
    ? [
        { id: "card", label: "Card", detail: "Saved for automatic renewals" },
        { id: "upi", label: "UPI AutoPay", detail: "Approve once in your UPI app" },
      ]
    : [
        { id: "upi", label: "UPI", detail: "Pay with any UPI app" },
        { id: "card", label: "Card", detail: "Visa, Mastercard, RuPay, Amex" },
        { id: "nb", label: "Netbanking", detail: "All major banks" },
      ];
  const [method, setMethod] = useState("card");
  const [processing, setProcessing] = useState(false);
  const timer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );

  if (!open || typeof document === "undefined") return null;

  function finish(o: PopupOutcome) {
    setProcessing(false);
    onOutcome(o);
  }

  function run(o: PopupOutcome) {
    setProcessing(true);
    timer.current = window.setTimeout(() => finish(o), 1400);
  }

  const body = (
    <div className={`bl-rzp-backdrop${inlineDialogs ? " inline" : ""}`} role="dialog" aria-modal="true" aria-label="Payment">
      <div className="bl-rzp">
        <div className="bl-rzp-sim">SIMULATED PAYMENT · NO MONEY MOVES</div>
        <div className="bl-rzp-head">
          <span className="bl-rzp-logo">iP</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>iPixxel Realty</div>
            <small>{title}</small>
          </div>
          <div className="bl-rzp-amt">{formatINR(amount)}</div>
          {!processing ? (
            <button type="button" className="bl-rzp-close" aria-label="Close payment window" onClick={() => finish({ kind: "closed" })}>
              ×
            </button>
          ) : null}
        </div>
        {!processing ? (
          <div className="bl-rzp-body">
            <div style={{ fontSize: 12, color: "#64748b" }}>{subtitle}</div>
            {methods.map((m) => (
              <button key={m.id} type="button" className={`bl-rzp-method${method === m.id ? " on" : ""}`} onClick={() => setMethod(m.id)}>
                <Icon name={m.id === "card" ? "billing" : m.id === "nb" ? "building" : "phone"} size={16} />
                <span>
                  <b style={{ display: "block" }}>{m.label}</b>
                  <span style={{ fontSize: 11.5, color: "#64748b" }}>{m.detail}</span>
                </span>
              </button>
            ))}
            <div style={{ fontSize: 11.5, color: "#475569", background: "#f1f5f9", padding: "8px 10px", borderRadius: 8 }}>
              {auto
                ? "This payment also sets up automatic renewals with the method you choose."
                : "Nothing is saved. You'll get a reminder with a Pay now button before each renewal."}
            </div>
            <button type="button" className="bl-rzp-pay" onClick={() => run({ kind: "success" })}>
              Pay {formatINR(amount)}
            </button>
            <button
              type="button"
              onClick={() => run({ kind: "failure", reason: DECLINED })}
              style={{ background: "none", border: 0, color: "#64748b", fontSize: 11.5, cursor: "pointer", textDecoration: "underline" }}
            >
              Simulate a declined payment
            </button>
          </div>
        ) : (
          <div className="bl-rzp-body" style={{ textAlign: "center", padding: "28px 18px" }}>
            <div className="bl-spinner" />
            <b>Processing payment…</b>
            <div style={{ fontSize: 12, color: "#64748b" }}>Please don&apos;t close this window.</div>
          </div>
        )}
      </div>
    </div>
  );
  return inlineDialogs ? body : createPortal(body, document.body);
}

/**
 * Runs a checkout end to end: startCheckout → payment popup → confirmCheckout.
 * Returns the trigger and the popup element to render.
 */
export function usePayment(handlers: {
  renewalMode: RenewalMode;
  title: string;
  subtitle: string;
  onActive: (receipt: CheckoutReceipt) => void;
  onFailed: (reason: string) => void;
  onClosed: () => void;
}): { start: (req: StartCheckoutRequest) => Promise<void>; busy: boolean; popup: ReactNode } {
  const { client } = useBillingEnv();
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<{ checkoutId: string; amount: number } | null>(null);

  async function start(req: StartCheckoutRequest) {
    setBusy(true);
    try {
      const res = await client.startCheckout(req);
      if (res.status === "activated") {
        handlers.onActive(res.receipt);
        return;
      }
      if (res.razorpay) {
        // REAL PAYMENT WIRING (when the backend returns a Razorpay order):
        //   await openCheckout({ keyId: res.razorpay.keyId, orderId: res.razorpay.orderId,
        //     amount: res.razorpay.amountPaise, currency: "INR", verifyPath: "/org/billing/checkout/confirm",
        //     onSuccess: … , onFailure: (_r, message) => handlers.onFailed(message) })
        // from lib/razorpay.ts — the backend verifies the signature in confirmCheckout.
        handlers.onFailed("Online payment isn't connected yet.");
        return;
      }
      // Mock client: simulated popup instead of Razorpay.
      setPending({ checkoutId: res.checkoutId, amount: res.amount });
    } catch (e) {
      handlers.onFailed(e instanceof Error ? e.message : "Couldn't start the payment.");
    } finally {
      setBusy(false);
    }
  }

  async function onOutcome(o: PopupOutcome) {
    const p = pending;
    setPending(null);
    if (!p) return;
    if (o.kind === "closed") return handlers.onClosed();
    if (o.kind === "failure") return handlers.onFailed(o.reason);
    const res = await client.confirmCheckout({
      checkoutId: p.checkoutId,
      razorpayOrderId: `order_SIM${p.checkoutId.slice(4)}`,
      razorpayPaymentId: `pay_SIM${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
      razorpaySignature: "simulated",
    });
    if (res.status === "active") handlers.onActive(res.receipt);
    else handlers.onFailed(res.reason);
  }

  return {
    start,
    busy,
    popup: (
      <SimulatedPaymentPopup
        open={!!pending}
        amount={pending?.amount ?? 0}
        title={handlers.title}
        subtitle={handlers.subtitle}
        renewalMode={handlers.renewalMode}
        onOutcome={(o) => void onOutcome(o)}
      />
    ),
  };
}
