"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { formatINR } from "@/lib/billing/pricing";
import { REQUEST_PAYMENT_METHODS, requestBreakdownText } from "@/lib/billing/requests";
import type { RequestPayment, RequestQuote } from "@/lib/billing/types";

export interface MarkPaidValues {
  method: (typeof REQUEST_PAYMENT_METHODS)[number];
  reference: string;
  receivedOn: string;
  note: string;
}

const todayIso = () => new Date().toISOString().slice(0, 10);

/** The problem with the form, or null when it can be saved. Same rules as the API. */
export function markPaidProblem(v: MarkPaidValues, today = todayIso()): string | null {
  if (!v.reference.trim() && v.method !== "Cash") return "Enter the UTR or cheque number (only cash needs none).";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v.receivedOn)) return "Enter the date the payment was received.";
  if (v.receivedOn > today) return "The payment date can't be in the future.";
  return null;
}

type CouponChange = { kind: "apply"; code: string } | { kind: "remove" };

/**
 * Super Admin, manual mode: record what the organisation paid for a request
 * (before approving it). The amount is the request's total incl. GST and
 * can't be typed. A coupon can be added at the top: the request is re-quoted
 * and the total, the org's Requests tab and the invoice follow it. A 100%
 * coupon makes it ₹0 — nothing to mark paid, approve directly.
 * Opened again to edit; "Clear payment" removes it until the request is decided.
 */
