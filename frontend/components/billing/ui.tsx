"use client";

import Link from "next/link";
import { useEffect, type CSSProperties, type ReactNode } from "react";
import { Icon, type IconName } from "@/components/icons";
import { formatINR, packagePriceText, renewalPriceNote, renewalPriceText } from "@/lib/billing/pricing";
import type { BillingFunction } from "@/lib/billing/client";
import type { BillingInterval, BillingOverview, BillingPlan, SubscriptionStatus } from "@/lib/billing/types";
import { useBillingEnv, type BillingRoute, type RouteParams } from "./context";

export const STATUS_META: Record<SubscriptionStatus, { label: string; badge: string }> = {
  free: { label: "Free plan", badge: "b-gray" },
  active: { label: "Active", badge: "b-green" },
  renewal_due: { label: "Renewal due", badge: "b-amber" },
  past_due: { label: "Payment due", badge: "b-rose" },
  grace_ending: { label: "Grace ends tomorrow", badge: "b-rose" },
  expired: { label: "Expired", badge: "b-rose" },
  moved_to_basic: { label: "Moved to Basic", badge: "b-gray" },
  cancellation_scheduled: { label: "Change to Basic scheduled", badge: "b-amber" },
  downgrade_scheduled: { label: "Plan change scheduled", badge: "b-violet" },
};

/**
 * A package price the shared way — "₹1,499 + GST" — with optional secondary
 * text (muted) such as the GST-inclusive total. See packagePriceText.
 */
export function PriceText({ amount, gst = true, note }: { amount: number; gst?: boolean; note?: string | null }) {
  return (
    <>
      {packagePriceText(amount, { gst })}
      {note ? <span className="bl-muted" style={{ fontWeight: 400 }}> · {note}</span> : null}
    </>
  );
}

/** The next renewal ("₹1,499 + GST"), with the coupon / total as secondary text. */
export function RenewalPrice({ overview }: { overview: Pick<BillingOverview, "renewalBreakdown" | "interval" | "plan" | "paidPlan"> }) {
  const note = renewalPriceNote(overview);
  return (
    <>
      {renewalPriceText(overview)}
      {note ? <span className="bl-muted" style={{ fontWeight: 400 }}> · {note}</span> : null}
    </>
  );
}

export function StatusBadge({ status }: { status: SubscriptionStatus }) {
  return <span className={`badge ${STATUS_META[status].badge}`}>{STATUS_META[status].label}</span>;
}

/** Link to a billing screen; presentation pages can intercept it. */
export function BLink({
  to,
  params,
  className,
  style,
  title,
  children,
}: {
  to: BillingRoute;
  params?: RouteParams;
  className?: string;
  style?: CSSProperties;
  title?: string;
  children: ReactNode;
}) {
  const { nav } = useBillingEnv();
  return (
    <Link
      href={nav.href(to, params)}
      className={className}
      style={style}
      title={title}
      onClick={(e) => {
        if (nav.intercept?.(to, params)) e.preventDefault();
      }}
    >
      {children}
    </Link>
  );
}

/**
 * Shown on a section whose data still comes from the mock (any of `fns` not
 * real yet), so sample numbers aren't mistaken for real ones. Hidden in the
 * walkthroughs, which carry their own "Preview" tag.
 */
export function SampleDataTag({ fns }: { fns: BillingFunction[] }) {
  const { client, inlineDialogs } = useBillingEnv();
  if (inlineDialogs || fns.every((fn) => client.isReal(fn))) return null;
  return (
    <span className="bl-tag" title="The billing backend isn't connected yet — these are sample figures.">
      Sample data
    </span>
  );
}

export function PageHead({
  eyebrow,
  icon = "billing",
  title,
  sub,
  actions,
  back,
  sampleFns = [],
}: {
  eyebrow: string;
  icon?: IconName;
  title: string;
  sub?: ReactNode;
  actions?: ReactNode;
  back?: { to: BillingRoute; params?: RouteParams; label: string };
  /** Functions the page reads; the "Sample data" tag shows while any is still mock. */
  sampleFns?: BillingFunction[];
}) {
  return (
    <>
      {back ? (
        <BLink to={back.to} params={back.params} className="bl-crumb">
          <Icon name="chevron-left" size={14} /> {back.label}
        </BLink>
      ) : null}
      <div className="page-head">
        <div>
          <div className="eyebrow">
            <Icon name={icon} size={14} /> {eyebrow}
          </div>
          <div className="bl-row">
            <h1>{title}</h1>
            <SampleDataTag fns={sampleFns} />
          </div>
          {sub ? <div className="sub">{sub}</div> : null}
        </div>
        {actions ? <div className="actions">{actions}</div> : null}
      </div>
    </>
  );
}

export function Section({
  title,
  sub,
  action,
  children,
  flush,
}: {
  title: ReactNode;
  sub?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  flush?: boolean;
}) {
  return (
    <div className="card">
      <div className="card-h" style={{ flexWrap: "wrap", gap: 10 }}>
        <div>
          <span className="t">{title}</span>
          {sub ? <div className="bl-muted" style={{ marginTop: 2 }}>{sub}</div> : null}
        </div>
        {action ? <div style={{ marginLeft: "auto" }}>{action}</div> : null}
      </div>
      <div className="card-b" style={flush ? { padding: 0 } : undefined}>
        {children}
      </div>
    </div>
  );
}

