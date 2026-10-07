"use client";

import { useEffect, useState } from "react";
import { getPlatformConfig, updatePlatformConfig } from "@/lib/api";
import type { PlatformConfig } from "@/lib/types";
import { formPageStyles } from "@/components/forms/form-page";

const DEFAULT_POLICY = {
  billingExpiryNotifyDays: "3",
  billingGracePeriodDays: "7",
  billingExpiryBehavior: "restrict" as "restrict" | "cancel",
  billingExpiryMessage: "",
};

export function BillingExpirySettings() {
  const [policy, setPolicy] = useState(DEFAULT_POLICY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    getPlatformConfig()
      .then((cfg: PlatformConfig) => {
        setPolicy({
          billingExpiryNotifyDays: String(cfg.billingExpiryNotifyDays ?? 3),
          billingGracePeriodDays: String(cfg.billingGracePeriodDays ?? 7),
          billingExpiryBehavior: cfg.billingExpiryBehavior === "cancel" ? "cancel" : "restrict",
          billingExpiryMessage: cfg.billingExpiryMessage ?? "",
        });
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    setSaving(true);
    setStatus(null);
    try {
      await updatePlatformConfig({
        billingExpiryNotifyDays: Math.max(0, Math.floor(Number(policy.billingExpiryNotifyDays) || 0)),
        billingGracePeriodDays: Math.max(0, Math.floor(Number(policy.billingGracePeriodDays) || 0)),
        billingExpiryBehavior: policy.billingExpiryBehavior,
        billingExpiryMessage: policy.billingExpiryMessage,
      });
      setStatus({ tone: "ok", text: "Expiry policy saved — enforced from the next lifecycle sweep." });
    } catch (e) {
      setStatus({ tone: "err", text: e instanceof Error ? e.message : "Save failed" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card reveal">
      <div className="card-h">
        <span className="t">Subscription expiry policy</span>
        <span className="chip" style={{ background: "var(--green-050)", color: "var(--green)", border: "1px solid var(--green-100)" }}>
          {loading ? "Loading…" : "API-wired"}
        </span>
      </div>
      <div className={`card-b ${formPageStyles.page}`} style={{ display: "grid", gap: 16 }}>
        <div style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.6 }}>
          Controls what happens when an organisation&apos;s subscription term ends: when members are warned, how
          long the grace window lasts, and what happens once it closes. Enforced across every org by the lifecycle
          sweep via <span className="mono" style={{ fontWeight: 700 }}>/admin/platform-config</span>.
        </div>
        <div className="row2">
          <div className="field">
            <label>Notify days before expiry</label>
            <input
              className="inp"
              type="number"
              min={0}
              value={policy.billingExpiryNotifyDays}
              onChange={(e) => setPolicy((p) => ({ ...p, billingExpiryNotifyDays: e.target.value }))}
            />
            <div className="hint">Days before renewsAt the &quot;expiring soon&quot; popup fires for org members.</div>
          </div>
          <div className="field">
            <label>Grace period (days)</label>
            <input
              className="inp"
              type="number"
              min={0}
              value={policy.billingGracePeriodDays}
              onChange={(e) => setPolicy((p) => ({ ...p, billingGracePeriodDays: e.target.value }))}
            />
            <div className="hint">Days a past-due subscription stays fully usable before action is taken.</div>
          </div>
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>When grace period ends</label>
          <select
            value={policy.billingExpiryBehavior}
            onChange={(e) => setPolicy((p) => ({ ...p, billingExpiryBehavior: e.target.value as "restrict" | "cancel" }))}
          >
            <option value="restrict">Restrict organisation (expired → publishing paused)</option>
            <option value="cancel">Cancel subscription (blocked effectively)</option>
          </select>
          <div className="hint">
            Restrict keeps the org open with publishing paused; Cancel soft-cancels the subscription (an admin can
            renew it in place).
          </div>
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Expiry notification message</label>
          <textarea
            value={policy.billingExpiryMessage}
            onChange={(e) => setPolicy((p) => ({ ...p, billingExpiryMessage: e.target.value }))}
            placeholder="Your plan has expired — renew to keep publishing…"
            style={{ minHeight: 84 }}
          />
          <div className="hint">Shown in the in-app expiry popup. Leave blank to use the platform default message.</div>
        </div>
        {status ? (
          <div
            style={{
              fontSize: 12.5,
              fontWeight: 600,
              color: status.tone === "ok" ? "var(--green)" : "var(--rose)",
            }}
          >
            {status.text}
          </div>
        ) : null}
        <div className={formPageStyles.actions}>
          <button className={formPageStyles.btn} type="button" disabled={loading} onClick={() => setPolicy(DEFAULT_POLICY)}>
            Discard
          </button>
          <button className={formPageStyles.btnPrimary} type="button" onClick={() => void save()} disabled={saving || loading}>
            {saving ? "Saving…" : "Save expiry policy"}
          </button>
        </div>
      </div>
    </div>
  );
}