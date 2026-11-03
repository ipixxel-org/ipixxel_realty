"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { billingClient } from "@/lib/billing";
import { BILLING_V2 } from "@/lib/billing/flag";
import { BillingBanner, RenewalReminderPopup, UpcomingChoiceModal } from "./banners";
import { BillingEnvProvider, OrgBillingProvider, useBillingQuery, useOrgBilling } from "./context";
import { BillingAccessProvider } from "./locked";
import { MemberBillingBanner } from "./member-banner";

/** Pages that show the billing banner themselves (or are presentations). */
const OWN_BANNER = ["/org/settings", "/org/billing-walkthrough"];

function ShellBanners({ canView }: { canView: boolean }) {
  const { overview } = useOrgBilling();
  // Without billing:view there's no overview: the banner comes from the member notice (no amounts).
  const { data: notice } = useBillingQuery((c) => (canView ? Promise.resolve(null) : c.getBillingNotice()), [canView]);
  const pathname = usePathname() ?? "";
  if (pathname.startsWith("/org/billing-walkthrough")) return null;
  const ownBanner = OWN_BANNER.some((p) => pathname.startsWith(p));
  if (!overview) {
    return notice && !ownBanner ? (
      <div style={{ marginBottom: 16 }}>
        <MemberBillingBanner notice={notice} />
      </div>
    ) : null;
  }
  return (
    <>
      {/* Both pop-ups are for billing editors only (they check canEdit). */}
      <RenewalReminderPopup overview={overview} />
      {/* Over a newer version's limits and not answered yet: billing editors must pick (not on the screen itself). */}
      <UpcomingChoiceModal overview={overview} onChooseScreen={pathname.includes("/choose-what-stays")} />
      {ownBanner ? null : (
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
 * Every member gets the banner and the lock / limit info: people without
 * billing:view load the notice (GET /org/billing/notice) instead of the overview.
 */
export function BillingV2Root({
  canEdit,
  canView = canEdit,
  canEditOrgProfile = true,
  viewerId = null,
  children,
}: {
  canEdit: boolean;
  /** billing:view — loads the full overview; without it, the member notice. */
  canView?: boolean;
  canEditOrgProfile?: boolean;
  /** Signed-in user id: the banner's "collapsed today" memory is per user. */
  viewerId?: string | null;
  children: ReactNode;
}) {
  if (!BILLING_V2) return <>{children}</>;
  return (
    <BillingEnvProvider client={billingClient} canEdit={canEdit} canEditOrgProfile={canEditOrgProfile} viewerId={viewerId}>
      <OrgBillingProvider enabled={canView}>
        <BillingAccessProvider>
          <ShellBanners canView={canView} />
          {children}
        </BillingAccessProvider>
      </OrgBillingProvider>
    </BillingEnvProvider>
  );
}
