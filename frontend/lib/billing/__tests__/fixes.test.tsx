/**
 * Billing v2 fixes after testing: plan cards + edit form, the yearly saving,
 * the org coupons page, the reminder schedule, the Pay now breakdown and the
 * payment-mode warning.
 */
import { cleanup, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui/toast";
import { BillingEnvProvider, OrgBillingProvider } from "@/components/billing/context";
import { AdminPlansEditor, yearlyHint } from "@/components/billing/admin/plans-editor";
import { LifecycleSettingsCard, reminderRows } from "@/components/billing/admin/lifecycle";
import { OrgCouponsScreen } from "@/components/billing/coupons-org";
import { PlansScreen } from "@/components/billing/plans";
import { renewalPriceNote, renewalPriceText } from "@/lib/billing/pricing";
import { createMockBillingClient } from "../mock/client";
import { yearlySaving } from "../pricing";
import type { BillingClient } from "../client";
import type { LifecycleSettings } from "../types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/admin-console/subscriptions",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({ id: "growth" }),
}));

const auth = { user: { roleKeys: ["super_admin"] }, hasPermission: () => true, isLoading: false };
vi.mock("@/lib/auth-context", () => ({ useAuth: () => auth }));

// The edit route reads the flag and the app-wide client: flag on, client = a mock.
const shared = vi.hoisted(() => ({ client: null as unknown as BillingClient }));
vi.mock("@/lib/billing/flag", () => ({ BILLING_V2: true }));
vi.mock("@/lib/billing", () => ({
  get billingClient() {
    return shared.client;
  },
}));

afterEach(cleanup);

function inEnv(client: BillingClient, node: ReactNode) {
  return render(
    <ToastProvider>
      <BillingEnvProvider client={client}>{node}</BillingEnvProvider>
    </ToastProvider>,
  );
}

describe("yearly saving (admin hint and the org plans page)", () => {
  it("is worked out from the prices, and only when yearly is cheaper", () => {
    expect(yearlySaving(1499, 14990)).toEqual({ amount: 2998, percent: 17 });
    expect(yearlySaving(1000, 12000)).toBeNull(); // no discount
    expect(yearlySaving(1000, 13000)).toBeNull(); // dearer
    expect(yearlySaving(0, 12000)).toBeNull(); // monthly not set
    expect(yearlySaving(1000, 0)).toBeNull(); // yearly not set
    expect(yearlyHint(1499, 14990)).toBe("17% cheaper than 12 × monthly (saves ₹2,998 a year)");
    expect(yearlyHint(1000, 12000)).toBeNull();
  });

  it("the org plans page shows each plan's real saving, and no hardcoded '2 months free'", async () => {
    const client = createMockBillingClient();
    const plans = await client.listPlans();
    inEnv(
      client,
      <OrgBillingProvider>
        <PlansScreen interval="yearly" />
      </OrgBillingProvider>,
    );
    await screen.findAllByText(/Compare plans/);
    expect(screen.queryByText(/2 months free/i)).toBeNull();
    for (const p of plans.filter((x) => !x.isFree)) {
      const s = yearlySaving(p.priceMonthly, p.priceYearly);
      if (s) expect(screen.getByText(`Save ₹${s.amount.toLocaleString("en-IN")} a year`)).toBeInTheDocument();
    }
  });
});

