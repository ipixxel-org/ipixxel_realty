"use client";

import { useEffect, useState } from "react";
import {
  clearRazorpaySettings,
  getRazorpaySettings,
  testRazorpaySettings,
  updateRazorpaySettings,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Icon } from "@/components/icons";
import { formPageStyles } from "@/components/forms/form-page";
import type { RazorpaySettingsView } from "@/lib/types";

/** The API returns this in place of a stored secret; sending it back keeps it. */
const SECRET_MASK = "••••••••";
const WEBHOOK_EVENTS = ["payment.captured", "order.paid", "payment.failed", "refund.processed"];

type Status = { tone: "ok" | "err"; text: string } | null;

function SecretInput({
  id,
  value,
  onChange,
  placeholder,
  disabled,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  disabled: boolean;
}) {
  const [show, setShow] = useState(false);
  const masked = value === SECRET_MASK;
  return (
    <div style={{ position: "relative", display: "flex" }}>
      <input
        id={id}
        type={show && !masked ? "text" : "password"}
        className="inp inp-mono"
        placeholder={placeholder}
        value={value}
        // Clicking into a saved (masked) secret clears it so a new one can be typed;
        // leaving it empty on save keeps the stored value.
        onFocus={() => masked && onChange("")}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        autoComplete="new-password"
        style={{ paddingRight: 40 }}
      />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        title={masked ? "Saved secrets can't be shown" : show ? "Hide secret" : "Show secret"}
        disabled={masked || disabled}
        style={{
          position: "absolute",
          right: 8,
          top: "50%",
          transform: "translateY(-50%)",
          background: "transparent",
          border: "none",
          cursor: masked || disabled ? "default" : "pointer",
          color: "#64748b",
          padding: 4,
          display: "flex",
          opacity: masked ? 0.4 : 1,
        }}
      >
        <Icon name={show && !masked ? "eye-off" : "eye"} size={16} />
      </button>
    </div>
  );
}

