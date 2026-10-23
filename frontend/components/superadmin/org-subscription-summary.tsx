import Link from "next/link";
import { formatDate, packagePriceText } from "@/lib/billing/pricing";
import { BILLING_V2 } from "@/lib/billing/flag";

/** The subscription row (with its plan) from GET /admin/organisations/:id. */
export type OrgSubscriptionRow = {
  status: string;
  billingCycle: "monthly" | "yearly" | string;
  startedAt?: string | null;
  renewsAt?: string | null;
  graceEndsAt?: string | null;
  /** isSystem: the platform's Basic plan (an internal ₹0 plan like "Demo" isn't Basic). */
  plan?: { name: string; priceMonthly: number; priceYearly: number; isSystem?: boolean } | null;
};

type Summary = {
  planName: string;
  cycle: string | null;
  status: { label: "Active" | "Payment due" | "On Basic"; badge: string };
  started: string | null;
  dateLabel: "Renews on" | "Grace ends on" | null;
  date: string | null;
  price: string;
};

/** Read-only summary of an organisation's plan. Pure — unit-tested. */
export function orgSubscriptionSummary(sub: OrgSubscriptionRow): Summary {
  const plan = sub.plan;
  const yearly = sub.billingCycle === "yearly";
  const price = plan ? (yearly ? plan.priceYearly : plan.priceMonthly) : 0;
  // Basic is the system plan; older payloads without the flag fall back to "no price on either cycle".
  const onBasic = !plan || (plan.isSystem ?? (plan.priceMonthly === 0 && plan.priceYearly === 0));
  const due = !onBasic && (sub.status === "past_due" || sub.status === "expired");
  const started = sub.startedAt ? formatDate(sub.startedAt) : null;
  if (onBasic) {
    return { planName: plan?.name ?? "Basic", cycle: null, status: { label: "On Basic", badge: "b-gray" }, started, dateLabel: null, date: null, price: "Free" };
  }
  return {
    planName: plan.name,
    cycle: yearly ? "Yearly" : "Monthly",
    status: due ? { label: "Payment due", badge: "b-amber" } : { label: "Active", badge: "b-green" },
    started,
    dateLabel: due ? "Grace ends on" : "Renews on",
    date: due ? (sub.graceEndsAt ?? sub.renewsAt ?? null) : (sub.renewsAt ?? null),
    price: packagePriceText(price),
  };
}

/** Where plans are changed: this org's page under Subscriptions → Organisation Subscriptions. */
export function orgSubscriptionHref(orgId: string): string {
  return BILLING_V2 ? `/admin-console/subscriptions/org/${encodeURIComponent(orgId)}` : "/admin-console/subscriptions";
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="muted" style={{ fontSize: 11 }}>{label}</span>
      <br />
      <b>{children}</b>
    </div>
  );
}

/**
 * Super Admin → Organisations → (org) → Subscription. Read-only: the plan is
 * changed in Subscriptions, linked below.
 */
export function OrgSubscriptionSummary({ orgId, subscription }: { orgId: string; subscription: OrgSubscriptionRow | null }) {
  const s = subscription ? orgSubscriptionSummary(subscription) : null;
  return (
    <div className="card">
      <div className="card-h">
        <span className="t">Subscription</span>
        {s ? <span className={`badge ${s.status.badge}`}>{s.status.label}</span> : <span className="badge b-gray">No subscription</span>}
      </div>
      <div className="card-b" style={{ display: "grid", gap: 16 }}>
        {s ? (
          <div className="grid g2" style={{ gap: 10, fontSize: 13, padding: 14, border: "1px solid var(--line)", borderRadius: 12, background: "var(--surface-2)" }}>
            <Field label="Plan">
              {s.planName}
              {s.cycle ? <span className="muted" style={{ fontWeight: 500 }}> · {s.cycle}</span> : null}
            </Field>
            <Field label="Status">{s.status.label}</Field>
            <Field label="Started">{s.started ?? "—"}</Field>
            {s.dateLabel ? <Field label={s.dateLabel}>{s.date ? formatDate(s.date) : "—"}</Field> : null}
            <Field label="Current price">{s.price}</Field>
          </div>
        ) : (
          <div className="help">No subscription yet.</div>
        )}
        <div>
          <Link href={orgSubscriptionHref(orgId)} className="btn btn-ghost btn-sm">
            Manage in Subscriptions →
          </Link>
        </div>
      </div>
    </div>
  );
}
