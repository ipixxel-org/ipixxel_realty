"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { billingClient } from "@/lib/billing";
import { BILLING_V2 } from "@/lib/billing/flag";
import { BillingBanner, RenewalReminderPopup } from "./banners";
import { BillingEnvProvider, OrgBillingProvider, useOrgBilling } from "./context";
import { BillingAccessProvider } from "./locked";

/** Pages that show the billing banner themselves (or are presentations). */
const OWN_BANNER = ["/org/settings", "/org/billing-walkthrough"];

function ShellBanners() {
  const { overview } = useOrgBilling();
  const pathname = usePathname() ?? "";
  if (!overview || pathname.startsWith("/org/billing-walkthrough")) return null;
  return (
    <>
      <RenewalReminderPopup overview={overview} />
      {OWN_BANNER.some((p) => pathname.startsWith(p)) ? null : (
        <div style={{ marginBottom: 16 }}>
          <BillingBanner overview={overview} />
        </div>
      )}
    </>
  );
}

/**
 * Mounted by the org shell around every page. With NEXT_PUBLIC_BILLING_V2
 * off it renders the children untouched; on, it provides the billing data
 * layer, the account-wide banners/popups and the locked-state access info.
 */
export function BillingV2Root({ canEdit, children }: { canEdit: boolean; children: ReactNode }) {
  if (!BILLING_V2) return <>{children}</>;
  return (
    <BillingEnvProvider client={billingClient} canEdit={canEdit}>
      <OrgBillingProvider>
        <BillingAccessProvider>
          <ShellBanners />
          {children}
        </BillingAccessProvider>
      </OrgBillingProvider>
    </BillingEnvProvider>
  );
}
