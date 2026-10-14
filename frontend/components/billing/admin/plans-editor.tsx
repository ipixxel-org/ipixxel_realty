"use client";

import { useState } from "react";
import { Switch } from "@/components/superadmin/switch";
import { useToast } from "@/components/ui/toast";
import { formatINR, withGst } from "@/lib/billing/pricing";
import type { BillingPlan, PlanLimits, PlanModules } from "@/lib/billing/types";
import { useBillingEnv, useBillingQuery } from "../context";
import { ErrorNote, Loading, Section } from "../ui";

const LIMIT_FIELDS: { key: keyof PlanLimits; label: string }[] = [
  { key: "users", label: "Users" },
  { key: "projects", label: "Projects" },
  { key: "landingPages", label: "Landing pages" },
  { key: "templates", label: "Templates" },
];

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

function PlanCard({ initial }: { initial: BillingPlan }) {
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
  const yearlySaving = plan.priceMonthly > 0 ? Math.round((1 - plan.priceYearly / (plan.priceMonthly * 12)) * 100) : 0;

  async function save() {
    setBusy(true);
    try {
      const p = await client.saveAdminPlan(plan);
      setSaved(p);
      setPlan(p);
      toast({ variant: "success", title: `${p.name} saved`, description: "New purchases use it now; existing subscriptions from their next renewal." });
    } catch (e) {
      toast({ variant: "error", title: "Couldn't save the plan", description: e instanceof Error ? e.message : undefined });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section
      title={
        <span className="bl-row" style={{ gap: 8 }}>
          {plan.name}
          {plan.isFree ? <span className="badge b-green">Free plan</span> : null}
        </span>
      }
      sub={plan.isFree ? "Free forever · new sign-ups start here, and orgs fall back to it" : `${formatINR(plan.priceMonthly)}/mo (${formatINR(withGst(plan.priceMonthly))} incl. GST)`}
      action={
        <div className="bl-row" style={{ gap: 8 }}>
          {dirty ? <span className="bl-muted">Unsaved</span> : null}
          <button type="button" className="btn btn-ghost btn-sm" disabled={!dirty} onClick={() => setPlan(saved)}>
            Discard
          </button>
          <button type="button" className="btn btn-primary btn-sm" disabled={!dirty || busy || !canEdit} onClick={() => void save()}>
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      }
    >
      <div className="bl-stack" style={{ gap: 14 }}>
        <div className="row2">
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Monthly price (₹, before GST)</label>
            <input className="inp" type="number" min={0} value={plan.priceMonthly} disabled={plan.isFree} onChange={(e) => set({ priceMonthly: Math.max(0, Number(e.target.value) || 0) })} />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Yearly price (₹, before GST)</label>
            <input className="inp" type="number" min={0} value={plan.priceYearly} disabled={plan.isFree} onChange={(e) => set({ priceYearly: Math.max(0, Number(e.target.value) || 0) })} />
            {!plan.isFree ? <div className="hint">{yearlySaving > 0 ? `${yearlySaving}% cheaper than 12 × monthly` : "No yearly discount"}</div> : null}
          </div>
        </div>
        {initial.isFree ? (
          <label className="bl-row" style={{ gap: 8, fontSize: 13, cursor: "pointer" }}>
            <input type="checkbox" checked={plan.isFree} disabled onChange={() => undefined} />
            <span>
              <b>Free plan</b> — no payment, never expires. Only one plan can be the free plan.
            </span>
          </label>
        ) : null}
        <div>
          <div className="bl-strong" style={{ fontSize: 13, marginBottom: 8 }}>
            Limits
          </div>
          <div className="bl-grid4" style={{ gap: 12 }}>
            {LIMIT_FIELDS.map((f) => (
              <div className="field" key={f.key} style={{ marginBottom: 0 }}>
                <label>{f.label}</label>
                <input className="inp" type="number" min={0} placeholder="Unlimited" value={plan.limits[f.key] ?? ""} onChange={(e) => setLimit(f.key, e.target.value)} />
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
      </div>
    </Section>
  );
}

export function AdminPlansEditor() {
  const { data, error } = useBillingQuery((c) => c.listAdminPlans(), []);
  if (error) return <ErrorNote message={error} />;
  if (!data) return <Loading what="plans" />;
  return (
    <div className="bl-stack">
      {data.map((p) => (
        <PlanCard key={p.id} initial={p} />
      ))}
    </div>
  );
}
