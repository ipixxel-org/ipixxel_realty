"use client";

import { Icon } from "@/components/icons";
import { formatDate, packagePriceText, planPrice } from "@/lib/billing/pricing";
import type { BillingOverview } from "@/lib/billing/types";
import { BillingBanner, RENEWAL_OPEN, RenewalReminderPopup, RequestRenewalButton } from "./banners";

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
  if (o.status === "past_due" || o.status === "grace_ending") return `Renewal was due ${formatDate(o.dueDate!)} · grace until ${formatDate(o.graceEndsAt!)}`;
  if (o.status === "expired") return `Expired${o.dueDate ? ` on ${formatDate(o.dueDate)}` : ""} — publishing is paused until you renew`;
  if (o.status === "cancellation_scheduled") return `Moves to Basic on ${formatDate(o.cancelAt!)} — full access until then`;
  return `Renews on ${formatDate(o.periodEnd!)}${o.renewalMode === "auto" && o.autoRenewAvailable ? " automatically" : ""}`;
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
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>{o.plan.name}</h3>
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
    </Section>
  );
}

export function UsageCard({ overview: o }: { overview: BillingOverview }) {
  return (
    <Section title="Usage" sub={`Against the ${o.plan.name} plan's limits`}>
      <div className="bl-grid4">
        {o.usage.map((u) => (
          <UsageMeter key={u.key} label={u.label} used={u.used} limit={u.limit} />
        ))}
      </div>
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
        {o.paymentMode === "manual" && !o.plan.isFree && (RENEWAL_OPEN as readonly string[]).includes(o.status) ? (
          <RequestRenewalButton overview={o} className="btn btn-ghost" />
        ) : null}
        {/* Manual mode: chosen per request (the request screen) or from the grace / Basic banners. */}
        {/* On Basic already, what stays is view-only for the org (only our team can change it). */}
        {o.paymentMode !== "manual" && !o.plan.isFree ? (
          <BLink to="chooseWhatStays" className="btn btn-ghost">
            Choose what stays
          </BLink>
        ) : o.status === "moved_to_basic" ? (
          <WhatStaysLockedNote />
        ) : null}
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
