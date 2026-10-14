"use client";

import { useState } from "react";
import { formPageStyles } from "@/components/forms/form-page";
import { Switch } from "@/components/superadmin/switch";
import { checkGstin, INDIAN_STATES } from "@/lib/billing/pricing";
import type { AfterGraceBehavior, LifecycleSettings, ReminderRule, SellerSettings } from "@/lib/billing/types";
import { useBillingEnv, useBillingQuery } from "../context";
import { ErrorNote, Loading, SampleDataTag } from "../ui";

const REMINDER_COPY: Record<ReminderRule["id"], { auto: string; manual: string }> = {
  before_renewal: { auto: "Heads-up: “₹X will be charged on …”", manual: "Popup + email with a Pay now button" },
  payment_day: { auto: "If the charge fails: “We couldn't charge your card”", manual: "“Your renewal is due today” with Pay now" },
  mid_grace: { auto: "Retry result + Update payment method", manual: "Reminder with the days left and Pay now" },
  day_before_grace_ends: { auto: "Final notice listing what will stay active", manual: "Same as automatic" },
};

function reminderWhen(id: ReminderRule["id"], s: LifecycleSettings): string {
  if (id === "before_renewal") return `${s.notifyDaysBefore} days before renewal`;
  if (id === "payment_day") return "On the payment day";
  if (id === "mid_grace") return `Mid-grace (day ${Math.max(1, Math.ceil(s.graceDays / 2))})`;
  return "Day before grace ends";
}

/** What the switch does right now — the effective mode needs usable Razorpay keys too. */
function paymentModeNote(s: LifecycleSettings, saved: LifecycleSettings): string {
  if (s.onlinePaymentsEnabled !== saved.onlinePaymentsEnabled) return "Save to apply.";
  if (saved.paymentMode === "online") return "Now: customers pay online with Razorpay.";
  if (saved.paymentModeReason === "keys_missing") return "Now: manual approval — add Razorpay keys in Integrations → Razorpay to take payments online.";
  if (saved.paymentModeReason === "gateway_disabled") return "Now: manual approval — Razorpay is turned off in Integrations → Razorpay.";
  return "Now: manual approval.";
}

