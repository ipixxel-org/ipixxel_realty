"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FormPage, formPageStyles } from "@/components/forms/form-page";
import { Switch } from "@/components/superadmin/switch";
import { useToast } from "@/components/ui/toast";
import { apiFetch } from "@/lib/api";
import { setFlash } from "@/lib/flash";
import { planLimitWarnings, planLimitWarningsFor, type PlanLimitWarning } from "@/lib/billing/plan-limit-warnings";
import { formatINR, packagePriceText, yearlySaving } from "@/lib/billing/pricing";
import type { BillingPlan, PlanLimits, PlanModules } from "@/lib/billing/types";
import { useBillingEnv, useBillingQuery } from "../context";
import { BillingDialog, DialogActions } from "../dialog";
import { BLink, ErrorNote, Loading } from "../ui";

/** Same keys as app/admin-console/subscriptions/subscriptions-shared.ts. */
const SUBS_PATH = "/admin-console/subscriptions";
const SUBS_FLASH_KEY = "adminSubscriptions.flash";
const PLANS_TAB = "1";

const LIMIT_FIELDS: { key: keyof PlanLimits; label: string }[] = [
  { key: "users", label: "Users" },
  { key: "projects", label: "Projects" },
  { key: "landingPages", label: "Landing pages" },
  { key: "templates", label: "Templates" },
];

const limitLabel = (n: number | null) => (n == null ? "Unlimited" : n.toLocaleString("en-IN"));

/** "17% cheaper than 12 × monthly" — from the entered prices, only when yearly really is cheaper. */
export function yearlyHint(priceMonthly: number, priceYearly: number): string | null {
  const s = yearlySaving(priceMonthly, priceYearly);
  return s ? `${s.percent}% cheaper than 12 × monthly (saves ${formatINR(s.amount)} a year)` : null;
}

/* ------------------------------------------------------------------ Cards */

/** Amber note: a plan allows less than a cheaper one. A warning only — saving is never blocked. */
function LimitWarnings({ warnings }: { warnings: PlanLimitWarning[] }) {
  if (warnings.length === 0) return null;
  return (
    <div
      role="note"
      data-testid="plan-limit-warning"
      style={{ fontSize: 12, lineHeight: 1.5, color: "#92400e", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, padding: "8px 10px", marginBottom: 12 }}
    >
      {warnings.map((w) => (
        <div key={`${w.planId}:${w.cheaperId}:${w.key}`}>⚠ {w.text}</div>
      ))}
    </div>
  );
}

const chip: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  background: "#f8fafc",
  border: "1px solid #e2e8f0",
  padding: "3px 8px",
  borderRadius: 6,
  color: "#475569",
};

/**
 * Plan cards — the same look as the Plans & Pricing tab with billing v2 off:
 * price, short description, limit chips, Edit / Delete. Edit opens the full
 * edit form on its own page.
 */
