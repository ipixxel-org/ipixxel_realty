"use client";

import type { ReactNode } from "react";
import { useAuth } from "@/lib/auth-context";
import type { BillingInterval } from "@/lib/billing/types";
import { CheckoutScreen } from "./checkout";
import { CheckoutFailure, CheckoutSuccess } from "./checkout-result";
import { OrgCouponsScreen } from "./coupons-org";
import { RequestsTable } from "./requests";
import { ChooseWhatStaysScreen, type WhatStaysBack } from "./choose-what-stays";
import { useBillingEnv, useBillingQuery, useOrgBilling } from "./context";
import { InvoicesTable, PaymentHistoryTable } from "./invoices";
import { DowngradeScreen, MoveToBasicScreen } from "./plan-changes";
import { PlansScreen } from "./plans";
import { BillingBanner } from "./banners";
import { Loading, PageHead } from "./ui";

/** The real billing pages (Settings → Billing → …). Mounted only with NEXT_PUBLIC_BILLING_V2=true. */

function Guard({ children }: { children: ReactNode }) {
  const { hasPermission } = useAuth();
  if (!hasPermission("billing", "view")) {
    return (
      <div className="card" style={{ padding: 32, textAlign: "center" }}>
        <h1 style={{ margin: "0 0 8px", fontSize: 22 }}>Access restricted</h1>
        <p className="muted" style={{ margin: 0 }}>You don&apos;t have permission to view billing.</p>
      </div>
    );
  }
  return <>{children}</>;
}

const EYEBROW = "Settings · Billing & Subscription";
const toInterval = (v?: string): BillingInterval => (v === "yearly" ? "yearly" : "monthly");

export function PlansPage({ coupon, interval }: { coupon?: string; interval?: string } = {}) {
  return (
    <Guard>
      <PageHead
        eyebrow={EYEBROW}
        icon="crown"
        title="Plans"
        sub="Prices exclude 18% GST. Upgrades start now (you pay only the difference for the rest of this period); downgrades start at the end of the period."
        back={{ to: "overview", label: "Billing" }}
        sampleFns={["listPlans", "getBillingOverview"]}
      />
      <PlansScreen coupon={coupon || undefined} initialInterval={interval === "monthly" || interval === "yearly" ? interval : undefined} />
    </Guard>
  );
}

export function CheckoutPage({ plan, interval, renew, coupon, pick }: { plan?: string; interval?: string; renew?: string; coupon?: string; pick?: string }) {
  const renewal = renew === "1";
  return (
    <Guard>
      <PageHead
        eyebrow={EYEBROW}
        icon="tag"
        title={renewal ? "Renew your plan" : "Checkout"}
        sub={renewal ? "Billing details and the full price for your next term." : "Billing details, coupon and the full price before you pay."}
        back={renewal ? { to: "overview", label: "Billing" } : { to: "plans", label: "Plans" }}
        sampleFns={["listPlans", "getBillingOverview"]}
      />
      <CheckoutScreen
        planId={plan ?? "growth"}
        interval={toInterval(interval)}
        renewal={renewal}
        initialCoupon={renewal ? undefined : coupon || undefined}
        initialPick={pick === "saved" ? "saved" : null}
      />
    </Guard>
  );
}

export function CheckoutSuccessPage(p: { plan?: string; interval?: string; amount?: string; reference?: string; until?: string; coupon?: string; finishing?: string }) {
  const { overview } = useOrgBilling();
  const { data: plans } = useBillingQuery((c) => c.listPlans(), []);
  const plan = plans?.find((x) => x.id === p.plan);
  return (
    <Guard>
      <PageHead eyebrow="Checkout" title="Payment successful" back={{ to: "overview", label: "Billing" }} />
      {overview && plans ? (
        <CheckoutSuccess
          orgName={overview.orgName}
          renewalMode={overview.renewalMode}
          finishing={p.finishing === "1"}
          receipt={{
            planId: p.plan ?? "",
            planName: plan?.name ?? p.plan ?? "",
            interval: toInterval(p.interval),
            amount: Number(p.amount ?? 0),
            reference: p.reference ?? "",
            activeUntil: p.until ?? null,
            couponCode: p.coupon ?? null,
          }}
        />
      ) : (
        <Loading />
      )}
    </Guard>
  );
}

