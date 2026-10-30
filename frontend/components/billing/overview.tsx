"use client";

import { Icon } from "@/components/icons";
import { formatDate, packagePriceText, planPrice } from "@/lib/billing/pricing";
import { graceDayText, graceExtraDays } from "@/lib/billing/grace";
import { renewalChangeNotice } from "@/lib/billing/versions";
import type { BillingOverview } from "@/lib/billing/types";
import { BillingBanner, renewalOpen, RenewalReminderPopup, RequestRenewalButton } from "./banners";

export { RenewalReminderPopup };
import { BillingDetailsSection, PendingUpgradeBanner, RejectedUpgradeBanner } from "./checkout";
import { useOrgBilling } from "./context";
import { InvoicesTable, PaymentHistoryTable } from "./invoices";
import { BLink, countLabel, ErrorNote, Kv, Loading, RenewalPrice, SampleDataTag, Section, StatusBadge, UsageMeter, WhatStaysLockedNote } from "./ui";

function planLine(o: BillingOverview): string {
  if (o.plan.isFree) {
    return o.status === "moved_to_basic" && o.paidPlan
      ? `Free plan since ${formatDate(o.movedToBasicAt!)} — your ${o.paidPlan.name} items are paused, not deleted.`
      : "Free forever. Upgrade any time.";
  }
  if (o.status === "past_due" || o.status === "grace_ending") {
    // Extended by our team: say so, with the same total as the banner's countdown.
    const day = graceExtraDays(o) > 0 ? ` · ${graceDayText(o)}` : "";
    return `Renewal was due ${formatDate(o.dueDate!)}${day} · grace until ${formatDate(o.graceEndsAt!)}`;
  }
  if (o.status === "expired") return `Expired${o.dueDate ? ` on ${formatDate(o.dueDate)}` : ""} — publishing is paused until you renew`;
  if (o.status === "cancellation_scheduled") return `Moves to Basic on ${formatDate(o.cancelAt!)} — full access until then`;
  return `Renews on ${formatDate(o.periodEnd!)}${o.renewalMode === "auto" && o.autoRenewAvailable ? " automatically" : ""}`;
}

/**
 * Under the current plan, only when the plan's next version is worse for the
 * org (a lower limit, a feature off, a higher price): what gets worse, in one
 * sentence — never a version number. "Choose what stays" when they're over a
 * new limit.
 */
function RenewalChangeBlock({ overview: o }: { overview: BillingOverview }) {
  const notice = renewalChangeNotice(o);
  if (!notice) return null;
  return (
    <div data-testid="renewal-change" style={{ marginTop: 12, padding: "12px 16px", borderRadius: 12, border: "1px solid var(--line-2)" }}>
      <div className="bl-between" style={{ gap: 12, flexWrap: "wrap" }}>
        <div>
          <b style={{ fontSize: 13.5 }}>{notice.title}</b>
          <div style={{ marginTop: 2, fontSize: 13 }}>{notice.text}</div>
        </div>
        {notice.overLimit ? (
          <BLink to="chooseWhatStays" params={{ target: o.plan.id }} className="btn btn-ghost btn-sm">
            Choose what stays
          </BLink>
        ) : null}
      </div>
      {notice.overLimit ? <div className="bl-muted bl-small" style={{ marginTop: 6 }}>What doesn&apos;t fit is paused then — your choice, or the default picks. Nothing is deleted.</div> : null}
    </div>
  );
}

/** Current plan card — also used on its own in the walkthrough. */
export function CurrentPlanCard({ overview: o }: { overview: BillingOverview }) {
  return (
    <Section title="Current plan" sub="What you're on today" action={<SampleDataTag fns={["getBillingOverview"]} />}>
      <div className="bl-between" style={{ padding: "14px 16px", background: "var(--surface-2)", borderRadius: 12, border: "1px solid var(--line-2)" }}>
        <div className="bl-row" style={{ gap: 14 }}>
          <span style={{ width: 44, height: 44, borderRadius: 12, background: "var(--amber-050)", color: "var(--amber)", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
            <Icon name="crown" size={22} />
          </span>
          <div>
            <div className="bl-row" style={{ gap: 8 }}>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700 }} data-testid="current-plan-name">
                {o.plan.name}
              </h3>
              <StatusBadge status={o.status} />
            </div>
            <div className="bl-muted" style={{ marginTop: 4 }}>
              {planLine(o)}
            </div>
          </div>
        </div>
        <div className="bl-row" style={{ gap: 22 }}>
          <Kv label="Price">
            {o.plan.isFree ? "Free" : packagePriceText(planPrice(o.plan, o.interval))}
            {!o.plan.isFree ? <span className="bl-muted" style={{ fontWeight: 500 }}> / {o.interval === "yearly" ? "year" : "month"}</span> : null}
          </Kv>
          {!o.plan.isFree && o.renewalAmount != null ? <Kv label="Next charge"><RenewalPrice overview={o} /></Kv> : null}
          {o.downgradeTo ? <Kv label="From">{`${o.downgradeTo.name} on ${formatDate(o.downgradeAt!)}`}</Kv> : null}
        </div>
      </div>
      <RenewalChangeBlock overview={o} />
    </Section>
  );
}

