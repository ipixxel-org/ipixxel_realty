"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { formPageStyles } from "@/components/forms/form-page";
import { Switch } from "@/components/superadmin/switch";
import { useAuth } from "@/lib/auth-context";
import type { LifecycleRunResult, LifecycleSettings, ManualReason, ReminderRule } from "@/lib/billing/types";
import { useBillingEnv, useBillingQuery } from "../context";
import { ErrorNote, Loading, SampleDataTag } from "../ui";
import { COMPANY_TAX_HREF } from "./company";

const RAZORPAY_HREF = "/admin-console/integrations/razorpay";
const days = (n: number) => `${n} ${n === 1 ? "day" : "days"}`;

/**
 * The reminders we send, with timings worked out from the settings (one row
 * each). The mid-grace one only exists with a grace period of 3+ days; the
 * last-day one needs a grace period at all.
 */
export function reminderRows(s: Pick<LifecycleSettings, "notifyDaysBefore" | "graceDays" | "reminders">): { rule: ReminderRule; when: string; what: string }[] {
  const out: { rule: ReminderRule; when: string; what: string }[] = [];
  for (const rule of s.reminders) {
    if (rule.id === "before_renewal") {
      out.push({
        rule,
        when: s.notifyDaysBefore > 0 ? `${days(s.notifyDaysBefore)} before renewal` : "On the renewal date",
        what: "“Your plan renews on …” — the amount is on the Billing page with Pay now.",
      });
    } else if (rule.id === "payment_day") {
      out.push({ rule, when: "On the renewal date, if unpaid", what: "“Your renewal was due on …” — grace starts and everything keeps working." });
    } else if (rule.id === "mid_grace") {
      if (s.graceDays >= 3) out.push({ rule, when: `${days(Math.ceil(s.graceDays / 2))} into grace`, what: "A reminder with the date grace ends and Pay now." });
    } else if (s.graceDays >= 1) {
      out.push({ rule, when: "1 day before grace ends", what: "Final notice: unpaid, the organisation moves to Basic and anything over Basic's limits is paused." });
    }
  }
  return out;
}

const MANUAL_WHY: Record<ManualReason, string> = {
  switched_off: "the switch is off",
  keys_missing: "no Razorpay keys are saved in Integrations → Razorpay (or the server's RAZORPAY_* settings)",
  gateway_disabled: "Razorpay is turned off in Integrations → Razorpay",
};

/** Switch on, but Razorpay can't be used: say why the platform is still in manual mode. */
function PaymentModeWarning({ saved }: { saved: LifecycleSettings }) {
  if (!saved.onlinePaymentsEnabled || saved.paymentMode === "online") return null;
  return (
    <div className="form-alert" role="status">
      Online payments are switched on, but customers can&apos;t pay online yet: {MANUAL_WHY[saved.paymentModeReason ?? "keys_missing"]}. Until that&apos;s fixed the platform runs in manual
      mode — upgrades are requests you approve in Package Requests. <Link href={RAZORPAY_HREF}>Open Razorpay settings</Link>
    </div>
  );
}

