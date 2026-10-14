"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/icons";
import type { BillingClient } from "@/lib/billing/client";
import { formatINR } from "@/lib/billing/pricing";
import type { BillingInterval, CheckoutReceipt, ConfirmCheckoutResponse, RenewalMode, StartCheckoutRequest } from "@/lib/billing/types";
import { openCheckout } from "@/lib/razorpay";
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
 * After a verified payment the server applies the plan (on verify or on the
 * webhook, whichever is first). Poll the overview until it shows the new plan.
 * Resolves the overview's period end, or null on timeout.
 */
export async function waitForPlan(
  client: Pick<BillingClient, "getBillingOverview">,
  planId: string,
  interval: BillingInterval,
  { everyMs = 1500, timeoutMs = 30000 }: { everyMs?: number; timeoutMs?: number } = {},
): Promise<{ applied: boolean; periodEnd: string | null; planName: string | null }> {
  const until = Date.now() + timeoutMs;
  for (;;) {
    try {
      const ov = await client.getBillingOverview();
      if (ov.plan.id === planId && ov.interval === interval && ov.status !== "free") return { applied: true, periodEnd: ov.periodEnd, planName: ov.plan.name };
    } catch {
      // keep polling — a blip shouldn't turn a paid order into an error
    }
    if (Date.now() + everyMs > until) return { applied: false, periodEnd: null, planName: null };
    await new Promise((r) => setTimeout(r, everyMs));
  }
}

/** What the success page needs; `finishing` = paid, but the plan isn't showing yet. */
export type PaidReceipt = CheckoutReceipt & { finishing?: boolean };

/**
 * Runs a checkout end to end: startCheckout → payment (Razorpay Checkout, or
 * the simulated popup on the mock client) → confirmCheckout → wait for the
 * plan. Manual mode ends at startCheckout with a request for our team.
 * Returns the trigger and the popup element to render.
 */
export function usePayment(handlers: {
  renewalMode: RenewalMode;
  title: string;
  subtitle: string;
  onActive: (receipt: PaidReceipt) => void;
  onFailed: (reason: string) => void;
  onClosed: () => void;
  /** Manual mode: the upgrade request was sent (or one was already pending). */
  onRequested?: (r: { requestId: string; checkoutId: string | null }) => void;
}): { start: (req: StartCheckoutRequest) => Promise<void>; busy: boolean; popup: ReactNode } {
  const { client } = useBillingEnv();
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<{ checkoutId: string; amount: number; req: StartCheckoutRequest } | null>(null);

  async function settlePaid(res: ConfirmCheckoutResponse, amount: number, req: StartCheckoutRequest) {
    const reviewing = res.checkoutStatus === "needs_review";
    const { applied, periodEnd, planName } = reviewing ? { applied: false, periodEnd: null, planName: null } : await waitForPlan(client, res.toPlanId, res.toInterval);
    handlers.onActive({
      planId: res.toPlanId,
      planName: planName ?? "",
      interval: res.toInterval,
      amount,
      reference: res.checkoutId,
      activeUntil: periodEnd ?? "",
      couponCode: req.couponCode ?? null,
      finishing: !applied,
    });
  }

  async function start(req: StartCheckoutRequest) {
    setBusy(true);
    try {
      const res = await client.startCheckout(req);
      if (res.status === "activated") {
        handlers.onActive(res.receipt);
        return;
      }
      if (res.status === "pending_approval") {
        handlers.onRequested?.({ requestId: res.requestId, checkoutId: res.checkoutId });
        return;
      }
      const rz = res.razorpay;
      if (rz) {
        // Razorpay Checkout; the backend verifies the signature and applies the plan.
        await new Promise<void>((resolve) => {
          void openCheckout({
            keyId: rz.keyId,
            orderId: rz.orderId,
            amount: rz.amountPaise,
            currency: rz.currency,
            name: rz.name,
            description: rz.description,
            prefill: rz.prefill,
            verifyPath: "/org/billing/checkout/confirm",
            onSuccess: (row) => {
              void settlePaid(row as unknown as ConfirmCheckoutResponse, res.amount, req).finally(resolve);
            },
            onFailure: (reason, message) => {
              if (reason === "dismissed") handlers.onClosed();
              else handlers.onFailed(message);
              resolve();
            },
          });
        });
        return;
      }
      if (!client.isMock) {
        handlers.onFailed("Online payment isn't available right now. Please try again later.");
        return;
      }
      // Mock client: simulated popup instead of Razorpay.
      setPending({ checkoutId: res.checkoutId, amount: res.amount, req });
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
    try {
      const res = await client.confirmCheckout({
        checkoutId: p.checkoutId,
        razorpayOrderId: `order_SIM${p.checkoutId.slice(4)}`,
        razorpayPaymentId: `pay_SIM${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
        razorpaySignature: "simulated",
      });
      await settlePaid(res, p.amount, p.req);
    } catch (e) {
      handlers.onFailed(e instanceof Error ? e.message : "We couldn't confirm the payment.");
    }
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