export type BannerTone = "rose" | "amber" | "info" | "green" | "gray";

export function Banner({
  tone,
  icon,
  title,
  children,
  actions,
  aside,
}: {
  tone: BannerTone;
  icon: IconName;
  title: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <div className={`bl-banner bl-banner--${tone}`} role="status">
      {aside ?? (
        <span className="bl-banner-ic">
          <Icon name={icon} size={17} />
        </span>
      )}
      <div className="bl-banner-body">
        <b>{title}</b>
        {children}
      </div>
      {actions ? <div className="bl-banner-actions">{actions}</div> : null}
    </div>
  );
}

export function UsageMeter({ label, used, limit }: { label: string; used: number; limit: number | null }) {
  if (limit === null) {
    return (
      <div>
        <div className="bl-between" style={{ marginBottom: 6, fontSize: 13 }}>
          <span className="bl-strong">{label}</span>
          <span style={{ color: "var(--ink-2)", fontWeight: 600 }}>{used} · unlimited</span>
        </div>
        <div className="bl-meter-track" />
      </div>
    );
  }
  const over = used > limit;
  const full = used >= limit;
  return (
    <div>
      <div className="bl-between" style={{ marginBottom: 6, fontSize: 13 }}>
        <span className="bl-strong">{label}</span>
        <span style={{ color: over ? "var(--rose)" : "var(--ink-2)", fontWeight: 600 }}>
          {used}/{limit}
          {over ? " · over limit" : full ? " · limit reached" : ""}
        </span>
      </div>
      <div className="bl-meter-track">
        <div className={`bl-meter-fill${full ? " full" : ""}`} style={{ width: `${Math.min(100, (used / Math.max(1, limit)) * 100)}%` }} />
      </div>
    </div>
  );
}

export function Kv({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11, textTransform: "uppercase", fontWeight: 700, color: "var(--muted)", letterSpacing: "0.04em" }}>{label}</div>
      <div style={{ fontWeight: 700, fontSize: 14, marginTop: 3 }}>{children}</div>
    </div>
  );
}

export function PlanPrice({ plan, interval }: { plan: BillingPlan; interval: BillingInterval }) {
  if (plan.isFree) {
    return (
      <div className="bl-plan-price">
        <b>Free</b>
        <span className="bl-muted">forever</span>
      </div>
    );
  }
  return (
    <div className="bl-plan-price">
      <b>{formatINR(interval === "yearly" ? plan.priceYearly : plan.priceMonthly)}</b>
      <span className="bl-muted">/ {interval === "yearly" ? "year" : "month"} + GST</span>
    </div>
  );
}

/** "5 users", "1 project", "Unlimited users". */
export function countLabel(v: number | null, one: string, many: string): string {
  return v === null ? `Unlimited ${many}` : `${v} ${v === 1 ? one : many}`;
}

export function planFeatureRows(plan: BillingPlan): { label: string; on: boolean }[] {
  const n = countLabel;
  return [
    { label: n(plan.limits.users, "user", "users"), on: true },
    { label: n(plan.limits.projects, "project", "projects"), on: true },
    { label: n(plan.limits.landingPages, "landing page", "landing pages"), on: true },
    { label: n(plan.limits.templates, "template", "templates"), on: true },
    { label: "Team chat", on: plan.modules.teamChat },
    { label: plan.modules.metaLeadAds ? `Meta lead ads (${n(plan.modules.metaPages, "page", "pages")})` : "Meta lead ads", on: plan.modules.metaLeadAds },
  ];
}

export function Empty({ children }: { children: ReactNode }) {
  return <div style={{ padding: 28, textAlign: "center", color: "var(--muted)", fontSize: 13 }}>{children}</div>;
}

export function Loading({ what = "billing" }: { what?: string }) {
  return <div className="bl-muted" style={{ padding: 16 }}>Loading {what}…</div>;
}

/** Sends a wrong URL (e.g. /downgrade for a bigger plan) to the right page, without a history entry. */
export function BillingRedirect({ to, params }: { to: BillingRoute; params?: RouteParams }) {
  const { nav } = useBillingEnv();
  const href = nav.href(to, params);
  useEffect(() => {
    (nav.replace ?? nav.go)(to, params);
    // href captures to + params.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nav, href]);
  return <Loading what="the right page" />;
}

export function ErrorNote({ message }: { message: string }) {
  return <div className="form-alert">{message}</div>;
}

export const PAYMENT_STATUS_META: Record<string, { label: string; badge: string }> = {
  captured: { label: "Paid", badge: "b-green" },
  failed: { label: "Failed", badge: "b-rose" },
  refunded: { label: "Refunded", badge: "b-gray" },
  offline: { label: "Paid offline", badge: "b-indigo" },
};

export const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/**
 * Can this org pay online right now? Needs the backend's online mode AND a
 * real checkout (or the all-mock walkthrough client). Otherwise upgrades are
 * requests a Super Admin approves.
 */
export function useCheckoutLive(overview: BillingOverview | null): boolean {
  const { client } = useBillingEnv();
  if (!overview || overview.paymentMode !== "online") return false;
  return client.isMock || client.isReal("startCheckout");
}

/** Can this org pay its renewal online? Same rule as checkout (manual mode: our team renews it). */
export function useRenewalLive(overview: BillingOverview | null): boolean {
  return useCheckoutLive(overview);
}