export function AdminPlansEditor({ canDelete = false }: { canDelete?: boolean }) {
  const { client, canEdit } = useBillingEnv();
  const { toast } = useToast();
  const { data, error, reload } = useBillingQuery((c) => c.listAdminPlans(), []);
  const [deleting, setDeleting] = useState<BillingPlan | null>(null);
  const [busy, setBusy] = useState(false);
  if (error) return <ErrorNote message={error} />;
  if (!data) return <Loading what="plans" />;
  const warnings = planLimitWarnings(data);

  async function confirmDelete() {
    if (!deleting) return;
    setBusy(true);
    try {
      // Same endpoint as the Plans & Pricing tab with billing v2 off.
      await apiFetch(`/admin/plans/${encodeURIComponent(deleting.id)}`, { method: "DELETE" });
      toast({ variant: "success", title: `${deleting.name} deleted` });
      setDeleting(null);
      reload();
    } catch (e) {
      toast({ variant: "error", title: "Couldn't delete the plan", description: e instanceof Error ? e.message : undefined });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="bl-admin-plan-grid">
        {data.map((p) => (
          <div
            key={p.id}
            data-testid="admin-plan-card"
            style={{
              background: "#fff",
              borderRadius: 16,
              padding: "20px 22px",
              border: "1px solid #e2e8f0",
              boxShadow: "0 2px 6px rgba(15, 23, 42, 0.03)",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
            }}
          >
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
                <span style={{ padding: "3px 10px", borderRadius: 8, background: "rgba(21, 27, 46, 0.08)", color: "#0f1424", fontWeight: 700, fontSize: 12 }}>{p.name}</span>
                {p.isFree ? (
                  <span
                    title="Every new organisation starts on it, and organisations fall back to it. It can be edited but never deleted."
                    style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase", padding: "2px 7px", borderRadius: 6, background: "#ecfdf5", color: "#047857", border: "1px solid #a7f3d0" }}
                  >
                    Free plan
                  </span>
                ) : null}
                {p.isActive === false ? (
                  <span
                    title="Inactive: not offered to organisations. Organisations already on it keep it. It can be edited or deleted."
                    style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase", padding: "2px 7px", borderRadius: 6, background: "#f1f5f9", color: "#475569", border: "1px solid #e2e8f0" }}
                  >
                    Not offered
                  </span>
                ) : null}
              </div>

              <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                <span style={{ fontSize: 30, fontWeight: 800, color: "#0f172a", letterSpacing: "-0.03em" }}>{p.isFree ? "Free" : formatINR(p.priceMonthly)}</span>
                {!p.isFree ? <span style={{ color: "#64748b", fontWeight: 600, fontSize: 13 }}>/mo + GST</span> : null}
              </div>
              <div style={{ fontSize: 12, color: "#64748b", marginBottom: 8 }}>
                {p.isFree ? "No payment, never expires" : `${packagePriceText(p.priceYearly)} per year`}
              </div>

              <p style={{ fontSize: 12.5, color: "#64748b", marginBottom: 14, minHeight: 36, lineHeight: 1.5 }}>{p.tagline || "No description yet."}</p>

              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
                {LIMIT_FIELDS.map((f) => (
                  <span key={f.key} style={chip}>
                    {limitLabel(p.limits[f.key])} {f.label}
                  </span>
                ))}
              </div>
              <LimitWarnings warnings={warnings.filter((w) => w.planId === p.id)} />
            </div>

            <div style={{ display: "flex", gap: 8, paddingTop: 12, borderTop: "1px solid #f1f5f9" }}>
              {canEdit ? (
                <BLink
                  to="adminPlanEdit"
                  params={{ id: p.id }}
                  className="bl-admin-plan-edit"
                  style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: "1px solid #cbd5e1", background: "#fff", fontSize: 12.5, fontWeight: 600, color: "#334155", textAlign: "center" }}
                >
                  Edit Plan
                </BLink>
              ) : null}
              {canDelete && !client.isMock ? (
                <button
                  type="button"
                  onClick={() => setDeleting(p)}
                  disabled={p.isFree}
                  title={p.isFree ? "The free plan can't be deleted — edit it instead." : undefined}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 8,
                    border: "1px solid #fecaca",
                    background: "#fef2f2",
                    fontSize: 12.5,
                    fontWeight: 600,
                    color: "#ef4444",
                    cursor: p.isFree ? "not-allowed" : "pointer",
                    opacity: p.isFree ? 0.45 : 1,
                  }}
                >
                  Delete
                </button>
              ) : null}
            </div>
          </div>
        ))}
      </div>
      <BillingDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title="Delete this plan?"
        description={deleting ? `${deleting.name} will no longer be offered. Organisations already on it keep it until they change plan.` : undefined}
        footer={
          <DialogActions>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDeleting(null)}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary btn-sm" style={{ background: "var(--rose)" }} disabled={busy} onClick={() => void confirmDelete()}>
              {busy ? "Deleting…" : "Delete plan"}
            </button>
          </DialogActions>
        }
      />
    </>
  );
}

/* -------------------------------------------------------------- Edit form */

