"use client";

import { useState, type ReactNode } from "react";
import { Icon } from "@/components/icons";
import { useAuth } from "@/lib/auth-context";
import { BLink, PageHead } from "../ui";
import { billingClient } from "@/lib/billing";
import { BillingEnvProvider } from "../context";
import { AdminBillingEnv } from "./admin-env";
import { CheckoutsNeedingReview } from "./checkouts-review";
import { BLANK_COUPON, CouponForm, CouponsList, CouponUsage, EditCoupon } from "./coupons";
import { LifecycleSettingsCard } from "./lifecycle";
import { AdminEditPlan, AdminPlansEditor } from "./plans-editor";
import { CompanyTaxDetailsCard } from "./company";
import { AdminPaymentsView } from "./payments";
import { SubscriptionDetailView, SubscriptionsList } from "./subscriptions";
import { AdminWhatStaysButton, OrgPackageRequests } from "./package-requests";

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
  const { hasPermission } = useAuth();
  return (
    <Guard>
      <div className="bl-stack" style={{ gap: 12 }}>
        <div className="bl-muted">Prices exclude GST. Changes apply to new purchases now and to existing subscriptions from their next renewal.</div>
        <AdminPlansEditor canDelete={hasPermission("admin_subscriptions", "delete")} />
      </div>
    </Guard>
  );
}

/** /admin-console/subscriptions/plans/:id/edit with billing v2 on: the full plan form. */
export function AdminEditPlanPage({ planId }: { planId: string }) {
  const { hasPermission } = useAuth();
  if (!hasPermission("admin_subscriptions", "edit")) {
    return (
      <div className="card" style={{ padding: 32, textAlign: "center" }}>
        <h1 style={{ margin: "0 0 8px", fontSize: 22 }}>Access restricted</h1>
        <p className="muted" style={{ margin: 0 }}>You don&apos;t have permission to edit plans.</p>
      </div>
    );
  }
  return (
    <AdminBillingEnv>
      <AdminEditPlan planId={planId} />
    </AdminBillingEnv>
  );
}

/** The "Organisation Subscriptions" tab of the existing Subscriptions page, with billing v2 on. */
export function AdminSubscriptionsV2() {
  return (
    <Guard>
      <SubscriptionsList syncUrl />
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

/** Which Subscriptions list opened an org page (?from=…&status=…&q=…&page=…), for its Back link. */
export interface SubscriptionsListOrigin {
  from?: string | null;
  status?: string | null;
  plan?: string | null;
  q?: string | null;
  page?: string | null;
}

export function AdminSubscriptionDetailPage({ orgId, origin = {} }: { orgId: string; origin?: SubscriptionsListOrigin }) {
  // Approving / rejecting a request changes the plan: reload the billing view.
  const [version, setVersion] = useState(0);
  const back = origin.from
    ? { tab: origin.from, status: origin.status, plan: origin.plan, q: origin.q, page: origin.page }
    : {};
  return (
    <Guard>
      <PageHead eyebrow="Subscriptions" icon="organisation" title="Organisation billing" back={{ to: "adminSubscriptions", params: back, label: "Subscriptions" }} sampleFns={["getSubscription"]} />
      <div className="bl-stack">
        <SubscriptionDetailView key={version} orgId={orgId} />
        {/* Support requests after the org's choice is locked: what stays on its current plan, applied at once. */}
        <div className="bl-row">
          <AdminWhatStaysButton orgId={orgId} label="Change what stays" onSaved={() => setVersion((v) => v + 1)} />
        </div>
        <OrgPackageRequests orgId={orgId} onChanged={() => setVersion((v) => v + 1)} />
      </div>
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

/** Super Admin → Settings → Company & tax details (billing v2). */
export function AdminCompanyTaxDetails() {
  const { hasPermission } = useAuth();
  return (
    <BillingEnvProvider client={billingClient} canEdit={hasPermission("admin_settings", "edit")}>
      <CompanyTaxDetailsCard />
    </BillingEnvProvider>
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