export function RazorpaySettings() {
  const { user } = useAuth();
  const canEdit = !!(user?.platformUnrestricted || user?.roleKeys?.includes("super_admin"));

  const [view, setView] = useState<RazorpaySettingsView | null>(null);
  const [keyId, setKeyId] = useState("");
  const [keySecret, setKeySecret] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const [copied, setCopied] = useState(false);

  function apply(v: RazorpaySettingsView) {
    setView(v);
    setKeyId(v.keyId);
    setKeySecret(v.keySecret);
    setWebhookSecret(v.webhookSecret);
    setIsActive(v.isActive);
  }

  useEffect(() => {
    getRazorpaySettings()
      .then(apply)
      .catch((e: unknown) => setStatus({ tone: "err", text: e instanceof Error ? e.message : "Could not load settings." }))
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    setSaving(true);
    setStatus(null);
    try {
      const res = await updateRazorpaySettings({
        keyId: keyId.trim(),
        // Blank or the mask = keep the saved secret.
        keySecret: keySecret.trim() || SECRET_MASK,
        webhookSecret: webhookSecret.trim() || SECRET_MASK,
        isActive,
      });
      apply(res);
      setStatus({
        tone: "ok",
        text: res.ready
          ? `Razorpay credentials saved (${res.mode} mode). Payments use them immediately — no server restart needed.`
          : "Saved. Payments are switched off until “Enable Razorpay payments” is ticked.",
      });
    } catch (e) {
      setStatus({ tone: "err", text: e instanceof Error ? e.message : "Save failed" });
    } finally {
      setSaving(false);
    }
  }

  async function test() {
    setTesting(true);
    setStatus(null);
    try {
      const res = await testRazorpaySettings({ keyId: keyId.trim(), keySecret: keySecret.trim() || SECRET_MASK });
      setStatus({ tone: "ok", text: `Connected to Razorpay successfully (${res.mode} mode). Remember to save.` });
    } catch (e) {
      setStatus({ tone: "err", text: e instanceof Error ? e.message : "Connection test failed" });
    } finally {
      setTesting(false);
    }
  }

  async function removeSaved() {
    setSaving(true);
    setStatus(null);
    try {
      const res = await clearRazorpaySettings();
      apply(res);
      setStatus({
        tone: "ok",
        text: res.source === "env" ? "Saved keys removed. Using the RAZORPAY_* keys from the server .env." : "Saved keys removed. Razorpay is not configured.",
      });
    } catch (e) {
      setStatus({ tone: "err", text: e instanceof Error ? e.message : "Could not remove keys" });
    } finally {
      setSaving(false);
    }
  }

  async function copyWebhook() {
    if (!view) return;
    try {
      await navigator.clipboard.writeText(view.webhookUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }

  const busy = loading || saving || testing;
  const typedMode = keyId.startsWith("rzp_live_") ? "live" : keyId.startsWith("rzp_test_") ? "test" : null;

  let chip: { text: string; style: React.CSSProperties };
  if (loading) chip = { text: "Loading…", style: { background: "#f1f5f9", color: "#475569", border: "1px solid #e2e8f0" } };
  else if (view?.ready)
    chip = {
      text: `Active • ${view.mode === "live" ? "Live" : "Test"} mode${view.source === "env" ? " (.env)" : ""}`,
      style: { background: "#ecfdf5", color: "#065f46", border: "1px solid #a7f3d0" },
    };
  else if (view?.configured) chip = { text: "Configured • Turned off", style: { background: "#fffbeb", color: "#92400e", border: "1px solid #fde68a" } };
  else chip = { text: "Setup Required", style: { background: "#fffbeb", color: "#92400e", border: "1px solid #fde68a" } };

  return (
    <div className="card reveal in" style={{ marginBottom: 24 }}>
      <div className="card-h" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Icon name="billing" size={20} />
          <span className="t" style={{ fontSize: 16 }}>Razorpay (Orders &amp; Checkout)</span>
        </div>
        <span className="chip" style={chip.style}>
          {chip.text}
        </span>
      </div>

      <div className={`card-b ${formPageStyles.page}`} style={{ display: "grid", gap: 18 }}>
        <p className="muted" style={{ fontSize: 13.5, margin: 0, lineHeight: 1.55 }}>
          Accept online payments from organisations through Razorpay Checkout. Amounts are always computed on the server.
          <br />
          <strong style={{ color: "#334155" }}>
            Managed here in your Super Admin console — saved keys apply immediately, no server restart required.
          </strong>
          {view?.source === "env" ? (
            <>
              <br />
              Currently using the <code>RAZORPAY_*</code> keys from the server <code>.env</code>. Saving here overrides them.
            </>
          ) : null}
        </p>

        {!canEdit && !loading ? (
          <div className="muted" role="note" style={{ fontSize: 13 }}>
            Only a Super Admin can change payment gateway credentials.
          </div>
        ) : null}

        <div className="field">
          <label htmlFor="rzp-key-id" style={{ fontWeight: 600, display: "flex", justifyContent: "space-between" }}>
            <span>Key ID</span>
            <span className="hint">Dashboard → Account &amp; Settings → API Keys</span>
          </label>
          <input
            id="rzp-key-id"
            className="inp inp-mono"
            placeholder="rzp_test_… or rzp_live_…"
            value={keyId}
            onChange={(e) => setKeyId(e.target.value)}
            disabled={busy || !canEdit}
            autoComplete="off"
          />
        </div>

        <div className="row2" style={{ gap: 16 }}>
          <div className="field">
            <label htmlFor="rzp-key-secret" style={{ fontWeight: 600, display: "flex", justifyContent: "space-between" }}>
              <span>Key Secret</span>
              <span className="hint">{view?.hasKeySecret ? "Saved — leave blank to keep" : "Shown once when you generate the key"}</span>
            </label>
            <SecretInput
              id="rzp-key-secret"
              value={keySecret}
              onChange={setKeySecret}
              placeholder="Key secret"
              disabled={busy || !canEdit}
            />
          </div>

          <div className="field">
            <label htmlFor="rzp-webhook-secret" style={{ fontWeight: 600, display: "flex", justifyContent: "space-between" }}>
              <span>Webhook Secret</span>
              <span className="hint">{view?.hasWebhookSecret ? "Saved — leave blank to keep" : "The secret you set on the webhook"}</span>
            </label>
            <SecretInput
              id="rzp-webhook-secret"
              value={webhookSecret}
              onChange={setWebhookSecret}
              placeholder="Webhook secret"
              disabled={busy || !canEdit}
            />
          </div>
        </div>

        {typedMode === "live" ? (
          <div role="note" style={{ padding: "10px 14px", borderRadius: 8, fontSize: 13, background: "#fffbeb", color: "#92400e", border: "1px solid #fde68a" }}>
            This is a <strong>live</strong> key: payments will charge real money. The ₹1 test payment in Payments is disabled in live mode.
          </div>
        ) : null}

        <div className="field" style={{ marginBottom: 0 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: canEdit ? "pointer" : "default" }}>
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              disabled={busy || !canEdit}
              style={{ width: 16, height: 16, cursor: "pointer" }}
            />
            <span>Enable Razorpay payments across the platform</span>
          </label>
        </div>

        {/* Webhook setup instructions */}
        <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 12, padding: "14px 16px", fontSize: 13, lineHeight: 1.5 }}>
          <div style={{ fontWeight: 600, color: "#1e293b", marginBottom: 6 }}>Razorpay Webhook Configuration</div>
          <div style={{ color: "#64748b", marginBottom: 12 }}>
            In your{" "}
            <a
              href="https://dashboard.razorpay.com/app/webhooks"
              target="_blank"
              rel="noreferrer"
              style={{ color: "#2563eb", textDecoration: "underline", fontWeight: 500 }}
            >
              Razorpay Dashboard → Account &amp; Settings → Webhooks
            </a>
            , add a webhook with this URL, the same secret as above, and these events:{" "}
            {WEBHOOK_EVENTS.map((e, i) => (
              <span key={e}>
                <code>{e}</code>
                {i < WEBHOOK_EVENTS.length - 1 ? ", " : "."}
              </span>
            ))}
          </div>

          <div style={{ fontSize: 11.5, fontWeight: 600, color: "#475569", textTransform: "uppercase" }}>Webhook URL:</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 3 }}>
            <code style={{ background: "#ffffff", border: "1px solid #cbd5e1", borderRadius: 6, padding: "4px 8px", flex: 1, fontSize: 12.5, overflowWrap: "anywhere" }}>
              {view?.webhookUrl ?? "…"}
            </code>
            <button type="button" className="btn btn-secondary btn-sm" onClick={copyWebhook} disabled={!view} style={{ whiteSpace: "nowrap" }}>
              <Icon name={copied ? "check" : "copy"} size={13} />
              <span>{copied ? "Copied" : "Copy"}</span>
            </button>
          </div>
          <div style={{ color: "#64748b", marginTop: 8, fontSize: 12 }}>
            Razorpay must be able to reach this URL. For local testing, expose the API with a tunnel and set <code>BACKEND_PUBLIC_URL</code>.
          </div>
        </div>

        {status && (
          <div
            role="status"
            style={{
              padding: "10px 14px",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 500,
              background: status.tone === "ok" ? "#ecfdf5" : "#fef2f2",
              color: status.tone === "ok" ? "#065f46" : "#991b1b",
              border: `1px solid ${status.tone === "ok" ? "#a7f3d0" : "#fecaca"}`,
            }}
          >
            {status.text}
          </div>
        )}

        {canEdit ? (
          <div className={formPageStyles.actions}>
            {view?.source === "database" ? (
              <button type="button" className="btn btn-ghost btn-sm" onClick={removeSaved} disabled={busy} style={{ marginRight: "auto" }}>
                <Icon name="trash" size={14} /> Remove saved keys
              </button>
            ) : null}
            <button type="button" className="btn btn-secondary" onClick={test} disabled={busy || !keyId.trim()}>
              <Icon name="refresh" size={16} />
              {testing ? "Testing…" : "Test connection"}
            </button>
            <button type="button" className={formPageStyles.btnPrimary} onClick={save} disabled={busy}>
              <Icon name="check" size={16} />
              {saving ? "Saving to Database…" : "Save Razorpay"}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