export function CheckoutFailurePage(p: { plan?: string; interval?: string; reason?: string }) {
  const { data: plans } = useBillingQuery((c) => c.listPlans(), []);
  const plan = plans?.find((x) => x.id === p.plan);
  return (
    <Guard>
      <PageHead eyebrow="Checkout" title="Payment failed" back={{ to: "plans", label: "Plans" }} />
      <CheckoutFailure planId={p.plan ?? ""} planName={plan?.name ?? "your plan"} interval={toInterval(p.interval)} reason={p.reason ?? "The payment didn't go through."} />
    </Guard>
  );
}

export function DowngradePage({ plan, interval, pick }: { plan?: string; interval?: string; pick?: string }) {
  return (
    <Guard>
      <PageHead eyebrow={EYEBROW} icon="arrow-down" title="Change plan" sub="See when it starts and what doesn't fit, before you confirm." back={{ to: "plans", label: "Plans" }} sampleFns={["getRetentionChoices", "scheduleDowngrade"]} />
      <DowngradeScreen
          planId={plan ?? "growth"}
          interval={interval === "monthly" || interval === "yearly" ? interval : undefined}
          initialPick={pick === "saved" ? "saved" : null}
        />
    </Guard>
  );
}

/** /org/settings/billing/move-to-basic: the plan change screen for Basic (old /cancel links redirect here). */
export function MoveToBasicPage() {
  return (
    <Guard>
      <PageHead
        eyebrow={EYEBROW}
        icon="arrow-down"
        title="Move to Basic"
        sub="Nothing changes until the end of the period you've paid for."
        back={{ to: "plans", label: "Plans" }}
        sampleFns={["cancelPlan"]}
      />
      <MoveToBasicScreen />
    </Guard>
  );
}

export function InvoicesPage() {
  return (
    <Guard>
      <PageHead eyebrow={EYEBROW} icon="document" title="Invoices & payments" back={{ to: "overview", label: "Billing" }} sampleFns={["listInvoices", "listPayments"]} />
      <div className="bl-stack">
        <InvoicesTable />
        <PaymentHistoryTable />
      </div>
    </Guard>
  );
}

export function CouponsPage() {
  return (
    <Guard>
      <PageHead
        eyebrow={EYEBROW}
        icon="tag"
        title="Coupons"
        sub="Coupons reserved for your organisation and offers open to everyone. Use one at checkout."
        back={{ to: "overview", label: "Billing" }}
        sampleFns={["listOrgCoupons"]}
      />
      <OrgCouponsScreen />
    </Guard>
  );
}

export function RequestsPage() {
  return (
    <Guard>
      <PageHead
        eyebrow={EYEBROW}
        icon="clock"
        title="Requests"
        sub="Plan changes you asked our team to make, and what happened to each."
        back={{ to: "overview", label: "Billing" }}
        sampleFns={["listOrgRequests"]}
      />
      <RequestsTable />
    </Guard>
  );
}

/** `back="checkout"` (from the request screen): Back returns to that request. */
/** Where Choose what stays returns to (Save and Cancel): the page in `back=`, with "I'll choose what stays" selected. */
export function whatStaysBackTarget({ target, back, interval }: { target?: string; back?: string; interval?: string }): WhatStaysBack | null {
  if (back === "checkout" && target) return { to: "checkout", params: { plan: target, interval: toInterval(interval), pick: "saved" }, label: "Back to your request" };
  if (back === "downgrade" && target) return { to: "downgrade", params: { plan: target, interval, pick: "saved" }, label: "Back to your plan change" };
  if (back === "requests") return { to: "requests", label: "Back to requests" };
  return null;
}

export function ChooseWhatStaysPage({ target, back, interval, request }: { target?: string; back?: string; interval?: string; request?: string }) {
  const { overview } = useOrgBilling();
  const { nav } = useBillingEnv();
  const returnTo = whatStaysBackTarget({ target, back, interval });
  return (
    <Guard>
      <PageHead
        eyebrow={EYEBROW}
        icon="check"
        title="Choose what stays"
        sub="When you move to a smaller plan, pick what stays active. Everything else is paused, never deleted."
        back={returnTo ?? { to: "overview", label: "Billing" }}
        sampleFns={["getRetentionChoices"]}
      />
      <div className="bl-stack">
        {overview ? <BillingBanner overview={overview} /> : null}
        <ChooseWhatStaysScreen
          targetPlanId={target}
          requestId={request}
          back={returnTo ?? undefined}
          // Saved: back to the page that opened it (it loads everything again on arrival).
          onSaved={returnTo ? () => (nav.replace ?? nav.go)(returnTo.to, returnTo.params) : undefined}
        />
      </div>
    </Guard>
  );
}
