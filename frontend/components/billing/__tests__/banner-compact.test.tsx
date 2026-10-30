/**
 * Billing banners after the demo: yellow (amber) in every state, the last day too,
 * compact with "See what stays", X collapses to a strip for the rest of the
 * day (per user), renewal buttons go to the Plans page (current plan → Renew),
 * and a grace extension from our team is in the text with a matching total.
 */
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui/toast";
import { BillingEnvProvider, OrgBillingProvider, useOrgBilling } from "@/components/billing/context";
import { BillingBanner, RenewalReminderPopup } from "@/components/billing/banners";
import { CurrentPlanCard } from "@/components/billing/overview";
import { PlansScreen } from "@/components/billing/plans";
import { bannerCollapseKey, localDay } from "@/components/billing/ui";
import type { BillingClient } from "@/lib/billing/client";
import { graceDayText, graceTotalDays } from "@/lib/billing/grace";
import { createMockBillingClient } from "@/lib/billing/mock/client";
import { initialMockState, type MockState, type Situation } from "@/lib/billing/mock/state";
import { formatDate } from "@/lib/billing/pricing";
import type { BillingOverview } from "@/lib/billing/types";

const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/org/dashboard",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));

beforeEach(() => {
  push.mockClear();
  window.localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

async function settle() {
  for (let i = 0; i < 8; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

function manual(over: Partial<MockState> = {}): Partial<MockState> {
  const base = initialMockState().lifecycle;
  return { lifecycle: { ...base, onlinePaymentsEnabled: false }, ...over };
}

async function show(client: BillingClient, node: ReactNode, viewerId: string | null = "u1") {
  const view = render(
    <ToastProvider>
      <BillingEnvProvider client={client} viewerId={viewerId}>
        <OrgBillingProvider>{node}</OrgBillingProvider>
      </BillingEnvProvider>
    </ToastProvider>,
  );
  await settle();
  return view;
}

function BannerOnly() {
  const { overview } = useOrgBilling();
  return overview ? <BillingBanner overview={overview} /> : null;
}

const at = (situation: Situation, over: Partial<MockState> = {}) => createMockBillingClient({ initial: { situation, renewalMode: "manual", ...over } });

/* ------------------------------------------------------------ Colours */

describe("banner colours", () => {
  const cases: [Situation, string][] = [
    ["renewal_3d", "amber"],
    ["payment_due", "amber"],
    ["grace_ends_tomorrow", "amber"],
    ["cancellation_scheduled", "amber"],
    ["downgrade_scheduled", "amber"],
    ["moved_to_basic", "gray"],
  ];
  it.each(cases)("%s → %s", async (situation, tone) => {
    await show(at(situation), <BannerOnly />);
    const banner = screen.getByTestId("billing-banner");
    expect(banner).toHaveAttribute("data-tone", tone);
    expect(banner.className).toContain(`bl-banner--${tone}`);
  });

  it("never red — the last day of grace is yellow too", async () => {
    for (const [situation] of cases) {
      const view = await show(at(situation), <BannerOnly />);
      const rose = screen.getByTestId("billing-banner").getAttribute("data-tone") === "rose";
      expect(rose).toBe(false);
      view.unmount();
    }
  });
});

/* ------------------------------------------------- Compact + collapse */

describe("compact banner", () => {
  it("is one line by default; See what stays opens the list in place", async () => {
    await show(at("payment_due"), <BannerOnly />);
    const banner = screen.getByTestId("billing-banner");
    expect(within(banner).getByTestId("banner-countdown")).toHaveTextContent("7days left");
    expect(within(banner).queryByText(/What stays on/)).toBeNull();
    const more = within(banner).getByRole("button", { name: "See what stays" });
    expect(more).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(more);
    expect(within(banner).getByText(/What stays on Basic/)).toBeInTheDocument();
    fireEvent.click(within(banner).getByRole("button", { name: "Hide what stays" }));
    expect(within(banner).queryByText(/What stays on/)).toBeNull();
  });

  it("has no See what stays link when there's no list (renewal reminder)", async () => {
    await show(at("renewal_3d"), <BannerOnly />);
    expect(screen.queryByRole("button", { name: "See what stays" })).toBeNull();
  });

  it("X collapses to a strip, remembered for this user today; Show expands it", async () => {
    const client = at("payment_due");
    const view = await show(client, <BannerOnly />);
    fireEvent.click(screen.getByRole("button", { name: "Collapse banner" }));
    const strip = screen.getByTestId("billing-banner-strip");
    expect(strip).toHaveTextContent("Renewal overdue · 7 days left");
    expect(screen.queryByTestId("billing-banner")).toBeNull();
    expect(window.localStorage.getItem(bannerCollapseKey("u1", "past_due"))).toBe(localDay());

    // Still collapsed after a reload today, for the same user only.
    view.unmount();
    const again = await show(client, <BannerOnly />);
    expect(screen.getByTestId("billing-banner-strip")).toBeInTheDocument();
    again.unmount();
    const other = await show(client, <BannerOnly />, "u2");
    expect(screen.getByTestId("billing-banner")).toBeInTheDocument();
    other.unmount();

    // Show brings it back (and forgets the collapse).
    await show(client, <BannerOnly />);
    fireEvent.click(within(screen.getByTestId("billing-banner-strip")).getByRole("button", { name: "Show" }));
    expect(screen.getByTestId("billing-banner")).toBeInTheDocument();
    expect(window.localStorage.getItem(bannerCollapseKey("u1", "past_due"))).toBeNull();
  });

  it("shows in full again the next day", async () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    window.localStorage.setItem(bannerCollapseKey("u1", "past_due"), localDay(yesterday));
    await show(at("payment_due"), <BannerOnly />);
    expect(screen.getByTestId("billing-banner")).toBeInTheDocument();
    expect(screen.queryByTestId("billing-banner-strip")).toBeNull();
  });

  it("a new billing state shows in full even if today's banner was collapsed", async () => {
    window.localStorage.setItem(bannerCollapseKey("u1", "renewal_due"), localDay());
    await show(at("payment_due"), <BannerOnly />);
    expect(screen.getByTestId("billing-banner")).toBeInTheDocument();
  });

  it("still collapses when storage is blocked", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    await show(at("payment_due"), <BannerOnly />);
    fireEvent.click(screen.getByRole("button", { name: "Collapse banner" }));
    expect(screen.getByTestId("billing-banner-strip")).toBeInTheDocument();
  });
});

/* ------------------------------------------- Renewal buttons → Plans */

describe("renewal buttons go to the Plans page", () => {
  it("online: banner Pay now (with the amount) links to Plans", async () => {
    await show(at("payment_due"), <BannerOnly />);
    const pay = screen.getByRole("link", { name: /^Pay now · ₹[\d,]+ \+ GST$/ });
    expect(pay).toHaveAttribute("href", "/org/settings/billing/plans");
  });

  it("manual: banner Request renewal (with the amount) links to Plans", async () => {
    await show(createMockBillingClient({ initial: manual({ situation: "payment_due" }) }), <BannerOnly />);
    const req = screen.getByRole("link", { name: /^Request renewal · ₹[\d,]+ \+ GST$/ });
    expect(req).toHaveAttribute("href", "/org/settings/billing/plans");
  });

  it("the renewal popup's button opens Plans", async () => {
    const client = at("renewal_3d");
    const overview = await client.getBillingOverview();
    await show(client, <RenewalReminderPopup overview={overview} alwaysOpen />);
    fireEvent.click(screen.getByRole("button", { name: /^Pay now · / }));
    expect(push).toHaveBeenCalledWith("/org/settings/billing/plans");
  });

  it("online: on Plans the current plan is highlighted and reads Renew (renewal checkout)", async () => {
    await show(at("renewal_3d"), <PlansScreen />);
    const card = screen.getByTestId("current-plan-card");
    expect(card.className).toContain("current");
    expect(within(card).getByText("Current plan")).toBeInTheDocument();
    const renew = within(card).getByRole("link", { name: "Renew" });
    expect(renew.getAttribute("href")).toMatch(/\/checkout\?.*renew=1/);
  });

  it("manual: the current plan reads Request renewal (renewal request checkout)", async () => {
    await show(createMockBillingClient({ initial: manual({ situation: "payment_due" }) }), <PlansScreen />);
    const card = screen.getByTestId("current-plan-card");
    const renew = within(card).getByRole("link", { name: "Request renewal" });
    expect(renew.getAttribute("href")).toMatch(/\/checkout\?.*renew=1/);
  });

  it("moved to Basic: banner 'Buy <plan> again' (with the price) links to Plans, where that plan reads Buy again → checkout", async () => {
    const client = at("moved_to_basic");
    const o = await client.getBillingOverview();
    const paid = o.paidPlan!;
    await show(client, <BannerOnly />);
    const buy = screen.getByRole("link", { name: new RegExp(`^Buy ${paid.name} again · ₹[\\d,]+ \\+ GST$`) });
    expect(buy.getAttribute("href")).toMatch(/^\/org\/settings\/billing\/plans(\?|$)/);
    cleanup();
    await show(client, <PlansScreen />);
    const links = screen.getAllByRole("link", { name: "Buy again" });
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute("href")).toMatch(new RegExp(`/checkout\\?.*plan=${paid.id}`));
  });

  it("outside the renewal window the current plan is just Current plan", async () => {
    await show(at("active"), <PlansScreen />);
    const card = screen.getByTestId("current-plan-card");
    expect(within(card).queryByRole("link", { name: "Renew" })).toBeNull();
    expect(within(card).getByRole("button", { name: /Current plan/ })).toBeDisabled();
  });
});

/* -------------------------------------------------- Grace extension */

describe("grace extension in the text", () => {
  async function graceOverview(over: Partial<BillingOverview>): Promise<{ client: BillingClient; o: BillingOverview }> {
    const client = at("payment_due");
    const base = await client.getBillingOverview();
    return { client, o: { ...base, ...over } };
  }

  it("says how many extra days our team added; countdown and text use the same total", async () => {
    const { client, o } = await graceOverview({ status: "past_due", graceDays: 7, graceExtraDays: 3, graceDay: 8, graceDaysLeft: 3, graceEndsAt: "2026-11-02" });
    await show(client, <BillingBanner overview={o} />);
    const banner = screen.getByTestId("billing-banner");
    expect(banner).toHaveTextContent(
      `Day 8 of 10 (7 days + 3 extra days from our team). Everything keeps working until ${formatDate("2026-11-02")}; after that you move to Basic.`,
    );
    expect(within(banner).getByTestId("banner-countdown")).toHaveTextContent("3days left");
    // Day 8 + 3 days left (today counted once) = the 10-day total in the text.
    expect(o.graceDay + o.graceDaysLeft - 1).toBe(graceTotalDays(o));
  });

  it("without an extension the text stays as before", async () => {
    const { client, o } = await graceOverview({ status: "past_due", graceDays: 7, graceExtraDays: 0, graceDay: 3, graceDaysLeft: 5 });
    await show(client, <BillingBanner overview={o} />);
    const banner = screen.getByTestId("billing-banner");
    expect(banner).toHaveTextContent("Day 3 of 7. Everything keeps working until");
    expect(banner.textContent).not.toContain("extra");
    expect(graceDayText({ graceDay: 3, graceDays: 7 })).toBe("Day 3 of 7");
  });

  it("last day: the extension is in the text too", async () => {
    const { client, o } = await graceOverview({ status: "grace_ending", graceDays: 7, graceExtraDays: 3, graceDay: 10, graceDaysLeft: 1 });
    await show(client, <BillingBanner overview={o} />);
    expect(screen.getByTestId("billing-banner")).toHaveTextContent("Day 10 of 10 (7 days + 3 extra days from our team).");
  });

  it("the overview's plan card shows the extension too", async () => {
    const { client, o } = await graceOverview({ status: "past_due", graceDays: 7, graceExtraDays: 1, graceDay: 8, graceDaysLeft: 1 });
    await show(client, <CurrentPlanCard overview={o} />);
    expect(document.body.textContent).toContain("Day 8 of 8 (7 days + 1 extra day from our team)");
  });

  it("the overview's plan card has no day text without an extension", async () => {
    const { client, o } = await graceOverview({ status: "past_due", graceDays: 7, graceExtraDays: 0, graceDay: 3, graceDaysLeft: 5 });
    await show(client, <CurrentPlanCard overview={o} />);
    expect(document.body.textContent).toMatch(/Renewal was due .* · grace until /);
    expect(document.body.textContent).not.toContain("Day 3");
  });
});
