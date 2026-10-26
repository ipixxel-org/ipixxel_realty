/**
 * Upgrade vs downgrade: one rule (lib/billing/direction.ts) for the plan
 * cards, the checkout and the downgrade page; wrong URLs redirect; the Super
 * Admin plans editor warns when a plan allows less than a cheaper one.
 * Mock plans: Basic (rank 0, free) → Growth (1, the "Starter") → Pro (2).
 */
import { act, cleanup, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui/toast";
import { BillingEnvProvider, OrgBillingProvider } from "@/components/billing/context";
import { PlansScreen } from "@/components/billing/plans";
import { DowngradeScreen } from "@/components/billing/plan-changes";
import { CheckoutScreen } from "@/components/billing/checkout";
import { AdminPlansEditor, PlanEditForm } from "@/components/billing/admin/plans-editor";
import type { BillingClient } from "@/lib/billing/client";
import { planChangeDirection, planChangeRoute } from "@/lib/billing/direction";
import { planLimitWarnings } from "@/lib/billing/plan-limit-warnings";
import { createMockBillingClient } from "@/lib/billing/mock/client";
import type { BillingOverview, BillingPlan } from "@/lib/billing/types";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/org/settings",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ hasPermission: () => true, user: { roleKeys: ["super_admin"] } }) }));

afterEach(cleanup);
beforeEach(() => {
  router.push.mockReset();
  router.replace.mockReset();
});

async function settle() {
  for (let i = 0; i < 8; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

async function show(client: BillingClient, node: ReactNode) {
  const view = render(
    <ToastProvider>
      <BillingEnvProvider client={client}>
        <OrgBillingProvider>{node}</OrgBillingProvider>
      </BillingEnvProvider>
    </ToastProvider>,
  );
  await settle();
  return view;
}

const onGrowth = (interval: "monthly" | "yearly" = "monthly") => createMockBillingClient({ initial: { paidPlanId: "growth", interval } });
const card = (name: string) => screen.getByRole("heading", { name }).closest(".bl-plan-card") as HTMLElement;

const plan = (over: Partial<BillingPlan>): BillingPlan =>
  ({
    id: "x",
    name: "X",
    tagline: "",
    priceMonthly: 0,
    priceYearly: 0,
    isFree: false,
    isActive: true,
    rank: 0,
    limits: { users: null, projects: null, landingPages: null, templates: null },
    modules: { teamChat: true, metaLeadAds: false, metaPages: 0, whatsapp: false, aiCalling: false },
    ...over,
  }) as BillingPlan;

describe("planChangeDirection", () => {
  it("decides by rank first", () => {
    expect(planChangeDirection({ rank: 1, interval: "monthly" }, { rank: 2, interval: "monthly" })).toBe("upgrade");
    expect(planChangeDirection({ rank: 1, interval: "monthly" }, { rank: 0, interval: "monthly" })).toBe("downgrade");
    expect(planChangeDirection({ rank: 1, interval: "yearly" }, { rank: 2, interval: "monthly" })).toBe("upgrade");
  });
  it("same plan: monthly → yearly is an upgrade, yearly → monthly a downgrade", () => {
    expect(planChangeDirection({ rank: 1, interval: "monthly" }, { rank: 1, interval: "yearly" })).toBe("upgrade");
    expect(planChangeDirection({ rank: 1, interval: "yearly" }, { rank: 1, interval: "monthly" })).toBe("downgrade");
    expect(planChangeDirection({ rank: 1, interval: "yearly" }, { rank: 1, interval: "yearly" })).toBe("same");
  });
  it("manual mode, overdue: a paid plan is a request (checkout), Basic is the downgrade page", () => {
    const o = { plan: plan({ id: "growth", rank: 1 }), interval: "monthly", status: "past_due", paymentMode: "manual" } as BillingOverview;
    expect(planChangeRoute(o, plan({ id: "basic", rank: 0, isFree: true }), "monthly", false)).toBe("downgrade");
    expect(planChangeRoute(o, plan({ id: "basic-ish", rank: 0.5 }), "monthly", false)).toBe("checkout");
  });
});

describe("plan cards", () => {
  it("Starter → Pro goes to the checkout with ↑; Starter → Basic goes to the downgrade page with ↓", async () => {
    await show(onGrowth(), <PlansScreen />);
    const pro = within(card("Pro")).getByRole("link", { name: /Change plan/ });
    expect(pro.getAttribute("href")).toMatch(/\/org\/settings\/billing\/checkout\?.*plan=pro/);
    expect(pro.querySelector("[data-icon]")).toHaveAttribute("data-icon", "arrow-up");

    const basic = within(card("Basic")).getByRole("link", { name: /Change plan/ });
    expect(basic.getAttribute("href")).toMatch(/\/org\/settings\/billing\/downgrade\?.*plan=basic/);
    expect(basic.querySelector("[data-icon]")).toHaveAttribute("data-icon", "arrow-down");
  });

  it("monthly → yearly on the same plan is an upgrade (checkout)", async () => {
    await show(onGrowth("monthly"), <PlansScreen interval="yearly" />);
    const link = within(card("Growth")).getByRole("link", { name: /Switch to yearly|Request yearly billing/ });
    expect(link.getAttribute("href")).toMatch(/\/checkout\?.*plan=growth.*interval=yearly/);
    expect(link.querySelector("[data-icon]")).toHaveAttribute("data-icon", "arrow-up");
  });

  it("yearly → monthly on the same plan is a downgrade (downgrade page)", async () => {
    await show(onGrowth("yearly"), <PlansScreen interval="monthly" />);
    const link = within(card("Growth")).getByRole("link", { name: /Switch to monthly/ });
    expect(link.getAttribute("href")).toMatch(/\/downgrade\?.*plan=growth.*interval=monthly/);
    expect(link.querySelector("[data-icon]")).toHaveAttribute("data-icon", "arrow-down");
  });
});

describe("wrong URLs redirect", () => {
  it("/downgrade for a bigger plan goes to the checkout", async () => {
    await show(onGrowth(), <DowngradeScreen planId="pro" />);
    expect(router.replace).toHaveBeenCalledWith(expect.stringMatching(/\/org\/settings\/billing\/checkout\?.*plan=pro/));
    expect(screen.queryByText(/isn't smaller/)).toBeNull();
  });

  it("the checkout for a smaller plan goes to the downgrade page", async () => {
    await show(onGrowth(), <CheckoutScreen planId="basic" interval="monthly" />);
    expect(router.replace).toHaveBeenCalledWith(expect.stringMatching(/\/org\/settings\/billing\/downgrade\?.*plan=basic/));
  });

  it("the checkout for yearly → monthly on the same plan goes to the downgrade page", async () => {
    await show(onGrowth("yearly"), <CheckoutScreen planId="growth" interval="monthly" />);
    expect(router.replace).toHaveBeenCalledWith(expect.stringMatching(/\/downgrade\?.*plan=growth.*interval=monthly/));
  });

  it("the right page doesn't redirect", async () => {
    await show(onGrowth(), <DowngradeScreen planId="basic" />);
    await show(onGrowth(), <CheckoutScreen planId="pro" interval="monthly" />);
    expect(router.replace).not.toHaveBeenCalled();
  });
});

describe("plans editor: limits lower than a cheaper plan", () => {
  const basic = plan({ id: "basic", name: "Basic", isFree: true, rank: 0, limits: { users: 3, projects: 2, landingPages: 3, templates: 1 } });
  const starter = plan({ id: "starter", name: "Starter", priceMonthly: 999, priceYearly: 9990, rank: 1, limits: { users: 2, projects: 3, landingPages: 5, templates: 5 } });

  it("names the plan, the limit and the cheaper plan", () => {
    expect(planLimitWarnings([basic, starter]).map((w) => w.text)).toEqual(["Starter (₹999) allows fewer users than Basic (free)"]);
    // Unlimited beats any number; inactive plans aren't compared.
    expect(planLimitWarnings([basic, { ...starter, limits: { ...starter.limits, users: null } }])).toEqual([]);
    expect(planLimitWarnings([basic, { ...starter, isActive: false }])).toEqual([]);
  });

  it("shows on the plan card", async () => {
    const client = createMockBillingClient();
    const plans = await client.listAdminPlans();
    const growth = plans.find((p) => p.id === "growth")!;
    await client.saveAdminPlan({ ...growth, limits: { ...growth.limits, users: 1 } });
    await show(client, <AdminPlansEditor />);
    const cards = screen.getAllByTestId("admin-plan-card");
    const growthCard = cards.find((c) => within(c).queryByText("Growth"))!;
    expect(within(growthCard).getByTestId("plan-limit-warning")).toHaveTextContent(/Growth \(₹[\d,]+\) allows fewer users than Basic \(free\)/);
    expect(cards.filter((c) => within(c).queryByTestId("plan-limit-warning"))).toHaveLength(1);
  });

  it("warns in the edit form without blocking Save", async () => {
    await show(createMockBillingClient(), <PlanEditForm initial={{ ...starter, limits: { ...starter.limits, users: 1 } }} plans={[basic, starter]} />);
    expect(screen.getByTestId("plan-limit-warning")).toHaveTextContent("Starter (₹999) allows fewer users than Basic (free)");
  });
});
