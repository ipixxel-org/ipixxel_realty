"use client";

import { useState } from "react";
import { Icon } from "@/components/icons";
import { DEMO_LANDING_PAGES, DEMO_ORG, DEMO_PROJECTS, DEMO_USERS, TODAY } from "@/lib/billing/mock/data";
import type { MockState } from "@/lib/billing/mock/state";
import { BillingBanner, RenewalReminderPopup } from "../banners";
import { CheckoutScreen } from "../checkout";
import { CheckoutSuccess } from "../checkout-result";
import { ChooseWhatStaysScreen } from "../choose-what-stays";
import { useOrgBilling, type BillingRoute } from "../context";
import { LeadsKeepComingNote, LimitReachedDialog, OfflineBadge, OfflinePagePreview, PausedAccountNotice, ViewOnlyBadge } from "../locked";
import { BillingOverviewPanel, CurrentPlanCard } from "../overview";
import { CancelScreen, DowngradeScreen } from "../plan-changes";
import { PlansScreen } from "../plans";
import { AppFrame, Sandbox, type WalkStep } from "./stepper";

/* ------------------------------------------------------------- Situations */

const FRESH_SIGNUP: Partial<MockState> = { situation: "basic", billingProfile: null, redeemed: [], invoices: [] };
const BASIC_WITH_DETAILS: Partial<MockState> = { situation: "basic", redeemed: [] };
const JUST_BOUGHT_GROWTH: Partial<MockState> = {
  situation: "active",
  paidPlanId: "growth",
  periodStart: TODAY,
  invoices: [{ id: "inv_new", number: "IPX/26-27/0714", issuedAt: TODAY, description: "Growth · monthly (LAUNCH20)", subtotal: 1600, gst: 288, total: 1888, status: "paid" }],
};
const PRO = (patch: Partial<MockState>): Partial<MockState> => ({ paidPlanId: "pro", ...patch });

/** Billing screens each step links to — clicking them moves the walkthrough. */
export const ORG_STEP_ROUTES: Partial<Record<BillingRoute, number>> = {
  plans: 1,
  checkout: 2,
  checkoutSuccess: 6,
  overview: 7,
  chooseWhatStays: 11,
};

/* ------------------------------------------------------------- Step bodies */

function UsersAtLimit() {
  const [open, setOpen] = useState(true);
  const users = DEMO_USERS.slice(0, 2);
  return (
    <div className="bl-stack">
      <div className="bl-between">
        <div>
          <div className="bl-muted" style={{ fontWeight: 700, fontSize: 11, letterSpacing: "0.08em" }}>
            TEAM
          </div>
          <div style={{ fontSize: 20, fontWeight: 800 }}>Users</div>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>
          <Icon name="plus" size={15} /> Create user
        </button>
      </div>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Name</th>
              <th>Role</th>
              <th>Email</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td className="bl-strong">{u.name}</td>
                <td>{u.role[0].toUpperCase() + u.role.slice(1)}</td>
                <td>{u.email}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <LimitReachedDialog
        open={open}
        onClose={() => setOpen(false)}
        used={2}
        limit={2}
        planName="Basic"
        nextPlan={{ id: "growth", name: "Growth", limits: { users: 5, projects: 5, landingPages: 5, templates: 5 } }}
      />
    </div>
  );
}

function BannerAndPlan() {
  const { overview } = useOrgBilling();
  if (!overview) return null;
  return (
    <div className="bl-stack">
      <BillingBanner overview={overview} />
      <CurrentPlanCard overview={overview} />
    </div>
  );
}

function RenewalOptionB() {
  const { overview } = useOrgBilling();
  if (!overview) return null;
  return (
    <div className="bl-stack">
      <BillingBanner overview={overview} />
      <CurrentPlanCard overview={overview} />
      <RenewalReminderPopup overview={overview} alwaysOpen />
    </div>
  );
}

function MovedToBasic() {
  const pausedUser = DEMO_USERS.find((u) => u.id === "u4")!;
  const project = DEMO_PROJECTS[1];
  const page = DEMO_LANDING_PAGES[1];
  return (
    <div className="bl-stack">
      <AppFrame url="/org/settings?section=billing" minHeight={0}>
        <Sandbox initial={PRO({ situation: "moved_to_basic" })}>
          <BannerAndPlan />
        </Sandbox>
      </AppFrame>
      <div className="bw-grid3">
        <AppFrame url="/login" label="A paused person signs in" minHeight={0}>
          <div className="bl-stack" style={{ gap: 10 }}>
            <b>Sign in</b>
            <PausedAccountNotice orgName={DEMO_ORG.name} ownerName={DEMO_ORG.ownerName} planName="Basic" userLimit={2} />
            <input className="inp" readOnly value={pausedUser.email} aria-label="Email" />
          </div>
        </AppFrame>
        <AppFrame url={`/org/projects/${project.id}`} label="A project that didn't fit" minHeight={0}>
          <div className="bl-stack" style={{ gap: 10 }}>
            <div className="bl-row" style={{ gap: 8 }}>
              <b style={{ fontSize: 16 }}>{project.name}</b>
              <ViewOnlyBadge />
            </div>
            <div className="bl-muted">
              {project.location} · {project.units} units
            </div>
            <div className="bl-muted">Everything can still be opened and read. Editing comes back when you buy a plan again.</div>
          </div>
        </AppFrame>
        <AppFrame url={`/${page.url.split("/").pop()}`} label="A landing page that didn't fit" minHeight={0}>
          <div className="bl-stack" style={{ gap: 10 }}>
            <div className="bl-row" style={{ gap: 8 }}>
              <b>{page.name}</b>
              <OfflineBadge />
            </div>
            <OfflinePagePreview orgName={DEMO_ORG.name} />
          </div>
        </AppFrame>
      </div>
      <LeadsKeepComingNote />
    </div>
  );
}

