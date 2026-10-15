"use client";

import type { ReactNode } from "react";
import { Icon } from "@/components/icons";
import { useAuth } from "@/lib/auth-context";
import { BLink, PageHead } from "../ui";
import { AdminBillingEnv } from "./admin-env";
import { CheckoutsNeedingReview } from "./checkouts-review";
import { BLANK_COUPON, CouponForm, CouponsList, CouponUsage, EditCoupon } from "./coupons";
import { LifecycleSettingsCard } from "./lifecycle";
import { AdminPlansEditor } from "./plans-editor";
import { AdminPaymentsView } from "./payments";
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

/**
 * The "Plans & Pricing Matrices" tab of the existing Subscriptions page, with
 * billing v2 on. The other tabs there stay as they are until their v2
 * versions are real (each later step swaps one).
 */
export function AdminPlansV2() {
  return (
    <Guard>
      <div className="bl-stack" style={{ gap: 12 }}>
        <div className="bl-muted">
          Prices exclude GST. Changes apply to new purchases now and to existing subscriptions from their next renewal. Leave a limit empty for unlimited.
        </div>
        <AdminPlansEditor />
      </div>
    </Guard>
  );
}

/** The "Organisation Subscriptions" tab of the existing Subscriptions page, with billing v2 on. */
export function AdminSubscriptionsV2() {
  return (
    <Guard>
      <SubscriptionsList />
    </Guard>
  );
}

/** The "Payments & Invoicing" tab of the existing Subscriptions page, with billing v2 on. */
export function AdminPaymentsV2() {
  return (
    <Guard>
      <AdminPaymentsView />
    </Guard>
  );
}

export function AdminSubscriptionDetailPage({ orgId }: { orgId: string }) {
  return (
    <Guard>
      <PageHead eyebrow="Subscriptions" icon="organisation" title="Organisation billing" back={{ to: "adminSubscriptions", label: "Subscriptions" }} sampleFns={["getSubscription"]} />
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
        sampleFns={["listCoupons"]}
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
      <PageHead eyebrow="Coupons" icon="tag" title="New coupon" back={{ to: "adminCoupons", label: "Coupons" }} sampleFns={["saveCoupon"]} />
      <CouponForm initial={BLANK_COUPON} isNew />
    </Guard>
  );
}

export function AdminEditCouponPage({ code }: { code: string }) {
  return (
    <Guard>
      <PageHead eyebrow="Coupons" icon="tag" title={`Edit ${code}`} back={{ to: "adminCoupon", params: { code }, label: code }} sampleFns={["getCoupon"]} />
      <EditCoupon code={code} />
    </Guard>
  );
}

export function AdminCouponUsagePage({ code }: { code: string }) {
  return (
    <Guard>
      <PageHead eyebrow="Coupons · usage" icon="tag" title={code} back={{ to: "adminCoupons", label: "Coupons" }} sampleFns={["getCoupon"]} />
      <CouponUsage code={code} />
    </Guard>
  );
}

/** Above the Package Requests table: paid checkouts that need a Super Admin. */
export function AdminCheckoutsNeedingReview() {
  return (
    <AdminBillingEnv>
      <CheckoutsNeedingReview />
    </AdminBillingEnv>
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
