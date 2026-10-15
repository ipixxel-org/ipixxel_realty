"use client";

import type { ReactNode } from "react";
import { useAuth } from "@/lib/auth-context";
import type { BillingInterval } from "@/lib/billing/types";
import { CheckoutScreen } from "./checkout";
import { CheckoutFailure, CheckoutSuccess } from "./checkout-result";
import { ChooseWhatStaysScreen } from "./choose-what-stays";
import { useBillingQuery, useOrgBilling } from "./context";
import { InvoicesTable, PaymentHistoryTable } from "./invoices";
import { CancelScreen, DowngradeScreen } from "./plan-changes";
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

export function PlansPage() {
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
      <PlansScreen />
    </Guard>
  );
}

export function CheckoutPage({ plan, interval, renew }: { plan?: string; interval?: string; renew?: string }) {
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
      <CheckoutScreen planId={plan ?? "growth"} interval={toInterval(interval)} renewal={renewal} />
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

export function DowngradePage({ plan, interval }: { plan?: string; interval?: string }) {
  return (
    <Guard>
      <PageHead eyebrow={EYEBROW} icon="arrow-down" title="Downgrade plan" sub="See when it starts and what doesn't fit, before you confirm." back={{ to: "plans", label: "Plans" }} sampleFns={["getRetentionChoices", "scheduleDowngrade"]} />
      <DowngradeScreen planId={plan ?? "growth"} interval={interval === "monthly" || interval === "yearly" ? interval : undefined} />
    </Guard>
  );
}

export function CancelPage() {
  return (
    <Guard>
      <PageHead
        eyebrow={EYEBROW}
        icon="close"
        title="Cancel plan"
        sub="Cancelling stops the next renewal. You keep everything you've paid for until the end date."
        back={{ to: "overview", label: "Billing" }}
        sampleFns={["cancelPlan"]}
      />
      <CancelScreen />
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

export function ChooseWhatStaysPage({ target }: { target?: string }) {
  const { overview } = useOrgBilling();
  return (
    <Guard>
      <PageHead
        eyebrow={EYEBROW}
        icon="check"
        title="Choose what stays"
        sub="When you move to a smaller plan, pick what stays active. Everything else is paused, never deleted."
        back={{ to: "overview", label: "Billing" }}
        sampleFns={["getRetentionChoices"]}
      />
      <div className="bl-stack">
        {overview ? <BillingBanner overview={overview} /> : null}
        <ChooseWhatStaysScreen targetPlanId={target} />
      </div>
    </Guard>
  );
}
