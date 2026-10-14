"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { createMockBillingClient, type MockBillingClient } from "@/lib/billing/mock/client";
import { TODAY } from "@/lib/billing/mock/data";
import { LifecycleSettingsCard } from "../admin/lifecycle";
import { BLANK_COUPON, CouponForm, CouponsList, CouponUsage } from "../admin/coupons";
import { AdminPaymentsView } from "../admin/payments";
import { AdminPlansEditor } from "../admin/plans-editor";
import { SubscriptionDetailView, SubscriptionsList } from "../admin/subscriptions";
import { BillingEnvProvider, type BillingRoute } from "../context";
import { AppFrame, type WalkStep } from "./stepper";

/**
 * One shared sandbox for the whole admin walkthrough, so a coupon created in
 * step 2 shows up later. Created by AdminWalkthroughData around the stepper.
 */
const AdminClientContext = createContext<MockBillingClient | null>(null);

export function AdminWalkthroughData({ children }: { children: ReactNode }) {
  const [client] = useState(() => createMockBillingClient());
  return <AdminClientContext.Provider value={client}>{children}</AdminClientContext.Provider>;
}

function AdminSandbox({ children }: { children: ReactNode }) {
  const client = useContext(AdminClientContext);
  if (!client) throw new Error("AdminSandbox needs AdminWalkthroughData");
  // Links stay inside the walkthrough (the Next button moves on).
  return (
    <BillingEnvProvider client={client} inlineDialogs canEdit onNavigate={() => true}>
      {children}
    </BillingEnvProvider>
  );
}

export const ADMIN_STEP_ROUTES: Partial<Record<BillingRoute, number>> = {};

const SKYLINE_OFFER = {
  ...BLANK_COUPON,
  code: "SKYLINE15",
  description: "Retention offer for Skyline Developers",
  value: 15,
  duration: "first_n" as const,
  durationCount: 3,
  validFrom: TODAY,
  validTo: "2026-12-31",
  orgIds: ["org-skyline"],
};

export const ADMIN_STEPS: WalkStep[] = [
  {
    title: "Setting plan prices and limits",
    caption: "Each plan has a monthly and a yearly price, limits on users, projects, landing pages and templates, and the features it includes. Basic is the free plan everyone can fall back to.",
    behind: "New prices apply to new purchases at once, and to existing customers from their next renewal.",
    render: () => (
      <AppFrame url="/admin-console/subscriptions">
        <AdminSandbox>
          <AdminPlansEditor />
        </AdminSandbox>
      </AppFrame>
    ),
  },
  {
    title: "Creating a coupon for one customer",
    caption: "Coupons can be a percentage or a fixed amount, last for the first payment, the first few months or for ever, and be open to everyone or kept for chosen organisations — like this one, just for Skyline Developers.",
    behind: "When a customer types the code, we check the dates, the plan, the usage limit and whether it's meant for them.",
    render: () => (
      <AppFrame url="/admin-console/coupons/new">
        <AdminSandbox>
          <CouponForm initial={SKYLINE_OFFER} isNew />
        </AdminSandbox>
      </AppFrame>
    ),
  },
  {
    title: "Seeing who used a coupon",
    caption: "Every coupon shows how many organisations used it and how much discount it has given, payment by payment.",
    render: () => (
      <div className="bl-stack">
        <AppFrame url="/admin-console/coupons" minHeight={0}>
          <AdminSandbox>
            <CouponsList />
          </AdminSandbox>
        </AppFrame>
        <AppFrame url="/admin-console/coupons/LAUNCH20" label="LAUNCH20 in detail" minHeight={0}>
          <AdminSandbox>
            <CouponUsage code="LAUNCH20" />
          </AdminSandbox>
        </AppFrame>
      </div>
    ),
  },
  {
    title: "Every customer's subscription",
    caption: "One list of every organisation: their plan, whether they're paid up, renewing, behind on payment or moved to Basic, and the next important date. Filter by status or plan.",
    render: () => (
      <AppFrame url="/admin-console/subscriptions">
        <AdminSandbox>
          <SubscriptionsList />
        </AdminSandbox>
      </AppFrame>
    ),
  },
  {
    title: "One customer's history",
    caption: "Opening an organisation shows its full story — when it bought, renewed, missed a payment, used a coupon — plus every payment.",
    render: () => (
      <AppFrame url="/admin-console/subscriptions/org/org-skyline">
        <AdminSandbox>
          <SubscriptionDetailView orgId="org-skyline" />
        </AdminSandbox>
      </AppFrame>
    ),
  },
  {
    title: "Helping a customer who's behind",
    caption: "Support can give a customer more time to pay, or record a bank transfer or cheque so their plan carries on.",
    behind: "Recording an offline payment starts a new period and creates the tax invoice.",
    render: () => (
      <div className="bw-grid2">
        <AppFrame url="/admin-console/subscriptions/org/org-coastal" label="Give more time" minHeight={520}>
          <AdminSandbox>
            <SubscriptionDetailView orgId="org-coastal" initialAction="grace" />
          </AdminSandbox>
        </AppFrame>
        <AppFrame url="/admin-console/subscriptions/org/org-urbannest" label="Record a payment made outside the app" minHeight={520}>
          <AdminSandbox>
            <SubscriptionDetailView orgId="org-urbannest" initialAction="offline" />
          </AdminSandbox>
        </AppFrame>
      </div>
    ),
  },
  {
    title: "Refunding a payment",
    caption: "Refunds are always the full amount. We issue a credit note against the original tax invoice so the accounts stay correct.",
    render: () => (
      <AppFrame url="/admin-console/subscriptions" minHeight={520}>
        <AdminSandbox>
          <AdminPaymentsView initialRefundId="pay_101" />
        </AdminSandbox>
      </AppFrame>
    ),
  },
  {
    title: "What happens when payments stop",
    caption: "The Super Admin decides how many days customers get to pay, which reminders go out, and what happens at the end. The recommended choice is to fall back to the free Basic plan.",
    behind: "Reminders go 3 days before renewal, on the day, midway through the grace days, and the day before they end.",
    render: () => (
      <AppFrame url="/admin-console/settings">
        <AdminSandbox>
          <LifecycleSettingsCard />
        </AdminSandbox>
      </AppFrame>
    ),
  },
];