/** The platform as GST seller: printed on invoices; its state decides CGST+SGST vs IGST. */
function SellerFields({ value, onChange }: { value: SellerSettings; onChange: (patch: Partial<SellerSettings>) => void }) {
  const text = (key: keyof SellerSettings, label: string, placeholder: string, hint?: string) => (
    <div className="field">
      <label>{label}</label>
      <input
        className="inp"
        aria-label={label}
        value={value[key] ?? ""}
        placeholder={placeholder}
        onChange={(e) => onChange({ [key]: key === "gstin" ? e.target.value.toUpperCase() : e.target.value })}
      />
      {hint ? <div className="hint">{hint}</div> : null}
    </div>
  );
  const gstinError = checkGstin(value.gstin, value.state);
  return (
    <div style={{ display: "grid", gap: 4 }}>
      <b style={{ fontSize: 13.5 }}>Company tax details</b>
      <div className="hint" style={{ marginTop: 0, marginBottom: 8 }}>
        Our details as the seller on GST invoices. The state decides the tax split: same state as the buyer = CGST + SGST, otherwise IGST.
      </div>
      <div className="row2">
        {text("legalName", "Legal name", "iPixxel Technologies Pvt. Ltd.")}
        <div className="field">
          <label>GSTIN</label>
          <input className="inp" aria-label="GSTIN" maxLength={15} value={value.gstin ?? ""} placeholder="29ABCDE1234F1Z5" onChange={(e) => onChange({ gstin: e.target.value.toUpperCase() })} />
          {gstinError ? <div className="hint" style={{ color: "var(--rose)" }}>{gstinError}</div> : null}
        </div>
      </div>
      <div className="row2">
        {text("addressLine1", "Address", "Building, street, area")}
        {text("addressLine2", "Address line 2", "Optional")}
      </div>
      <div className="row2">
        {text("city", "City", "Bengaluru")}
        <div className="field">
          <label>State</label>
          <select aria-label="Company state" value={value.state ?? ""} onChange={(e) => onChange({ state: e.target.value || null })}>
            <option value="">Not set — every checkout is charged IGST</option>
            {INDIAN_STATES.map((st) => (
              <option key={st.code} value={st.code}>
                {st.name} ({st.code})
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="row2">
        {text("pincode", "PIN code", "560001")}
        <div />
      </div>
    </div>
  );
}

function Editor({ initial }: { initial: LifecycleSettings }) {
  const { client, canEdit } = useBillingEnv();
  const [saved, setSaved] = useState(initial);
  const [s, setS] = useState(initial);
  const [status, setStatus] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<LifecycleSettings>) => {
    setS((p) => ({ ...p, ...patch }));
    setStatus(null);
  };

  async function save() {
    const gstinError = checkGstin(s.seller.gstin, s.seller.state);
    if (gstinError) {
      setStatus({ tone: "err", text: `Company GSTIN: ${gstinError}` });
      return;
    }
    // Empty text = not set.
    const seller = Object.fromEntries(Object.entries(s.seller).map(([k, v]) => [k, typeof v === "string" && v.trim() ? v.trim() : null])) as unknown as SellerSettings;
    setBusy(true);
    try {
      const next = await client.saveLifecycleSettings({ ...s, seller });
      setSaved(next);
      setS(next);
      setStatus({ tone: "ok", text: "Lifecycle settings saved — they apply from the next daily check." });
    } catch (e) {
      setStatus({ tone: "err", text: e instanceof Error ? e.message : "Save failed" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bl-stack">
      <div className="card">
        <div className="card-h">
          <span className="t">Subscription expiry policy</span>
          <SampleDataTag fns={["getLifecycleSettings"]} />
        </div>
        <div className={`card-b ${formPageStyles.page}`} style={{ display: "grid", gap: 16 }}>
          {saved.warnings.map((w) => (
            <div key={w.code} className="form-alert" role="status">
              {w.message}
            </div>
          ))}
          <div style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.6 }}>
            Controls what happens when an organisation&apos;s subscription term ends: when members are warned, how long the grace window lasts, and what happens once it
            closes.
          </div>
          <div className="row2">
            <div className="field">
              <label>Notify days before expiry</label>
              <input className="inp" type="number" min={0} value={s.notifyDaysBefore} onChange={(e) => set({ notifyDaysBefore: Math.max(0, Math.floor(Number(e.target.value) || 0)) })} />
              <div className="hint">Days before renewal that the &apos;expiring soon&apos; popup fires for org members.</div>
            </div>
            <div className="field">
              <label>Grace period (days)</label>
              <input className="inp" type="number" min={0} value={s.graceDays} onChange={(e) => set({ graceDays: Math.max(0, Math.floor(Number(e.target.value) || 0)) })} />
              <div className="hint">Days a past-due subscription stays fully usable before action is taken.</div>
            </div>
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>When grace period ends</label>
            <select value={s.afterGrace} onChange={(e) => set({ afterGrace: e.target.value as AfterGraceBehavior })}>
              <option value="fall_back_to_basic" disabled={!s.supports.fallBackToBasic}>
                Fall back to Basic (recommended){s.supports.fallBackToBasic ? "" : " — coming soon"}
              </option>
              <option value="restrict">Restrict organisation (expired → publishing paused)</option>
              <option value="cancel">Cancel subscription (blocked effectively)</option>
            </select>
            <div className="hint">
              {s.afterGrace === "fall_back_to_basic"
                ? "The org moves to the free plan: what fits Basic stays active (their “Choose what stays” picks, or ours), everything else is paused — never deleted — and leads keep coming in. Buying again restores everything."
                : "Restrict keeps the org open with publishing paused; Cancel soft-cancels the subscription (an admin can renew it in place)."}
            </div>
          </div>
          <div className="bl-between" style={{ padding: "12px 0", borderTop: "1px solid var(--line)", borderBottom: "1px solid var(--line)" }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <b style={{ fontSize: 13.5 }}>Online payments (Razorpay)</b>
              <div className="hint" style={{ marginTop: 2 }}>When off, upgrades are sent to Super Admin for manual approval.</div>
              <div className="hint" style={{ marginTop: 4 }}>{paymentModeNote(s, saved)}</div>
            </div>
            <Switch checked={s.onlinePaymentsEnabled} onChange={(on) => set({ onlinePaymentsEnabled: on })} />
          </div>
          <SellerFields value={s.seller} onChange={(patch) => set({ seller: { ...s.seller, ...patch } })} />
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Expiry notification message</label>
            <textarea value={s.expiryMessage} onChange={(e) => set({ expiryMessage: e.target.value })} placeholder="Your plan has expired — renew to keep publishing…" style={{ minHeight: 84 }} />
            <div className="hint">Shown in the in-app expiry popup. Leave blank to use the platform default message.</div>
          </div>
          {status ? <div style={{ fontSize: 12.5, fontWeight: 600, color: status.tone === "ok" ? "var(--green)" : "var(--rose)" }}>{status.text}</div> : null}
          <div className={formPageStyles.actions}>
            <button className={formPageStyles.btn} type="button" onClick={() => setS(saved)}>
              Discard
            </button>
            <button className={formPageStyles.btnPrimary} type="button" onClick={() => void save()} disabled={busy || !canEdit}>
              {busy ? "Saving…" : "Save expiry policy"}
            </button>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-h">
          <span className="t">Reminder schedule</span>
          <span className="x">{s.supports.reminderSchedule ? "Email + in-app · to the owner and admins" : "Fixed schedule for now · email + in-app to the owner and admins"}</span>
        </div>
        <div className="card-b" style={{ padding: 0 }}>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Automatic renewal</th>
                  <th>Pay each time</th>
                  <th>On</th>
                </tr>
              </thead>
              <tbody>
                {s.reminders.map((r) => (
                  <tr key={r.id}>
                    <td className="bl-strong" style={{ whiteSpace: "nowrap" }}>
                      {reminderWhen(r.id, s)}
                    </td>
                    <td>{REMINDER_COPY[r.id].auto}</td>
                    <td>{REMINDER_COPY[r.id].manual}</td>
                    <td>
                      {s.supports.reminderSchedule ? (
                        <Switch checked={r.enabled} onChange={(on) => set({ reminders: s.reminders.map((x) => (x.id === r.id ? { ...x, enabled: on } : x)) })} />
                      ) : (
                        <div className={`switch${r.enabled ? " on" : ""}`} aria-disabled="true" title="This schedule is fixed for now" style={{ opacity: 0.5, cursor: "not-allowed" }} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Replaces the live "Subscription expiry policy" card when billing v2 is on. */
export function LifecycleSettingsCard() {
  const { data, error } = useBillingQuery((c) => c.getLifecycleSettings(), []);
  if (error) return <ErrorNote message={error} />;
  if (!data) return <Loading what="lifecycle settings" />;
  return <Editor initial={data} />;
}
