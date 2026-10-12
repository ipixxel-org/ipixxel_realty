// Razorpay Checkout, loaded on demand. The page never decides that a payment
// succeeded: Checkout's success handler only hands us a signed payload, which
// is posted to the backend /verify endpoint; the server checks the HMAC (and
// the webhook confirms independently). Amounts are integer paise throughout.

import { apiFetch } from "@/lib/api";
import type { PaymentRow, PaymentStatus } from "@/lib/types";

const CHECKOUT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

interface RazorpaySuccess {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

interface RazorpayFailure {
  error?: { code?: string; description?: string; reason?: string };
}

interface RazorpayInstance {
  open: () => void;
  on: (event: "payment.failed", cb: (res: RazorpayFailure) => void) => void;
}

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance;
  }
}

let loader: Promise<void> | null = null;

/** Inject checkout.js once; resolves when window.Razorpay is available. */
export function loadRazorpayCheckout(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("Checkout needs a browser"));
  if (window.Razorpay) return Promise.resolve();
  loader ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = CHECKOUT_SRC;
    script.async = true;
    script.onload = () => (window.Razorpay ? resolve() : reject(new Error("Razorpay Checkout failed to load")));
    script.onerror = () => {
      script.remove();
      loader = null; // allow a retry
      reject(new Error("Could not load Razorpay Checkout. Check your connection and try again."));
    };
    document.body.appendChild(script);
  });
  return loader;
}

export type CheckoutFailureReason = "dismissed" | "failed" | "verify_failed" | "load_failed";

export interface OpenCheckoutOptions {
  orderId: string;
  amount: number; // paise
  currency: string;
  keyId: string;
  name?: string;
  description?: string;
  prefill?: { name?: string; email?: string; contact?: string };
  /** Backend verify endpoint. Org flows use the default. */
  verifyPath?: string;
  /** Called after the server verified the signature. `payment.status` is
   *  "captured", or "pending" when capture is still in progress. */
  onSuccess: (payment: PaymentRow) => void;
  onFailure: (reason: CheckoutFailureReason, message: string) => void;
}

/**
 * Open Razorpay Checkout for a server-created order and verify the result
 * server-side. Every outcome ends in exactly one onSuccess/onFailure call.
 */
export async function openCheckout(opts: OpenCheckoutOptions): Promise<void> {
  try {
    await loadRazorpayCheckout();
  } catch (err) {
    opts.onFailure("load_failed", err instanceof Error ? err.message : "Could not load Razorpay Checkout.");
    return;
  }

  let settled = false;
  let lastError: string | null = null;
  const settle = (fn: () => void) => {
    if (settled) return;
    settled = true;
    fn();
  };

  const rzp = new window.Razorpay!({
    key: opts.keyId,
    order_id: opts.orderId,
    amount: opts.amount,
    currency: opts.currency,
    name: opts.name ?? "iPixxel Realty",
    description: opts.description,
    prefill: opts.prefill,
    // Retries stay inside Checkout; a failed attempt fires payment.failed but
    // the payer can still succeed on the same order.
    retry: { enabled: true },
    handler: (res: RazorpaySuccess) => {
      settled = true;
      apiFetch<PaymentRow>(opts.verifyPath ?? "/org/payments/verify", {
        method: "POST",
        body: JSON.stringify({
          razorpay_order_id: res.razorpay_order_id,
          razorpay_payment_id: res.razorpay_payment_id,
          razorpay_signature: res.razorpay_signature,
        }),
      })
        .then(opts.onSuccess)
        .catch((err: unknown) =>
          opts.onFailure(
            "verify_failed",
            err instanceof Error
              ? `We couldn't confirm the payment: ${err.message}. If money was debited it will be reconciled automatically.`
              : "We couldn't confirm the payment.",
          ),
        );
    },
    modal: {
      ondismiss: () =>
        settle(() =>
          lastError
            ? opts.onFailure("failed", lastError)
            : opts.onFailure("dismissed", "Payment cancelled. You have not been charged."),
        ),
    },
  });

  rzp.on("payment.failed", (res) => {
    lastError = res.error?.description || "The payment failed.";
  });
  rzp.open();
}

/** "₹1.00" from 100 paise. */
export function formatPaise(amount: number, currency = "INR"): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency, minimumFractionDigits: 2 }).format(
    amount / 100,
  );
}

/** Badge colours for a payment status (same palette as subscription badges). */
export function paymentStatusStyle(status: PaymentStatus): { background: string; color: string } {
  switch (status) {
    case "captured":
      return { background: "rgba(16, 185, 129, 0.1)", color: "#10b981" };
    case "pending":
    case "created":
      return { background: "rgba(245, 158, 11, 0.1)", color: "#d97706" };
    case "refunded":
      return { background: "#f1f5f9", color: "#475569" };
    default:
      return { background: "rgba(239, 68, 68, 0.1)", color: "#ef4444" };
  }
}
