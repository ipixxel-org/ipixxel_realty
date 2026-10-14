"use client";

import { Icon } from "@/components/icons";
import { formatDate, formatINR, planPrice } from "@/lib/billing/pricing";
import type { BillingOverview } from "@/lib/billing/types";
import { BillingBanner, PayNowButton, RenewalReminderPopup, UpdatePaymentMethodButton } from "./banners";

export { RenewalReminderPopup };
import { useOrgBilling } from "./context";
import { InvoicesTable, PaymentHistoryTable } from "./invoices";
import { BLink, ErrorNote, Kv, Loading, SampleDataTag, Section, StatusBadge, UsageMeter } from "./ui";

function planLine(o: BillingOverview): string {
  if (o.plan.isFree) {
    return o.status === "moved_to_basic" && o.paidPlan
      ? `Free plan since ${formatDate(o.movedToBasicAt!)} — your ${o.paidPlan.name} items are paused, not deleted.`
      : "Free forever. Upgrade any time.";
  }
  if (o.status === "past_due" || o.status === "grace_ending") return `Renewal was due ${formatDate(o.dueDate!)} · grace until ${formatDate(o.graceEndsAt!)}`;
  if (o.status === "cancellation_scheduled") return `Ends ${formatDate(o.cancelAt!)} — full access until then`;
  return `Renews on ${formatDate(o.periodEnd!)}${o.renewalMode === "auto" ? " automatically" : ""}`;
}

/** Current plan card — also used on its own in the walkthrough. */
export function CurrentPlanCard({ overview: o }: { overview: BillingOverview }) {
  return (
    <Section title="Current plan" sub="What you're on today" action={<SampleDataTag />}>
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
            {o.plan.isFree ? "Free" : `${formatINR(planPrice(o.plan, o.interval))} + GST`}
            {!o.plan.isFree ? <span className="bl-muted" style={{ fontWeight: 500 }}> / {o.interval === "yearly" ? "year" : "month"}</span> : null}
          </Kv>
          {!o.plan.isFree && o.renewalAmount != null ? <Kv label="Next charge">{formatINR(o.renewalAmount)}</Kv> : null}
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
          Meta lead ads: {o.plan.modules.metaLeadAds ? `on (${o.plan.modules.metaPages} page${o.plan.modules.metaPages === 1 ? "" : "s"})` : "off"}
        </span>
      </div>
    </Section>
  );
}

export function PaymentMethodCard({ overview: o }: { overview: BillingOverview }) {
  const payNear = o.status === "renewal_due" || o.status === "past_due" || o.status === "grace_ending";
  return (
    <Section title="How you pay" sub={o.renewalMode === "auto" ? "Automatic renewal" : "Pay each renewal yourself"}>
      {o.plan.isFree ? (
        <div className="bl-muted">No payment method needed on Basic. You&apos;ll add one when you buy a plan.</div>
      ) : o.renewalMode === "auto" && o.paymentMethod ? (
        <div className="bl-between">
          <div className="bl-row">
            <span className="bl-card-chip">{o.paymentMethod.kind === "card" ? "CARD" : "UPI"}</span>
            <div>
              <div className="bl-strong">{o.paymentMethod.label}</div>
              <div className="bl-muted">{o.paymentMethod.detail}</div>
            </div>
          </div>
          <UpdatePaymentMethodButton overview={o} />
        </div>
      ) : (
        <div className="bl-stack" style={{ gap: 10 }}>
          <div className="bl-muted">Nothing is saved. We remind you 3 days before each renewal and you pay with UPI, card or netbanking.</div>
          {payNear ? (
            <div>
              <PayNowButton overview={o} />
            </div>
          ) : o.periodEnd ? (
            <div className="bl-muted">
              Next payment due <b>{formatDate(o.periodEnd)}</b> — a Pay now button appears here 3 days before.
            </div>
          ) : null}
        </div>
      )}
    </Section>
  );
}

export function BillingDetailsCard({ overview: o }: { overview: BillingOverview }) {
  const p = o.billingProfile;
  return (
    <Section title="Billing details" sub="Printed on your GST invoices">
      {p ? (
        <div style={{ display: "grid", gap: 4, fontSize: 13 }}>
          <b>{p.legalName}</b>
          <span className="bl-muted">
            {p.addressLine}, {p.city}, {p.state} {p.pincode}
          </span>
          <span className="bl-muted">GSTIN: {p.gstin || "not provided"}</span>
        </div>
      ) : (
        <div className="bl-muted">Added at your first purchase.</div>
      )}
    </Section>
  );
}

/** Settings → Billing & Subscription (v2). */
export function BillingOverviewPanel({ showInvoices = true }: { showInvoices?: boolean }) {
  const { overview, error } = useOrgBilling();
  if (error) return <ErrorNote message={error} />;
  if (!overview) return <Loading />;
  const o = overview;
  const paid = !o.plan.isFree;
  return (
    <div className="bl-stack">
      <BillingBanner overview={o} />
      <CurrentPlanCard overview={o} />
      <div className="bl-row">
        <BLink to="plans" className="btn btn-primary">
          <Icon name="crown" size={15} /> {o.plan.isFree ? "Upgrade" : "Change plan"}
        </BLink>
        {paid && o.status !== "cancellation_scheduled" ? (
          <BLink to="cancel" className="btn btn-ghost">
            Cancel plan
          </BLink>
        ) : null}
        <BLink to="chooseWhatStays" className="btn btn-ghost">
          Choose what stays
        </BLink>
      </div>
      <UsageCard overview={o} />
      <div className="bl-grid2">
        <PaymentMethodCard overview={o} />
        <BillingDetailsCard overview={o} />
      </div>
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
