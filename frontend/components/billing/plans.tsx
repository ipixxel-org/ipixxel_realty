"use client";

import { useState, type ReactNode } from "react";
import { Icon } from "@/components/icons";
import { Seg } from "@/components/superadmin/seg";
import { formatINR } from "@/lib/billing/pricing";
import type { BillingInterval, BillingPlan } from "@/lib/billing/types";
import { useBillingQuery, useOrgBilling } from "./context";
import { BLink, countLabel, ErrorNote, Loading, PlanPrice, Section, planFeatureRows, useCheckoutLive } from "./ui";

function Yes({ on, children }: { on: boolean; children?: ReactNode }) {
  return on ? <span className="bl-yes">✓ {children}</span> : <span className="bl-no">—</span>;
}

export function IntervalToggle({ value, onChange }: { value: BillingInterval; onChange: (v: BillingInterval) => void }) {
  return (
    <div className="bl-row">
      <Seg options={["Monthly", "Yearly"]} value={value === "yearly" ? 1 : 0} onChange={(i) => onChange(i === 1 ? "yearly" : "monthly")} />
      <span className="badge b-green">Yearly: 2 months free</span>
    </div>
  );
}

/** Plan cards + comparison. The interval toggle lives in the page head (or the walkthrough). */
export function PlansScreen({ interval: controlled, onIntervalChange }: { interval?: BillingInterval; onIntervalChange?: (v: BillingInterval) => void }) {
  const { overview } = useOrgBilling();
  const { data: plans, error } = useBillingQuery((c) => c.listPlans(), []);
  const [own, setOwn] = useState<BillingInterval | null>(null);
  const live = useCheckoutLive(overview);
  if (error) return <ErrorNote message={error} />;
  if (!plans || !overview) return <Loading what="plans" />;
  const interval = controlled ?? own ?? overview.interval;
  const current = overview.plan;

  const pending = overview.pendingUpgrade;
  const onPaidMonthly = overview.interval === "monthly" && overview.status !== "free" && overview.status !== "moved_to_basic";
  function action(p: BillingPlan) {
    if (pending && pending.toPlan.id === p.id && pending.interval === interval) {
      return (
        <button type="button" className="btn btn-ghost" disabled style={{ width: "100%", justifyContent: "center" }} title="Waiting for approval by our team">
          <Icon name="clock" size={15} /> Request pending
        </button>
      );
    }
    // Same paid plan, monthly → yearly: an upgrade with credit for the unused month.
    if (p.id === current.id && !p.isFree && onPaidMonthly && interval === "yearly") {
      return (
        <BLink to="checkout" params={{ plan: p.id, interval }} className="btn btn-primary" style={{ width: "100%", justifyContent: "center" }}>
          <Icon name="arrow-up" size={15} /> {live ? "Switch to yearly" : "Request yearly billing"}
        </BLink>
      );
    }
    if (p.id === current.id) {
      return (
        <button type="button" className="btn" disabled style={{ width: "100%", justifyContent: "center", background: "var(--surface-2)", color: "var(--muted)", border: "1px solid var(--line)" }}>
          ✓ Current plan
        </button>
      );
    }
    if (p.rank > current.rank) {
      return (
        <BLink to="checkout" params={{ plan: p.id, interval }} className="btn btn-primary" style={{ width: "100%", justifyContent: "center" }}>
          <Icon name="arrow-up" size={15} /> {live ? "Upgrade" : "Request upgrade"}
        </BLink>
      );
    }
    return (
      <BLink to="downgrade" params={{ plan: p.id }} className="btn btn-ghost" style={{ width: "100%", justifyContent: "center" }}>
        <Icon name="arrow-down" size={15} /> Downgrade
      </BLink>
    );
  }

  const rows: { label: string; render: (p: BillingPlan) => ReactNode }[] = [
    { label: "Price", render: (p) => (p.isFree ? "Free" : `${formatINR(interval === "yearly" ? p.priceYearly : p.priceMonthly)} + GST`) },
    { label: "Users", render: (p) => p.limits.users ?? "Unlimited" },
    { label: "Projects", render: (p) => p.limits.projects ?? "Unlimited" },
    { label: "Landing pages", render: (p) => p.limits.landingPages ?? "Unlimited" },
    { label: "Templates", render: (p) => p.limits.templates ?? "Unlimited" },
    { label: "Team chat", render: (p) => <Yes on={p.modules.teamChat} /> },
    { label: "Meta lead ads", render: (p) => <Yes on={p.modules.metaLeadAds}>{countLabel(p.modules.metaPages, "page", "pages")}</Yes> },
    { label: "WhatsApp", render: () => <span className="bl-muted">Coming later</span> },
    { label: "AI calling", render: () => <span className="bl-muted">Coming later</span> },
  ];

  return (
    <div className="bl-stack">
      {controlled === undefined ? <IntervalToggle value={interval} onChange={(v) => (onIntervalChange ? onIntervalChange(v) : setOwn(v))} /> : null}
      <div className="bl-plan-grid">
        {plans.map((p) => {
          const isCurrent = p.id === current.id;
          return (
            <div key={p.id} className={`bl-plan-card${isCurrent ? " current" : ""}`}>
              {isCurrent ? <span className="bl-plan-flag">Current plan</span> : null}
              <h3>{p.name}</h3>
              <div className="bl-muted" style={{ minHeight: 34 }}>{p.tagline}</div>
              <PlanPrice plan={p} interval={interval} />
              <div className="bl-muted bl-small" style={{ visibility: !p.isFree && interval === "yearly" ? "visible" : "hidden" }}>
                ≈ {formatINR(Math.round(p.priceYearly / 12))}/month, billed yearly
              </div>
              <ul className="bl-plan-list">
                {planFeatureRows(p).map((f) => (
                  <li key={f.label} className={f.on ? "" : "off"}>
                    <span className={f.on ? "bl-yes" : "bl-no"}>{f.on ? "✓" : "✕"}</span> {f.label}
                  </li>
                ))}
              </ul>
              {action(p)}
            </div>
          );
        })}
      </div>
      <Section title="Compare plans" sub="Limits and modules side by side" flush>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th />
                {plans.map((p) => (
                  <th key={p.id}>
                    {p.name} {p.id === current.id ? <span className="badge b-indigo" style={{ marginLeft: 4 }}>Current</span> : null}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.label}>
                  <td className="bl-strong">{r.label}</td>
                  {plans.map((p) => (
                    <td key={p.id}>{r.render(p)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}