/* ------------------------------------------------------------------ Steps */

const billingUrl = "/org/settings?section=billing";

export const ORG_STEPS: WalkStep[] = [
  {
    title: "A free account reaches its limit",
    caption: "Skyline Developers is on the free Basic plan, which allows 2 users. When they try to add a third person, we explain why and offer the next plan up.",
    behind: "We compare the number of people on the account with what the plan allows.",
    render: () => (
      <AppFrame url="/org/users">
        <Sandbox initial={FRESH_SIGNUP}>
          <UsersAtLimit />
        </Sandbox>
      </AppFrame>
    ),
  },
  {
    title: "Choosing a plan",
    caption: "All plans side by side, with a monthly or yearly switch. Prices are shown before GST, and the current plan is marked.",
    render: () => (
      <AppFrame url="/org/settings/billing/plans">
        <Sandbox initial={FRESH_SIGNUP}>
          <PlansScreen />
        </Sandbox>
      </AppFrame>
    ),
  },
  {
    title: "First purchase: billing details",
    caption: "The first time they buy, we ask for the company details that go on the tax invoice. The GST number is optional and checked as they type.",
    behind: "We check the GST number's format and that it matches the chosen state.",
    render: () => (
      <AppFrame url="/org/settings/billing/checkout?plan=growth">
        <Sandbox initial={FRESH_SIGNUP}>
          <CheckoutScreen planId="growth" interval="monthly" parts={["details"]} />
        </Sandbox>
      </AppFrame>
    ),
  },
  {
    title: "Applying a coupon",
    caption: "They enter LAUNCH20 and the price drops by 20% straight away. If a code can't be used, they're told why in plain words.",
    behind: "We check the coupon and recalculate the price.",
    render: () => (
      <div className="bl-stack">
        <AppFrame url="/org/settings/billing/checkout?plan=growth">
          <Sandbox initial={BASIC_WITH_DETAILS}>
            <CheckoutScreen planId="growth" interval="monthly" parts={["coupon", "summary"]} initialCoupon="LAUNCH20" />
          </Sandbox>
        </AppFrame>
        <div className="bw-inset">
          <AppFrame url="/org/settings/billing/checkout?plan=growth" label="When a code doesn't work" minHeight={0}>
            <Sandbox initial={BASIC_WITH_DETAILS}>
              <CheckoutScreen planId="growth" interval="monthly" parts={["coupon"]} initialCoupon="FAKE10" />
            </Sandbox>
          </AppFrame>
        </div>
      </div>
    ),
  },
  {
    title: "The price, with GST",
    caption: "Before paying they see exactly what they're paying for: the plan, the coupon, the tax, and what later months will cost.",
    behind: "Because the company is in Karnataka, like us, the 18% GST is split into two 9% parts.",
    render: () => (
      <AppFrame url="/org/settings/billing/checkout?plan=growth">
        <Sandbox initial={BASIC_WITH_DETAILS}>
          <CheckoutScreen planId="growth" interval="monthly" parts={["summary"]} initialCoupon="LAUNCH20" />
        </Sandbox>
      </AppFrame>
    ),
  },
  {
    title: "Paying",
    caption: "The secure payment window opens. They pay by card, UPI or netbanking. (This is a practice window — no money moves. Click Pay to see the next step.)",
    behind: "Once the bank confirms, we double-check the payment before switching the plan on.",
    render: () => (
      <AppFrame url="/org/settings/billing/checkout?plan=growth" minHeight={560}>
        <Sandbox initial={BASIC_WITH_DETAILS}>
          <CheckoutScreen planId="growth" interval="monthly" parts={["summary"]} initialCoupon="LAUNCH20" autoPay />
        </Sandbox>
      </AppFrame>
    ),
  },
  {
    title: "The plan is active",
    caption: "Straight after paying they see a confirmation: which plan, what they paid and until when. The tax invoice is emailed too.",
    render: () => (
      <AppFrame url="/org/settings/billing/checkout/success">
        <Sandbox initial={JUST_BOUGHT_GROWTH}>
          <CheckoutSuccess
            orgName={DEMO_ORG.name}
            renewalMode="auto"
            receipt={{ planId: "growth", planName: "Growth", interval: "monthly", amount: 1888, reference: "pay_PxW71dYt2Qa9", activeUntil: "2026-11-14", couponCode: "LAUNCH20" }}
          />
        </Sandbox>
      </AppFrame>
    ),
  },
  {
    title: "Billing at a glance",
    caption: "The billing page shows the plan, when it renews, how much of each limit is used, how they pay and every invoice.",
    render: () => (
      <AppFrame url={billingUrl}>
        <Sandbox initial={JUST_BOUGHT_GROWTH}>
          <BillingOverviewPanel />
        </Sandbox>
      </AppFrame>
    ),
  },
  {
    title: "Three days before renewal",
    caption: "Customers choose how they renew. With automatic renewal we simply tell them when we'll charge. With pay-each-time they get a reminder with a Pay now button.",
    behind: "The reminder goes out 3 days before the renewal date — the number of days can be changed by the Super Admin.",
    render: () => (
      <div className="bw-grid2">
        <AppFrame url={billingUrl} label="Option A: Auto-renew">
          <Sandbox initial={PRO({ situation: "renewal_3d", renewalMode: "auto" })}>
            <BannerAndPlan />
          </Sandbox>
        </AppFrame>
        <AppFrame url={billingUrl} label="Option B: Pay each time" minHeight={420}>
          <Sandbox initial={PRO({ situation: "renewal_3d", renewalMode: "manual" })}>
            <RenewalOptionB />
          </Sandbox>
        </AppFrame>
      </div>
    ),
  },
  {
    title: "A payment is missed",
    caption: "If the renewal isn't paid, nothing switches off yet. A red banner counts down the 7 days they have to pay, on every page.",
    behind: "With automatic renewal we also try the card again every day.",
    render: () => (
      <AppFrame url={billingUrl}>
        <Sandbox initial={PRO({ situation: "payment_due" })}>
          <BannerAndPlan />
        </Sandbox>
      </AppFrame>
    ),
  },
  {
    title: "Grace ends tomorrow",
    caption: "On the last day we show exactly what will stay active on the free plan, so nothing comes as a surprise.",
    behind: "If they haven't chosen, we keep the owner and admins, the busiest projects and the pages bringing the most leads.",
    render: () => (
      <AppFrame url={billingUrl}>
        <Sandbox initial={PRO({ situation: "grace_ends_tomorrow" })}>
          <BannerAndPlan />
        </Sandbox>
      </AppFrame>
    ),
  },
  {
    title: "Choosing what stays",
    caption: "Customers can pick for themselves. Tick and untick freely — the counters stop them going over, and the owner can never be removed.",
    behind: "Every item shows why we'd keep it by default.",
    render: () => (
      <AppFrame url="/org/settings/billing/choose-what-stays">
        <Sandbox initial={PRO({ situation: "payment_due" })}>
          <ChooseWhatStaysScreen />
        </Sandbox>
      </AppFrame>
    ),
  },
  {
    title: "Moved to the free plan",
    caption: "If they still don't pay, the account moves to Basic. Extra people are paused, extra projects become read-only and extra pages go offline — nothing is deleted, and new leads keep coming in.",
    behind: "Buying a plan again brings everything back at once.",
    render: () => <MovedToBasic />,
  },
  {
    title: "Upgrading in the middle of the month",
    caption: "Moving from Growth to Pro halfway through the month? They only pay the difference for the 18 days left, and the renewal date stays the same.",
    behind: "We work out the unused part of what they've already paid and take it off.",
    render: () => (
      <AppFrame url="/org/settings/billing/checkout?plan=pro">
        <Sandbox initial={{ situation: "active", paidPlanId: "growth", periodStart: "2026-10-01" }}>
          <CheckoutScreen planId="pro" interval="monthly" parts={["summary"]} />
        </Sandbox>
      </AppFrame>
    ),
  },
  {
    title: "Downgrading or cancelling",
    caption: "Smaller plans and cancellations start at the end of the paid period, never straight away. We warn about anything that won't fit, and it can be undone until then.",
    render: () => (
      <div className="bw-grid2">
        <AppFrame url="/org/settings/billing/downgrade?plan=growth" label="Downgrade Pro → Growth" minHeight={420}>
          <Sandbox initial={PRO({ situation: "active" })} stay>
            <DowngradeScreen planId="growth" />
          </Sandbox>
        </AppFrame>
        <AppFrame url="/org/settings/billing/cancel" label="After cancelling — with an undo" minHeight={420}>
          <Sandbox initial={PRO({ situation: "cancellation_scheduled" })} stay>
            <CancelScreen />
          </Sandbox>
        </AppFrame>
      </div>
    ),
  },
];