export function MarkPaidDialog({
  open,
  orgName,
  title,
  quote,
  existing,
  busy = false,
  error,
  couponError,
  onSave,
  onClear,
  onApplyCoupon,
  onRemoveCoupon,
  onClose,
}: {
  open: boolean;
  orgName: string;
  /** "Renewal of Pro" / "Change to Starter". */
  title: string;
  /** The request's current price breakdown (rupees). */
  quote: RequestQuote;
  existing?: RequestPayment | null;
  busy?: boolean;
  error?: string | null;
  /** Why the coupon couldn't be applied (the checkout's wording). */
  couponError?: string | null;
  onSave: (v: MarkPaidValues) => void;
  onClear?: () => void;
  onApplyCoupon?: (code: string) => void;
  onRemoveCoupon?: () => void;
  onClose: () => void;
}) {
  const [v, setV] = useState<MarkPaidValues>(() => ({
    method: (REQUEST_PAYMENT_METHODS as readonly string[]).includes(existing?.method ?? "")
      ? (existing!.method as MarkPaidValues["method"])
      : "Bank transfer",
    reference: existing?.reference ?? "",
    receivedOn: existing?.receivedOn ?? todayIso(),
    note: existing?.note ?? "",
  }));
  const [touched, setTouched] = useState(false);
  const [code, setCode] = useState("");
  // Changing the coupon after Mark as paid clears the payment: asked first.
  const [confirming, setConfirming] = useState<CouponChange | null>(null);
  const problem = markPaidProblem(v);
  const set = (patch: Partial<MarkPaidValues>) => setV((x) => ({ ...x, ...patch }));
  const free = quote.total === 0;
  const paid = existing && existing.status === "awaiting_approval" ? existing : null;

  const change = (c: CouponChange) => {
    if (paid) {
      setConfirming(c);
      return;
    }
    run(c);
  };
  const run = (c: CouponChange) => {
    setConfirming(null);
    if (c.kind === "apply") onApplyCoupon?.(c.code);
    else onRemoveCoupon?.();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      closeDisabled={busy}
      title={free ? "Nothing to pay" : existing ? "Edit payment" : "Mark as paid"}
      description={`${title} · ${orgName} · request total ${formatINR(quote.total)} incl. GST`}
      size="md"
      footer={
        <>
          {existing && onClear && !free ? (
            <button type="button" className="btn btn-ghost" style={{ marginRight: "auto", color: "var(--rose, #e11d48)" }} disabled={busy} onClick={onClear}>
              Clear payment
            </button>
          ) : null}
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
            Close
          </button>
          {free ? null : (
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy || !!confirming}
              onClick={() => {
                setTouched(true);
                if (!problem) onSave({ ...v, reference: v.reference.trim(), note: v.note.trim() });
              }}
            >
              {busy ? "Saving…" : existing ? "Save payment" : "Mark as paid"}
            </button>
          )}
        </>
      }
    >
      <div className="bl-stack" style={{ gap: 12 }}>
        <div className="field" style={{ marginBottom: 0 }} data-testid="request-coupon">
          <label htmlFor="mp-coupon">Coupon</label>
          {quote.couponCode && quote.couponAdded ? (
            <div className="bl-row" style={{ gap: 8 }}>
              <span className="badge b-violet bl-mono">{quote.couponCode}</span>
              <span className="bl-muted bl-small">−{formatINR(quote.couponDiscount)} before GST</span>
              <button type="button" className="btn btn-ghost btn-sm" style={{ marginLeft: "auto" }} disabled={busy || !!confirming} onClick={() => change({ kind: "remove" })}>
                Remove
              </button>
            </div>
          ) : (
            <>
              <div className="bl-row" style={{ gap: 8, flexWrap: "nowrap" }}>
                <input
                  id="mp-coupon"
                  className="inp"
                  maxLength={40}
                  placeholder="Coupon code"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && code.trim()) change({ kind: "apply", code: code.trim() });
                  }}
                />
                <button type="button" className="btn btn-ghost" disabled={busy || !!confirming || !code.trim()} onClick={() => change({ kind: "apply", code: code.trim() })}>
                  Apply
                </button>
              </div>
              {quote.couponCode ? (
                <div className="hint">Renewal coupon {quote.couponCode} is on this request. A code entered here replaces it.</div>
              ) : null}
            </>
          )}
          {couponError ? (
            <div className="hint" style={{ color: "var(--rose, #e11d48)" }} data-testid="request-coupon-error">
              {couponError}
            </div>
          ) : null}
          <div className="hint" data-testid="request-breakdown">
            {requestBreakdownText(quote)}
          </div>
        </div>
        {confirming && paid ? (
          <div className="bl-stack" style={{ gap: 8, padding: 10, borderRadius: 8, background: "var(--amber-50, #fffbeb)", border: "1px solid var(--amber-200, #fde68a)" }} data-testid="coupon-clears-payment">
            <div className="bl-small">
              Changing the coupon changes the total, so the payment recorded ({formatINR(paid.amount)}) is cleared. Mark it as paid again afterwards.
            </div>
            <div className="bl-row" style={{ gap: 8, justifyContent: "flex-end" }}>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirming(null)}>
                Keep it
              </button>
              <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => run(confirming)}>
                {confirming.kind === "apply" ? "Apply and clear payment" : "Remove and clear payment"}
              </button>
            </div>
          </div>
        ) : null}
        {free ? (
          <div className="bl-small" data-testid="nothing-to-pay">
            The coupon covers the whole amount, so there&apos;s nothing to mark paid. Approve the request directly. No invoice is issued.
          </div>
        ) : (
          <>
            <div className="field" style={{ marginBottom: 0 }}>
              <label htmlFor="mp-amount">Amount received (incl. GST)</label>
              <input id="mp-amount" className="inp" readOnly aria-readonly="true" value={formatINR(quote.total)} style={{ background: "var(--surface-2, #f8fafc)" }} />
              <div className="hint">Always the request total. Change it with a coupon above.</div>
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label htmlFor="mp-method">Method</label>
              <select id="mp-method" className="inp" value={v.method} onChange={(e) => set({ method: e.target.value as MarkPaidValues["method"] })}>
                {REQUEST_PAYMENT_METHODS.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label htmlFor="mp-reference">Reference (UTR / cheque no.){v.method === "Cash" ? " — optional" : ""}</label>
              <input id="mp-reference" className="inp" maxLength={100} value={v.reference} onChange={(e) => set({ reference: e.target.value })} />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label htmlFor="mp-date">Payment date</label>
              <input id="mp-date" className="inp" type="date" max={todayIso()} value={v.receivedOn} onChange={(e) => set({ receivedOn: e.target.value })} />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label htmlFor="mp-note">Note (optional)</label>
              <input id="mp-note" className="inp" maxLength={300} value={v.note} onChange={(e) => set({ note: e.target.value })} />
            </div>
          </>
        )}
        {touched && problem && !free ? <div className="hint" style={{ color: "var(--rose, #e11d48)" }}>{problem}</div> : null}
        {error ? <div className="hint" style={{ color: "var(--rose, #e11d48)" }}>{error}</div> : null}
      </div>
    </Modal>
  );
}