const ACTIVE_NOUN: Record<string, [string, string]> = {
  users: ["user", "users"],
  projects: ["project", "projects"],
  landingPages: ["landing page", "landing pages"],
  templates: ["template", "templates"],
};

/** "Active now: 3 of 5 projects, 1 of 1 template" — while anything is paused by the plan; null otherwise. */
export function activeNowText(o: BillingOverview): string | null {
  const locked = o.locked as Record<string, number | undefined>;
  if (!o.usage.some((u) => (locked[u.key] ?? 0) > 0)) return null;
  const parts = o.usage
    .filter((u) => ACTIVE_NOUN[u.key])
    .map((u) => {
      const total = u.used + (locked[u.key] ?? 0);
      const [one, many] = ACTIVE_NOUN[u.key];
      return `${u.used} of ${total} ${total === 1 ? one : many}`;
    });
  return `Active now: ${parts.join(", ")}`;
}

export function UsageCard({ overview: o }: { overview: BillingOverview }) {
  const activeNow = activeNowText(o);
  return (
    <Section title="Usage" sub={`Against the ${o.plan.name} plan's limits`}>
      <div className="bl-grid4">
        {o.usage.map((u) => (
          <UsageMeter key={u.key} label={u.label} used={u.used} limit={u.limit} />
        ))}
      </div>
      {activeNow ? (
        // What's active vs paused now; View opens the live list (read-only — only our team can change it).
        <div className="bl-row" style={{ marginTop: 12, gap: 8, alignItems: "center" }} data-testid="active-now">
          <span>{activeNow}</span>
          <BLink to="chooseWhatStays" params={{ target: o.plan.id }} className="btn btn-ghost btn-sm">
            View
          </BLink>
        </div>
      ) : null}
      <div className="bl-row" style={{ marginTop: 14, gap: 8 }}>
        <span className="chip">Team chat: {o.plan.modules.teamChat ? "on" : "off"}</span>
        <span className="chip">
          Meta lead ads: {o.plan.modules.metaLeadAds ? `on (${countLabel(o.plan.modules.metaPages, "page", "pages")})` : "off"}
        </span>
      </div>
    </Section>
  );
}

/** Read-only: the org profile from Settings → General, edited there. */
export function BillingDetailsCard({ overview: o }: { overview: BillingOverview }) {
  return <BillingDetailsSection overview={o} sub="From your General settings — printed on your GST invoices" />;
}

/** Settings → Billing & Subscription (v2). */
export function BillingOverviewPanel({ showInvoices = true }: { showInvoices?: boolean }) {
  const { overview, error } = useOrgBilling();
  if (error) return <ErrorNote message={error} />;
  if (!overview) return <Loading />;
  const o = overview;
  return (
    <div className="bl-stack">
      <BillingBanner overview={o} />
      {o.pendingUpgrade ? <PendingUpgradeBanner pending={o.pendingUpgrade} /> : null}
      {o.rejectedUpgrade && !o.pendingUpgrade ? <RejectedUpgradeBanner rejected={o.rejectedUpgrade} /> : null}
      <CurrentPlanCard overview={o} />
      <div className="bl-row" data-testid="billing-actions">
        {/* Always open: while a request waits, the plan cards and checkout are disabled instead. */}
        <BLink to="plans" className="btn btn-primary">
          <Icon name="crown" size={15} /> Change plan
        </BLink>
        {/* Manual mode: from the renewal window through grace, the renewal is a request. */}
        {o.paymentMode === "manual" && renewalOpen(o) ? (
          <RequestRenewalButton overview={o} className="btn btn-ghost" />
        ) : null}
        {/* One place, both modes: what stays is chosen with each change (checkout, downgrade, the
            grace / Basic banners) or on the latest request — no standalone button here. On Basic
            already, what stays is view-only for the org (only our team can change it). */}
        {o.status === "moved_to_basic" ? <WhatStaysLockedNote /> : null}
        <BLink to="coupons" className="btn btn-ghost">
          Coupons
        </BLink>
        <BLink to="requests" className="btn btn-ghost">
          Requests
        </BLink>
      </div>
      <UsageCard overview={o} />
      <BillingDetailsCard overview={o} />
      {showInvoices ? (
        <>
          <InvoicesTable
            pageSize={5}
            paged={false}
            action={
              <BLink to="invoices" className="btn btn-ghost btn-sm">
                All invoices & payments →
              </BLink>
            }
          />
        </>
      ) : null}
    </div>
  );
}

export { PaymentHistoryTable };