function ModuleRow({
  label,
  hint,
  on,
  onChange,
  comingLater,
  children,
}: {
  label: string;
  hint: string;
  on: boolean;
  onChange?: (v: boolean) => void;
  comingLater?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="bl-between" style={{ padding: "10px 0", borderBottom: "1px solid var(--line)" }}>
      <div style={{ minWidth: 0 }}>
        <div className="bl-row" style={{ gap: 6 }}>
          <b style={{ fontSize: 13.5 }}>{label}</b>
          {comingLater ? <span className="badge b-gray">Coming later</span> : null}
        </div>
        <div className="bl-muted">{hint}</div>
      </div>
      <div className="bl-row">
        {children}
        {comingLater ? <div className="switch" aria-disabled="true" title="Not available yet" style={{ opacity: 0.4, cursor: "not-allowed" }} /> : <Switch checked={on} onChange={onChange} />}
      </div>
    </div>
  );
}

/** The full plan form: name, prices, free-plan flag, limits and features. */
export function PlanEditForm({
  initial,
  plans,
  onSaved,
  onCancel,
}: {
  initial: BillingPlan;
  /** All plans, to warn when this one allows less than a cheaper plan. */
  plans?: BillingPlan[];
  onSaved?: (p: BillingPlan) => void;
  onCancel?: () => void;
}) {
  const { client, canEdit } = useBillingEnv();
  const { toast } = useToast();
  const [saved, setSaved] = useState(initial);
  const [plan, setPlan] = useState(initial);
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(plan) !== JSON.stringify(saved);
  const set = (patch: Partial<BillingPlan>) => setPlan((p) => ({ ...p, ...patch }));
  // Empty = unlimited (null).
  const setLimit = (key: keyof PlanLimits, v: string) => set({ limits: { ...plan.limits, [key]: v.trim() === "" ? null : Math.max(0, Math.floor(Number(v) || 0)) } });
  const setModule = (patch: Partial<PlanModules>) => set({ modules: { ...plan.modules, ...patch } });
  const hint = plan.isFree ? null : yearlyHint(plan.priceMonthly, plan.priceYearly);
  const warnings = plans ? planLimitWarningsFor(plan, plans) : [];

  async function save() {
    setBusy(true);
    try {
      const p = await client.saveAdminPlan(plan);
      setSaved(p);
      setPlan(p);
      toast({ variant: "success", title: `${p.name} saved`, description: "New purchases use it now; existing subscriptions from their next renewal." });
      const after = plans ? planLimitWarningsFor(p, plans) : [];
      if (after.length > 0) toast({ variant: "warning", title: "Check the plan limits", description: after.map((w) => w.text).join(". ") });
      onSaved?.(p);
    } catch (e) {
      toast({ variant: "error", title: "Couldn't save the plan", description: e instanceof Error ? e.message : undefined });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={formPageStyles.panel}>
      <div className="bl-stack" style={{ gap: 16 }}>
        <div className="bl-strong" style={{ fontSize: 13 }}>
          Name and price
        </div>
        <div className="row2">
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="bl-plan-name">Plan name</label>
            <input id="bl-plan-name" className="inp" value={plan.name} onChange={(e) => set({ name: e.target.value })} />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="bl-plan-tagline">Short description</label>
            <input id="bl-plan-tagline" className="inp" value={plan.tagline} placeholder="Who is this plan for?" onChange={(e) => set({ tagline: e.target.value })} />
          </div>
        </div>
        <div className="row2">
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="bl-plan-monthly">Monthly price (₹, before GST)</label>
            <input id="bl-plan-monthly" className="inp" type="number" min={0} value={plan.priceMonthly} disabled={plan.isFree} onChange={(e) => set({ priceMonthly: Math.max(0, Number(e.target.value) || 0) })} />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="bl-plan-yearly">Yearly price (₹, before GST)</label>
            <input id="bl-plan-yearly" className="inp" type="number" min={0} value={plan.priceYearly} disabled={plan.isFree} onChange={(e) => set({ priceYearly: Math.max(0, Number(e.target.value) || 0) })} />
            {hint ? <div className="hint">{hint}</div> : null}
          </div>
        </div>
        {/* Only Basic (the system plan) is free: say why its prices are locked. No control — it can't be changed. */}
        {plan.isFree ? (
          <div className="bl-muted" style={{ fontSize: 13 }} data-testid="free-plan-note">
            This is the free plan — no payment, never expires; new sign-ups start here and organisations fall back to it.
          </div>
        ) : null}

        <div>
          <div className="bl-strong" style={{ fontSize: 13, marginBottom: 8 }}>
            Limits <span className="bl-muted">— leave empty for unlimited</span>
          </div>
          <div className="bl-grid4" style={{ gap: 12 }}>
            {LIMIT_FIELDS.map((f) => (
              <div className="field" key={f.key} style={{ marginBottom: 0 }}>
                <label htmlFor={`bl-plan-limit-${f.key}`}>{f.label}</label>
                <input id={`bl-plan-limit-${f.key}`} className="inp" type="number" min={0} placeholder="Unlimited" value={plan.limits[f.key] ?? ""} onChange={(e) => setLimit(f.key, e.target.value)} />
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="bl-strong" style={{ fontSize: 13 }}>
            Features
          </div>
          <ModuleRow label="Team chat" hint="Off = read-only chat history" on={plan.modules.teamChat} onChange={(v) => setModule({ teamChat: v })} />
          <ModuleRow
            label="Meta lead ads"
            hint="Pull leads from Facebook / Instagram lead forms"
            on={plan.modules.metaLeadAds}
            onChange={(v) => setModule({ metaLeadAds: v, metaPages: v ? (plan.modules.metaPages === 0 ? 1 : plan.modules.metaPages) : 0 })}
          >
            {plan.modules.metaLeadAds ? (
              <label className="bl-row bl-muted" style={{ gap: 6 }}>
                Pages
                <input
                  className="inp"
                  type="number"
                  min={1}
                  style={{ width: 70, padding: "6px 8px" }}
                  placeholder="Unlimited"
                  value={plan.modules.metaPages ?? ""}
                  onChange={(e) => setModule({ metaPages: e.target.value.trim() === "" ? null : Math.max(1, Math.floor(Number(e.target.value) || 1)) })}
                />
              </label>
            ) : null}
          </ModuleRow>
          <ModuleRow label="WhatsApp" hint="Two-way WhatsApp inbox" on={false} comingLater />
          <ModuleRow label="AI calling" hint="AI voice agent for lead follow-ups" on={false} comingLater />
        </div>

        <LimitWarnings warnings={warnings} />

        <div className={formPageStyles.actions}>
          <button className={formPageStyles.btn} type="button" onClick={() => (onCancel ? onCancel() : setPlan(saved))}>
            Cancel
          </button>
          <button className={formPageStyles.btnPrimary} type="button" disabled={!dirty || busy || !canEdit} onClick={() => void save()}>
            {busy ? "Saving…" : "Save plan"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** /admin-console/subscriptions/plans/:id/edit with billing v2 on. */
export function AdminEditPlan({ planId }: { planId: string }) {
  const router = useRouter();
  const { data, error } = useBillingQuery((c) => c.listAdminPlans(), []);
  const plan = data?.find((p) => p.id === planId) ?? null;
  const back = (message?: string) => {
    if (message) setFlash(SUBS_FLASH_KEY, { message, tab: PLANS_TAB });
    router.push(SUBS_PATH);
  };
  return (
    <FormPage
      eyebrow="Billing · Plans & Subscriptions"
      title={plan ? `Edit ${plan.name}` : "Edit plan"}
      subtitle="Prices exclude GST. Changes apply to new purchases now and to existing subscriptions from their next renewal."
      backHref={SUBS_PATH}
      backLabel="Back to Plans & Subscriptions"
    >
      {error ? <ErrorNote message={error} /> : !data ? <Loading what="plan" /> : !plan ? <ErrorNote message="That plan doesn't exist any more." /> : <PlanEditForm initial={plan} plans={data} onSaved={(p) => back(`Plan “${p.name}” updated`)} onCancel={() => back()} />}
    </FormPage>
  );
}
