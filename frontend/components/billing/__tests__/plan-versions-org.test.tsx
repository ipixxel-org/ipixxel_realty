/**
 * Plan versions, for the org: "Growth (v1)" on Billing, and from the renewal
 * window (Basic: during the 7 days' notice) what the newer version changes —
 * on the banner and under the current plan, with "Choose what stays" when a
 * limit goes down. A price change on its own is shown too.
 */
import { act, cleanup, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui/toast";
import { BillingEnvProvider } from "@/components/billing/context";
import { BillingBanner } from "@/components/billing/banners";
import { CurrentPlanCard } from "@/components/billing/overview";
import type { BillingClient } from "@/lib/billing/client";
import { createMockBillingClient } from "@/lib/billing/mock/client";
import type { Situation } from "@/lib/billing/mock/state";
import { formatDate } from "@/lib/billing/pricing";
import type { BillingOverview, NextPlanVersion } from "@/lib/billing/types";
import { nextVersionLine, nextVersionTitle, planNameWithVersion } from "@/lib/billing/versions";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/org/settings",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));

beforeEach(() => window.localStorage.clear());
afterEach(cleanup);

async function settle() {
  for (let i = 0; i < 8; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

async function show(client: BillingClient, node: ReactNode) {
  render(
    <ToastProvider>
      <BillingEnvProvider client={client} viewerId="u1">
        {node}
      </BillingEnvProvider>
    </ToastProvider>,
  );
  await settle();
}

const AT = "2026-11-26";
const lower: NextPlanVersion = {
  planName: "Growth",
  fromVersion: 1,
  toVersion: 2,
  at: AT,
  reason: "renewal",
  price: { interval: "monthly", from: 2000, to: 2500 },
  changes: [
    { key: "users", kind: "limit", label: "users", from: 5, to: 3, lower: true, text: "3 users instead of 5" },
    { key: "teamChat", kind: "feature", label: "Team chat", from: true, to: false, lower: true, text: "no Team chat" },
  ],
  lower: true,
};
const priceOnly: NextPlanVersion = { ...lower, changes: [], lower: false };
const basic: NextPlanVersion = {
  ...lower,
  planName: "Basic",
  reason: "basic",
  price: null,
  changes: [{ key: "users", kind: "limit", label: "users", from: 2, to: 1, lower: true, text: "1 user instead of 2" }],
};

async function overviewAt(situation: Situation, over: Partial<BillingOverview>) {
  const client = createMockBillingClient({ initial: { situation, renewalMode: "manual" } });
  const o = await client.getBillingOverview();
  return { client, o: { ...o, ...over } as BillingOverview };
}

/* ------------------------------------------------------------ Wording */

describe("wording", () => {
  it("limits / features change at renewal: what, and the new price", () => {
    expect(nextVersionTitle(lower)).toBe(`Growth changes at your renewal on ${formatDate(AT)}`);
    expect(nextVersionLine(lower)).toBe(
      "From then: 3 users instead of 5, no Team chat. ₹2,500 + GST a month (was ₹2,000). Choose what stays — otherwise the default picks apply. Nothing is deleted.",
    );
  });

  it("a price change on its own", () => {
    expect(nextVersionTitle(priceOnly)).toBe(`Growth will be ₹2,500 + GST from ${formatDate(AT)}`);
    expect(nextVersionLine(priceOnly)).toBe("Was ₹2,000 + GST. Nothing else changes.");
  });

  it("Basic: on the date the notice ends", () => {
    expect(nextVersionTitle(basic)).toBe(`Basic changes on ${formatDate(AT)}`);
    expect(nextVersionLine(basic)).toContain("From then: 1 user instead of 2.");
  });

  it("the plan with its version", () => {
    expect(planNameWithVersion({ plan: { name: "Growth" } as never, planVersion: 2 })).toBe("Growth (v2)");
    expect(planNameWithVersion({ plan: { name: "Growth" } as never, planVersion: null })).toBe("Growth");
  });
});

/* ------------------------------------------------------------- Banner */

describe("banner", () => {
  it("renewal due: says what changes, with Choose what stays for the new limits", async () => {
    const { client, o } = await overviewAt("renewal_3d", { nextVersion: lower });
    await show(client, <BillingBanner overview={o} />);
    const banner = screen.getByTestId("billing-banner");
    expect(within(banner).getByTestId("banner-next-version")).toHaveTextContent("From then: 3 users instead of 5, no Team chat.");
    const choose = within(banner).getByRole("link", { name: "Choose what stays" });
    expect(choose.getAttribute("href")).toContain(`target=${o.plan.id}`);
  });

  it("renewal due, only the price changes: shown, no Choose what stays", async () => {
    const { client, o } = await overviewAt("renewal_3d", { nextVersion: priceOnly });
    await show(client, <BillingBanner overview={o} />);
    const banner = screen.getByTestId("billing-banner");
    expect(within(banner).getByTestId("banner-next-version")).toHaveTextContent("Was ₹2,000 + GST. Nothing else changes.");
    expect(within(banner).queryByRole("link", { name: "Choose what stays" })).toBeNull();
  });

  it("in grace: renewing moves to the new version", async () => {
    const { client, o } = await overviewAt("payment_due", { nextVersion: lower });
    await show(client, <BillingBanner overview={o} />);
    expect(screen.getByTestId("banner-next-version")).toHaveTextContent("Renewing moves you to the new Growth: 3 users instead of 5, no Team chat.");
  });

  it("on Basic during the notice: its own banner", async () => {
    const { client, o } = await overviewAt("basic", { nextVersion: basic });
    await show(client, <BillingBanner overview={o} />);
    const banner = screen.getByTestId("billing-banner");
    expect(banner).toHaveTextContent(`Basic changes on ${formatDate(AT)}`);
    expect(banner).toHaveTextContent("1 user instead of 2");
    expect(within(banner).getByRole("link", { name: "Choose what stays" })).toBeInTheDocument();
  });

  it("nothing to say: no banner on Basic", async () => {
    const { client, o } = await overviewAt("basic", { nextVersion: null });
    await show(client, <BillingBanner overview={o} />);
    expect(screen.queryByTestId("billing-banner")).toBeNull();
  });
});

/* ------------------------------------------------------ Current plan card */

describe("current plan card", () => {
  it("'Growth (v1)' and what changes at renewal: price, then each limit / feature", async () => {
    const { client, o } = await overviewAt("renewal_3d", { planVersion: 1, nextVersion: lower });
    await show(client, <CurrentPlanCard overview={{ ...o, plan: { ...o.plan, name: "Growth" } }} />);
    expect(screen.getByTestId("current-plan-name")).toHaveTextContent("Growth (v1)");
    const block = screen.getByTestId("next-version");
    expect(block).toHaveTextContent(`Growth changes at your renewal on ${formatDate(AT)}`);
    expect(block).toHaveTextContent("Renewing moves you to Growth v2.");
    expect(block).toHaveTextContent("Price: ₹2,500 + GST a month (was ₹2,000)");
    expect(block).toHaveTextContent("3 users instead of 5");
    expect(block).toHaveTextContent("No Team chat");
    expect(within(block).getByRole("link", { name: "Choose what stays" })).toBeInTheDocument();
  });

  it("no newer version: just the plan", async () => {
    const { client, o } = await overviewAt("active", { planVersion: 2, nextVersion: null });
    await show(client, <CurrentPlanCard overview={o} />);
    expect(screen.getByTestId("current-plan-name")).toHaveTextContent(`${o.plan.name} (v2)`);
    expect(screen.queryByTestId("next-version")).toBeNull();
  });
});
