"use client";

import { useState, type ReactNode } from "react";
import { Icon } from "@/components/icons";
import { Seg } from "@/components/superadmin/seg";
import { formatINR, packagePriceText, yearlySaving } from "@/lib/billing/pricing";
import { isOverdue, planChangeRoute } from "@/lib/billing/direction";
import { planChangeBlock } from "@/lib/billing/requests";
import type { BillingInterval, BillingPlan } from "@/lib/billing/types";
import { renewalOpen, RenewPlanButton } from "./banners";
import { useBillingQuery, useOrgBilling } from "./context";
import { BLink, countLabel, ErrorNote, Loading, PlanPrice, Section, planFeatureRows, useCheckoutLive } from "./ui";

function Yes({ on, children }: { on: boolean; children?: ReactNode }) {
  return on ? <span className="bl-yes">✓ {children}</span> : <span className="bl-no">—</span>;
}

export function IntervalToggle({ value, onChange }: { value: BillingInterval; onChange: (v: BillingInterval) => void }) {
  return (
    <div className="bl-row">
      <Seg options={["Monthly", "Yearly"]} value={value === "yearly" ? 1 : 0} onChange={(i) => onChange(i === 1 ? "yearly" : "monthly")} />
    </div>
  );
}

/** "Save ₹1,998 a year" from the plan's own prices; nothing when yearly isn't cheaper. */
export function YearlySavingNote({ plan, interval }: { plan: BillingPlan; interval: BillingInterval }) {
  const s = plan.isFree ? null : yearlySaving(plan.priceMonthly, plan.priceYearly);
  if (!s) return null;
  return (
    <span className="badge b-green" style={{ alignSelf: "flex-start" }}>
      Save {formatINR(s.amount)} a year{interval === "monthly" ? " with yearly billing" : ""}
    </span>
  );
}

/** Plan cards + comparison. The interval toggle lives in the page head (or the walkthrough). */
export function PlansScreen({
  interval: controlled,
  onIntervalChange,
  coupon,
  initialInterval,
}: {
  interval?: BillingInterval;
  onIntervalChange?: (v: BillingInterval) => void;
  /** From Billing → Coupons "Use at checkout": carried into the checkout links. */
  coupon?: string;
  initialInterval?: BillingInterval;
}) {
  const { overview } = useOrgBilling();
  const { data: plans, error } = useBillingQuery((c) => c.listPlans(), []);
  const [own, setOwn] = useState<BillingInterval | null>(null);
  const live = useCheckoutLive(overview);
  if (error) return <ErrorNote message={error} />;
  if (!plans || !overview) return <Loading what="plans" />;
  const interval = controlled ?? own ?? initialInterval ?? overview.interval;
  const current = overview.plan;

  const pending = overview.pendingUpgrade;
  // A request waiting for approval, or a scheduled change to Basic / a smaller
  // plan, blocks every other plan change until it's decided / undone.
  const block = planChangeBlock(overview);
  // Renewal overdue (either mode): every paid plan is its full price at the
  // checkout (the missed term continues; manual: a request); Basic moves the
  // org straight away.
  const overdue = isOverdue(overview);
  // Renewal window, grace or expired: the current plan's button is Renew (manual: Request renewal).
  const renewing = renewalOpen(overview);
  /** A plan action link — disabled, with the reason, while plan changes are blocked. */
  const go = (to: "checkout" | "downgrade", params: Record<string, string | undefined>, className: string, children: ReactNode) =>
    block ? (
      <span title={block.message} data-testid="plan-action-blocked" style={{ display: "flex", width: "100%" }}>
        <button type="button" className={className} disabled style={{ width: "100%", justifyContent: "center", opacity: 0.65, cursor: "not-allowed" }}>
          {children}
        </button>
      </span>
    ) : (
      <BLink to={to} params={params} className={className} style={{ width: "100%", justifyContent: "center" }}>
        {children}
      </BLink>
    );
  function action(p: BillingPlan) {
    if (renewing && p.id === current.id && interval === overview!.interval) {
      return <RenewPlanButton overview={overview!} style={{ width: "100%", justifyContent: "center" }} />;
    }
    if (pending && pending.toPlan.id === p.id && pending.interval === interval) {
      return (
        <button type="button" className="btn btn-ghost" disabled style={{ width: "100%", justifyContent: "center" }} title="Waiting for approval by our team">
          <Icon name="clock" size={15} /> Request pending
        </button>
      );
    }
    // One rule (lib/billing/direction.ts) picks the page; the arrow follows it.
    const route = planChangeRoute(overview!, p, interval);
    if (!route) {
      return (
        <button type="button" className="btn" disabled style={{ width: "100%", justifyContent: "center", background: "var(--surface-2)", color: "var(--muted)", border: "1px solid var(--line)" }}>
          ✓ Current plan
        </button>
      );
    }
    const up = route === "checkout";
    const arrow = <Icon name={up ? "arrow-up" : "arrow-down"} size={15} data-icon={up ? "arrow-up" : "arrow-down"} />;
    const samePlan = p.id === current.id;
    if (overdue) {
      return go(route, p.isFree ? { plan: p.id } : { plan: p.id, interval }, p.rank > current.rank ? "btn btn-primary" : "btn btn-ghost", <>{arrow} Change plan</>);
    }
    // Same paid plan: monthly → yearly is an upgrade (credit for the unused month);
    // yearly → monthly is scheduled for the renewal date.
    const label = samePlan ? (up ? (live ? "Switch to yearly" : "Request yearly billing") : "Switch to monthly") : "Change plan";
    return up
      ? go("checkout", { plan: p.id, interval, coupon }, "btn btn-primary", <>{arrow} {label}</>)
      : go("downgrade", { plan: p.id, interval }, "btn btn-ghost", <>{arrow} {label}</>);
  }

  const rows: { label: string; render: (p: BillingPlan) => ReactNode }[] = [
    { label: "Price", render: (p) => (p.isFree ? "Free" : packagePriceText(interval === "yearly" ? p.priceYearly : p.priceMonthly)) },
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
      {coupon ? (
        <div className="bl-coupon-ok" role="status">
          Coupon <b className="bl-mono">{coupon}</b> will be filled in at checkout — pick a plan it works on.
        </div>
      ) : null}
      <div className="bl-plan-grid">
        {plans.map((p) => {
          const isCurrent = p.id === current.id;
          return (
            <div key={p.id} className={`bl-plan-card${isCurrent ? " current" : ""}`} data-testid={isCurrent ? "current-plan-card" : undefined}>
              {isCurrent ? <span className="bl-plan-flag">Current plan</span> : null}
              <h3>{p.name}</h3>
              <div className="bl-muted" style={{ minHeight: 34 }}>{p.tagline}</div>
              <PlanPrice plan={p} interval={interval} />
              <div className="bl-muted bl-small" style={{ visibility: !p.isFree && interval === "yearly" ? "visible" : "hidden" }}>
                ≈ {formatINR(Math.round(p.priceYearly / 12))}/month, billed yearly
              </div>
              <YearlySavingNote plan={p} interval={interval} />
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
