"use client";

import { useState, type ReactNode } from "react";
import { Icon } from "@/components/icons";
import { Seg } from "@/components/superadmin/seg";
import { useAuth } from "@/lib/auth-context";
import { BLink, PageHead } from "../ui";
import { AdminBillingEnv } from "./admin-env";
import { BLANK_COUPON, CouponForm, CouponsList, CouponUsage, EditCoupon } from "./coupons";
import { LifecycleSettingsCard } from "./lifecycle";
import { AdminPaymentsView } from "./payments";
import { AdminPlansEditor } from "./plans-editor";
import { SubscriptionDetailView, SubscriptionsList } from "./subscriptions";

/** Super Admin billing pages (v2). Mounted only with NEXT_PUBLIC_BILLING_V2=true. */

function Guard({ children }: { children: ReactNode }) {
  const { hasPermission } = useAuth();
  if (!hasPermission("admin_subscriptions", "view")) {
    return (
      <div className="card" style={{ padding: 32, textAlign: "center" }}>
        <h1 style={{ margin: "0 0 8px", fontSize: 22 }}>Access restricted</h1>
        <p className="muted" style={{ margin: 0 }}>You don&apos;t have permission to view subscriptions.</p>
      </div>
    );
  }
  return <AdminBillingEnv>{children}</AdminBillingEnv>;
}

const TABS = [
  { label: "Subscriptions", sub: "Every organisation's plan and where it is in the billing cycle." },
  { label: "Plans", sub: "Prices exclude GST. Changes apply to new purchases now and to existing subscriptions from their next renewal." },
  { label: "Payments", sub: "Every subscription payment. Refunds are always the full amount and issue a credit note." },
];

/**
 * Subscriptions | Plans | Payments. Payments lives here (not on the
 * Razorpay payments-module page, which stays untouched).
 */
export function AdminSubscriptionsPageV2() {
  const [tab, setTab] = useState(0);
  return (
    <Guard>
      <PageHead eyebrow="Billing" title={TABS[tab].label} sub={TABS[tab].sub} actions={<Seg options={TABS.map((t) => t.label)} value={tab} onChange={setTab} />} />
      {tab === 0 ? <SubscriptionsList /> : tab === 1 ? <AdminPlansEditor /> : <AdminPaymentsView />}
    </Guard>
  );
}

export function AdminSubscriptionDetailPage({ orgId }: { orgId: string }) {
  return (
    <Guard>
      <PageHead eyebrow="Subscriptions" icon="organisation" title="Organisation billing" back={{ to: "adminSubscriptions", label: "Subscriptions" }} />
      <SubscriptionDetailView orgId={orgId} />
    </Guard>
  );
}

export function AdminCouponsPage() {
  return (
    <Guard>
      <PageHead
        eyebrow="Billing"
        icon="tag"
        title="Coupons"
        sub="Discounts organisations can enter at checkout. Taken off before GST."
        actions={
          <BLink to="adminCouponNew" className="btn btn-primary">
            <Icon name="plus" size={15} /> New coupon
          </BLink>
        }
      />
      <CouponsList />
    </Guard>
  );
}

export function AdminNewCouponPage() {
  return (
    <Guard>
      <PageHead eyebrow="Coupons" icon="tag" title="New coupon" back={{ to: "adminCoupons", label: "Coupons" }} />
      <CouponForm initial={BLANK_COUPON} isNew />
    </Guard>
  );
}

export function AdminEditCouponPage({ code }: { code: string }) {
  return (
    <Guard>
      <PageHead eyebrow="Coupons" icon="tag" title={`Edit ${code}`} back={{ to: "adminCoupon", params: { code }, label: code }} />
      <EditCoupon code={code} />
    </Guard>
  );
}

export function AdminCouponUsagePage({ code }: { code: string }) {
  return (
    <Guard>
      <PageHead eyebrow="Coupons · usage" icon="tag" title={code} back={{ to: "adminCoupons", label: "Coupons" }} />
      <CouponUsage code={code} />
    </Guard>
  );
}

/** Drop-in for the Settings page's "Subscription expiry policy" card. */
export function AdminLifecycleSettings() {
  return (
    <AdminBillingEnv>
      <LifecycleSettingsCard />
    </AdminBillingEnv>
  );
}
