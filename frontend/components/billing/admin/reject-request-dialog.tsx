"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { REJECTION_REASON_MAX, REJECTION_REASON_MIN } from "@/lib/api";
import { formatINR } from "@/lib/billing/pricing";

/** The problem with a rejection reason, or null when it can be sent. Same rule as the API. */
export function rejectionReasonProblem(reason: string): string | null {
  const r = reason.trim();
  if (r.length < REJECTION_REASON_MIN) return `Enter a reason for rejection (at least ${REJECTION_REASON_MIN} characters).`;
  if (r.length > REJECTION_REASON_MAX) return `Keep the reason under ${REJECTION_REASON_MAX} characters.`;
  return null;
}

/**
 * Reject a package change request. The reason is required: the organisation
 * sees it on its Billing page and in the rejection notification.
 */
export function RejectRequestDialog({
  open,
  orgName,
  paidAmount = null,
  busy = false,
  error,
  onReject,
  onClose,
}: {
  open: boolean;
  orgName: string;
  /** Marked paid (rupees): the customer has to be refunded outside the app. */
  paidAmount?: number | null;
  busy?: boolean;
  /** From the API (shown under the box). */
  error?: string | null;
  onReject: (reason: string) => void;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const problem = rejectionReasonProblem(reason);
  const close = () => {
    setReason("");
    setTouched(false);
    onClose();
  };
  return (
    <Modal
      open={open}
      onClose={close}
      closeDisabled={busy}
      title="Reject Package Change Request"
      description={`Rejecting request from ${orgName}`}
      size="md"
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={close} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-danger"
            disabled={busy}
            onClick={() => {
              setTouched(true);
              if (!problem) onReject(reason.trim());
            }}
          >
            {busy ? "Rejecting…" : "Reject Request"}
          </button>
        </>
      }
    >
      {paidAmount != null ? (
        <div role="alert" data-testid="reject-paid-warning" style={{ marginBottom: 12, padding: "10px 12px", borderRadius: 10, background: "var(--amber-050, #fffbeb)", color: "var(--amber-700, #b45309)" }}>
          This request was marked paid ({formatINR(paidAmount)}). Refund the customer outside the app.
        </div>
      ) : null}
      <div className="field">
        <label htmlFor="pcr-reject-reason">Reason for rejection</label>
        <textarea
          id="pcr-reject-reason"
          className="inp"
          rows={3}
          maxLength={REJECTION_REASON_MAX}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          onBlur={() => setTouched(true)}
          placeholder="The organisation sees this on its Billing page"
          style={{ width: "100%", padding: 10 }}
        />
        <div className="hint" style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
          <span style={touched && problem ? { color: "var(--rose, #e11d48)" } : undefined}>
            {touched && problem ? problem : `At least ${REJECTION_REASON_MIN} characters. Shown to the organisation.`}
          </span>
          <span>
            {reason.trim().length}/{REJECTION_REASON_MAX}
          </span>
        </div>
        {error ? <div className="hint" style={{ color: "var(--rose, #e11d48)" }}>{error}</div> : null}
      </div>
    </Modal>
  );
}