/** Shown to the super_admin role only; the backend refuses other roles too. */
function SuperAdminOnly({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  return user?.roleKeys?.includes("super_admin") ? <>{children}</> : null;
}

/** "Run lifecycle check now" — a testing aid (walkthroughs show it on the mock). */
function RunLifecycleNow() {
  const { client } = useBillingEnv();
  return client.isMock ? (
    <RunLifecycleNowRow />
  ) : (
    <SuperAdminOnly>
      <RunLifecycleNowRow />
    </SuperAdminOnly>
  );
}

function RunLifecycleNowRow() {
  const { client } = useBillingEnv();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  async function run() {
    setBusy(true);
    try {
      const r: LifecycleRunResult = await client.runLifecycleCheck();
      const parts = [
        `${r.scanned} checked`,
        r.newlyPastDue ? `${r.newlyPastDue} into grace` : null,
        r.movedToFreePlan ? `${r.movedToFreePlan} moved to Basic` : null,
        r.scheduledPlanApplied ? `${r.scheduledPlanApplied} scheduled changes applied` : null,
        r.newlyExpired ? `${r.newlyExpired} expired` : null,
        r.newlyCancelled ? `${r.newlyCancelled} cancelled` : null,
        r.remindersSent ? `${r.remindersSent} reminders sent` : null,
      ].filter(Boolean);
      setResult({ tone: "ok", text: `Done: ${parts.join(", ")}.` });
    } catch (e) {
      setResult({ tone: "err", text: e instanceof Error ? e.message : "Couldn't run the check." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bl-between" style={{ padding: "12px 0 0", borderTop: "1px solid var(--line)" }}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <b style={{ fontSize: 13.5 }}>Run lifecycle check now</b>
        <div className="hint" style={{ marginTop: 2 }}>
          Applies due renewals, grace, Basic fall-backs, scheduled changes and reminders straight away, instead of at the next hourly check. Recorded in the audit log.
        </div>
        {result ? <div style={{ fontSize: 12.5, fontWeight: 600, marginTop: 4, color: result.tone === "ok" ? "var(--green)" : "var(--rose)" }}>{result.text}</div> : null}
      </div>
      <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void run()}>
        {busy ? "Running…" : "Run now"}
      </button>
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
  const rows = reminderRows(s);

  async function save() {
    setBusy(true);
    try {
      // Billing v2 always falls back to Basic when grace ends.
      const next = await client.saveLifecycleSettings({ ...s, afterGrace: "fall_back_to_basic" });
      setSaved(next);
      setS(next);
      setStatus({ tone: "ok", text: "Settings saved — they apply from the next check (hourly, and whenever an organisation opens Billing)." });
    } catch (e) {
      setStatus({ tone: "err", text: e instanceof Error ? e.message : "Save failed" });
    } finally {
      setBusy(false);
    }
  }

  const actions = (
    <div className={formPageStyles.actions}>
      <button className={formPageStyles.btn} type="button" onClick={() => setS(saved)}>
        Discard
      </button>
      <button className={formPageStyles.btnPrimary} type="button" onClick={() => void save()} disabled={busy || !canEdit}>
        {busy ? "Saving…" : "Save expiry policy"}
      </button>
    </div>
  );

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
              {w.code === "seller_state_missing" ? (
                <>
                  {" "}
                  <Link href={COMPANY_TAX_HREF}>Company &amp; tax details</Link>
                </>
              ) : null}
            </div>
          ))}
          <div style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.6 }}>
            Controls what happens when an organisation&apos;s subscription term ends: when admins are reminded, how long the grace window lasts, and what happens once it
            closes.
          </div>
          <div className="row2">
            <div className="field">
              <label>Notify days before expiry</label>
              <input className="inp" type="number" min={0} value={s.notifyDaysBefore} onChange={(e) => set({ notifyDaysBefore: Math.max(0, Math.floor(Number(e.target.value) || 0)) })} />
              <div className="hint">From this many days before renewal, admins see Pay now and the renewal reminder.</div>
            </div>
            <div className="field">
              <label>Grace period (days)</label>
              <input className="inp" type="number" min={0} value={s.graceDays} onChange={(e) => set({ graceDays: Math.max(0, Math.floor(Number(e.target.value) || 0)) })} />
              <div className="hint">Counted from the renewal date. A past-due subscription keeps working until then.</div>
            </div>
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>When grace period ends</label>
            <div className="inp" aria-readonly="true" style={{ background: "var(--surface-2)" }}>
              Fall back to Basic
            </div>
            <div className="hint">
              The organisation moves to the free plan: what fits Basic stays active (their “Choose what stays” picks, or ours), everything else is paused — never deleted —
              and leads keep coming in. Buying again restores everything.
            </div>
          </div>
          <div className="bl-between" style={{ padding: "12px 0", borderTop: "1px solid var(--line)", borderBottom: "1px solid var(--line)" }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <b style={{ fontSize: 13.5 }}>Online payments (Razorpay)</b>
              <div className="hint" style={{ marginTop: 2 }}>
                Customers pay online only when this is on <i>and</i> Razorpay keys are working. Otherwise upgrades are sent to Super Admin for manual approval.
              </div>
              {s.onlinePaymentsEnabled !== saved.onlinePaymentsEnabled ? <div className="hint" style={{ marginTop: 4 }}>Save to apply.</div> : null}
            </div>
            <Switch checked={s.onlinePaymentsEnabled} onChange={(on) => set({ onlinePaymentsEnabled: on })} />
          </div>
          <PaymentModeWarning saved={saved} />
          <div className="hint" style={{ marginTop: 0 }}>
            Company name, GSTIN, state and address for invoices: <Link href={COMPANY_TAX_HREF}>Company &amp; tax details</Link>.
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Expiry notification message</label>
            <textarea value={s.expiryMessage} onChange={(e) => set({ expiryMessage: e.target.value })} placeholder="Your plan has expired — renew to keep publishing…" style={{ minHeight: 84 }} />
            <div className="hint">Used in the “renews soon” notification. Leave blank to use the platform default message.</div>
          </div>
          {status ? <div style={{ fontSize: 12.5, fontWeight: 600, color: status.tone === "ok" ? "var(--green)" : "var(--rose)" }}>{status.text}</div> : null}
          {actions}
          <RunLifecycleNow />
        </div>
      </div>

      <div className="card">
        <div className="card-h">
          <span className="t">Reminder schedule</span>
          <span className="x">In-app notifications to the organisation&apos;s admins</span>
        </div>
        <div className="card-b" style={{ padding: 0 }}>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>When</th>
                  <th>What they get</th>
                  <th>On</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ rule, when, what }) => (
                  <tr key={rule.id}>
                    <td className="bl-strong" style={{ whiteSpace: "nowrap" }}>
                      {when}
                    </td>
                    <td>{what}</td>
                    <td>
                      <Switch
                        checked={rule.enabled}
                        onChange={(on) => set({ reminders: s.reminders.map((x) => (x.id === rule.id ? { ...x, enabled: on } : x)) })}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="hint" style={{ padding: "10px 16px" }}>
            Switches are saved with “Save expiry policy”. Each reminder goes out once per renewal date.
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