describe("admin plans: cards, and Edit opens the full form", () => {
  it("renders one card per plan with price, limits and Edit — nothing expanded", async () => {
    const client = createMockBillingClient();
    const plans = await client.listAdminPlans();
    inEnv(client, <AdminPlansEditor />);
    const cards = await screen.findAllByTestId("admin-plan-card");
    expect(cards).toHaveLength(plans.length);
    expect(screen.queryAllByRole("spinbutton")).toHaveLength(0); // no price / limit inputs on the list
    const growth = cards.find((c) => within(c).queryByText("Growth"))!;
    expect(within(growth).getByText(/Users/)).toBeInTheDocument();
    expect(within(growth).getByRole("link", { name: "Edit Plan" })).toHaveAttribute("href", "/admin-console/subscriptions/plans/growth/edit");
  });

  it("the edit route (flag on) opens the form: prices, free-plan flag, limits, features", async () => {
    shared.client = createMockBillingClient();
    const { default: EditPlanPage } = await import("@/app/admin-console/subscriptions/plans/[id]/edit/page");
    render(
      <ToastProvider>
        <EditPlanPage />
      </ToastProvider>,
    );
    expect(await screen.findByRole("heading", { name: "Edit Growth" })).toBeInTheDocument();
    expect(screen.getByLabelText("Monthly price (₹, before GST)")).toBeInTheDocument();
    expect(screen.getByLabelText("Yearly price (₹, before GST)")).toBeInTheDocument();
    expect(screen.getByText("Free plan")).toBeInTheDocument();
    expect(screen.getByLabelText("Users")).toBeInTheDocument();
    expect(screen.getByText("Team chat")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save plan" })).toBeInTheDocument();
  });
});

describe("org coupons page", () => {
  it("lists org-only and listed public coupons with their status; Use at checkout pre-fills the code", async () => {
    const client = createMockBillingClient();
    // An open coupon that isn't listed for customers stays hidden.
    await client.saveCoupon({
      isNew: true,
      coupon: {
        code: "SECRET5", description: "", kind: "percent", value: 5, planIds: ["growth"], interval: "any", duration: "first_payment",
        durationCount: null, validFrom: "2026-10-01", validTo: null, totalUses: null, oncePerOrg: true, orgIds: null, showToCustomers: false,
      },
    });
    const rows = await client.listOrgCoupons();
    expect(rows.map((r) => r.code)).not.toContain("SECRET5");
    expect(Object.fromEntries(rows.map((r) => [r.code, r.status]))).toEqual({
      LAUNCH20: "redeemed",
      FLAT500: "available",
      PARTNER100: "available",
      DIWALI25: "expired",
    });
    expect(rows.find((r) => r.code === "PARTNER100")?.forYourOrg).toBe(true);

    inEnv(client, <OrgCouponsScreen />);
    const table = await screen.findAllByTestId("org-coupon-row");
    expect(table).toHaveLength(4);
    const flat = table.find((r) => within(r).queryByText("FLAT500"))!;
    expect(within(flat).getByText("Available")).toBeInTheDocument();
    expect(within(flat).getByText("First payment")).toBeInTheDocument();
    expect(within(flat).getByRole("link", { name: /Use at checkout/ })).toHaveAttribute("href", "/org/settings/billing/plans?coupon=FLAT500");
    const expired = table.find((r) => within(r).queryByText("DIWALI25"))!;
    expect(within(expired).getByText("Expired")).toBeInTheDocument();
    expect(within(expired).queryByRole("link", { name: /Use at checkout/ })).toBeNull();
  });
});

describe("reminder schedule", () => {
  const base = (o: Partial<LifecycleSettings>) => ({
    notifyDaysBefore: 3,
    graceDays: 7,
    reminders: [
      { id: "before_renewal" as const, enabled: true },
      { id: "payment_day" as const, enabled: false },
      { id: "mid_grace" as const, enabled: true },
      { id: "day_before_grace_ends" as const, enabled: true },
    ],
    ...o,
  });

  it("takes its timings from the settings; mid-grace only with 3+ days of grace", () => {
    expect(reminderRows(base({ notifyDaysBefore: 5 })).map((r) => r.when)).toEqual([
      "5 days before renewal",
      "On the renewal date, if unpaid",
      "4 days into grace",
      "1 day before grace ends",
    ]);
    expect(reminderRows(base({ graceDays: 2 })).map((r) => r.rule.id)).toEqual(["before_renewal", "payment_day", "day_before_grace_ends"]);
    expect(reminderRows(base({ graceDays: 0 })).map((r) => r.rule.id)).toEqual(["before_renewal", "payment_day"]);
  });

  it("the card has one description per reminder, real switches, no 'Automatic renewal' column and only Fall back to Basic", async () => {
    const client = createMockBillingClient();
    inEnv(client, <LifecycleSettingsCard />);
    await screen.findByText("Reminder schedule");
    expect(screen.queryByText("Automatic renewal")).toBeNull();
    expect(screen.queryByRole("combobox")).toBeNull(); // no restrict / cancel choice
    expect(screen.getByText("Fall back to Basic")).toBeInTheDocument();
    expect(screen.getAllByRole("switch")).toHaveLength(4); // the 4 reminders only
    expect(screen.getByRole("button", { name: "Run now" })).toBeInTheDocument();
  });
});

describe("online payments switch moved to Integrations", () => {
  it("the lifecycle card no longer shows the switch or its warning, and its button is just Save", async () => {
    const client = createMockBillingClient();
    const s = await client.getLifecycleSettings();
    client.getLifecycleSettings = async () => ({ ...s, onlinePaymentsEnabled: true, paymentMode: "manual", paymentModeReason: "keys_missing" });
    inEnv(client, <LifecycleSettingsCard />);
    await screen.findByText("Reminder schedule");
    expect(screen.queryByText("Online payments (Razorpay)")).toBeNull();
    expect(screen.queryByText(/customers can't pay online yet/)).toBeNull();
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Save expiry/ })).toBeNull();
  });

  it("saving the lifecycle card leaves online_payments_enabled as it is", async () => {
    const client = createMockBillingClient();
    const save = vi.spyOn(client, "saveLifecycleSettings");
    inEnv(client, <LifecycleSettingsCard />);
    (await screen.findByRole("button", { name: "Save" })).click();
    await screen.findByText(/Settings saved/);
    expect(save.mock.calls[0][0]).not.toHaveProperty("onlinePaymentsEnabled");
  });
});

describe("Pay now amount", () => {
  it("is the package price + GST from the server's calculation; the coupon and total are secondary", async () => {
    const o = await createMockBillingClient().getBillingOverview();
    const b = { planName: "Growth", interval: "monthly" as const, price: 1499, couponCode: null, couponDiscount: 0, taxable: 1499, gst: 269.82, total: 1768.82 };
    expect(renewalPriceText({ ...o, renewalBreakdown: b })).toBe("₹1,499 + GST");
    expect(renewalPriceNote({ ...o, renewalBreakdown: b })).toBe("₹1,768.82 incl. GST");
    const coupon = { ...b, couponCode: "TEN", couponDiscount: 149.9, taxable: 1349.1, gst: 242.84, total: 1591.94 };
    expect(renewalPriceText({ ...o, renewalBreakdown: coupon })).toBe("₹1,349.10 + GST");
    expect(renewalPriceNote({ ...o, renewalBreakdown: coupon })).toBe("₹1,499 − ₹149.90 coupon TEN · ₹1,591.94 incl. GST");
  });
});
