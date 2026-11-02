/**
 * Plan versions are hidden from organisations: only the plan name, never
 * "v1" / "v2". The "what changes at renewal" notice shows only when the next
 * version is worse for them (a lower limit, a feature off, a higher price),
 * lists only what gets worse, and says "when you renew" during grace. The
 * banner, the renewal popup and the current-plan card share the wording.
 */
import { act, cleanup, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui/toast";
import { BillingEnvProvider } from "@/components/billing/context";
import { BillingBanner, RenewalReminderPopup } from "@/components/billing/banners";
import { CurrentPlanCard } from "@/components/billing/overview";
import type { BillingClient } from "@/lib/billing/client";
import { createMockBillingClient } from "@/lib/billing/mock/client";
import type { Situation } from "@/lib/billing/mock/state";
import { formatDate } from "@/lib/billing/pricing";
import type { BillingOverview, NextPlanVersion, PlanVersionChange } from "@/lib/billing/types";
import { renewalChangeNotice } from "@/lib/billing/versions";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/org/settings",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
});
afterEach(cleanup);

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
      <BillingEnvProvider client={client} viewerId="u1">
        {node}
      </BillingEnvProvider>
    </ToastProvider>,
  );
  await settle();
  return view;
}

/** Far enough ahead to be "in the future" whatever the test clock says. */
const AT = "2099-11-26";
const users = (from: number | null, to: number | null, lower: boolean): PlanVersionChange => ({
  key: "users",
  kind: "limit",
  label: "users",
  from,
  to,
  lower,
  text: "",
});
const teamChat = (to: boolean): PlanVersionChange => ({ key: "teamChat", kind: "feature", label: "Team chat", from: !to, to, lower: !to, text: "" });
const next = (over: Partial<NextPlanVersion>): NextPlanVersion => ({
  planName: "Starter",
  fromVersion: 1,
  toVersion: 2,
  at: AT,
  reason: "renewal",
  price: null,
  changes: [],
  lower: false,
  ...over,
});
const usage5 = [{ key: "users" as const, label: "Users", used: 5, limit: 10 }];
const ov = (nextVersion: NextPlanVersion | null, status: BillingOverview["status"] = "renewal_due") =>
  ({ nextVersion, usage: usage5, status }) as unknown as BillingOverview;

/* ------------------------------------------------------------ The rule */

describe("the notice shows only when the next version is worse", () => {
  it("hidden when everything is the same or better (more users, a feature on, a lower price)", () => {
    expect(renewalChangeNotice(ov(null))).toBeNull();
    expect(
      renewalChangeNotice(
        ov(next({ changes: [users(5, 10, false), teamChat(true)], price: { interval: "monthly", from: 999, to: 899 } })),
      ),
    ).toBeNull();
  });

  it("a lower limit: what it allows and what they have; Choose what stays when they're over", () => {
    const n = renewalChangeNotice(ov(next({ changes: [users(10, 3, true)], lower: true })))!;
    expect(n.text).toBe(`From your next renewal on ${formatDate(AT)}, Starter includes 3 users (you have 5).`);
    expect(n.title).toBe("Changes at your next renewal");
    expect(n.overLimit).toBe(true);
  });

  it("a feature switched off", () => {
    const n = renewalChangeNotice(ov(next({ changes: [teamChat(false)], lower: true })))!;
    expect(n.text).toBe(`From your next renewal on ${formatDate(AT)}, Starter includes no Team chat.`);
    expect(n.overLimit).toBe(false);
  });

  it("a price rise on its own", () => {
    const n = renewalChangeNotice(ov(next({ price: { interval: "monthly", from: 999, to: 1199 } })))!;
    expect(n.text).toBe(`From your next renewal on ${formatDate(AT)}, Starter costs ₹1,199 + GST.`);
  });

  it("lists only what gets worse, and the price rise", () => {
    const n = renewalChangeNotice(
      ov(next({ changes: [users(10, 3, true), teamChat(true)], price: { interval: "monthly", from: 999, to: 1199 }, lower: true })),
    )!;
    expect(n.text).toBe(`From your next renewal on ${formatDate(AT)}, Starter includes 3 users (you have 5) and costs ₹1,199 + GST.`);
    expect(n.text).not.toContain("Team chat");
  });

  it("during grace: 'when you renew', never a past date", () => {
    const grace = renewalChangeNotice(ov(next({ at: "2020-01-01", changes: [users(10, 3, true)], lower: true }), "past_due"))!;
    expect(grace.text).toBe("When you renew, Starter includes 3 users (you have 5).");
    // A renewal date already passed reads the same, whatever the status says.
    expect(renewalChangeNotice(ov(next({ at: "2020-01-01", changes: [users(10, 3, true)] })))!.text).toMatch(/^When you renew,/);
  });
});

/* ------------------------------------------- No version numbers on screen */

async function overviewAt(situation: Situation, over: Partial<BillingOverview>) {
  const client = createMockBillingClient({ initial: { situation, renewalMode: "manual" } });
  const o = await client.getBillingOverview();
  return { client, o: { ...o, ...over } as BillingOverview };
}

const VERSION_TEXT = /\bv\d+\b/;
const worse = next({ planName: "Growth", changes: [users(10, 1, true), teamChat(false)], lower: true, price: { interval: "monthly", from: 2000, to: 2500 } });

describe("org screens never show a version", () => {
  it("current plan card: the plan name only, and the notice without versions", async () => {
    const { client, o } = await overviewAt("renewal_3d", { planVersion: 2, nextVersion: worse });
    const view = await show(client, <CurrentPlanCard overview={o} />);
    expect(screen.getByTestId("current-plan-name")).toHaveTextContent(new RegExp(`^${o.plan.name}$`));
    const block = screen.getByTestId("renewal-change");
    expect(block).toHaveTextContent(`From your next renewal on ${formatDate(AT)}, Growth includes 1 user`);
    expect(block).toHaveTextContent("no Team chat and costs ₹2,500 + GST.");
    expect(within(block).getByRole("link", { name: "Choose what stays" })).toBeInTheDocument();
    expect(view.container.textContent).not.toMatch(VERSION_TEXT);
  });

  it("current plan card: nothing shown for an improvement", async () => {
    const { client, o } = await overviewAt("renewal_3d", { planVersion: 2, nextVersion: next({ changes: [users(5, 10, false)] }) });
    await show(client, <CurrentPlanCard overview={o} />);
    expect(screen.queryByTestId("renewal-change")).toBeNull();
  });

  it("renewal banner and popup: same wording, no versions", async () => {
    const { client, o } = await overviewAt("renewal_3d", { planVersion: 1, nextVersion: worse });
    const view = await show(
      client,
      <>
        <BillingBanner overview={o} />
        <RenewalReminderPopup overview={o} alwaysOpen />
      </>,
    );
    const banner = screen.getByTestId("billing-banner");
    expect(within(banner).getByTestId("banner-renewal-change")).toHaveTextContent("Growth includes 1 user");
    expect(screen.getByRole("dialog")).toHaveTextContent("Growth includes 1 user");
    expect(view.baseElement.textContent).not.toMatch(VERSION_TEXT);
  });

  it("renewal banner: no notice for an improvement, and no Choose what stays", async () => {
    const { client, o } = await overviewAt("renewal_3d", { nextVersion: next({ changes: [users(5, 10, false)] }) });
    await show(client, <BillingBanner overview={o} />);
    expect(screen.queryByTestId("banner-renewal-change")).toBeNull();
    expect(screen.queryByRole("link", { name: "Choose what stays" })).toBeNull();
  });

  it("in grace: the banner says 'when you renew'", async () => {
    const { client, o } = await overviewAt("payment_due", { nextVersion: { ...worse, at: "2020-01-01" } });
    await show(client, <BillingBanner overview={o} />);
    expect(screen.getByTestId("banner-renewal-change")).toHaveTextContent(/^When you renew, Growth includes/);
  });

  it("on Basic during the notice: its own banner, no versions", async () => {
    const { client, o } = await overviewAt("basic", {
      nextVersion: next({ planName: "Basic", reason: "basic", changes: [users(5, 1, true)], lower: true }),
    });
    const view = await show(client, <BillingBanner overview={o} />);
    expect(screen.getByTestId("billing-banner")).toHaveTextContent(`Basic changes on ${formatDate(AT)}`);
    expect(view.container.textContent).not.toMatch(VERSION_TEXT);
  });
});

describe("org billing components don't read version numbers", () => {
  it("no planVersion / toVersion / fromVersion outside the Super Admin screens", async () => {
    const { readdirSync, readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const dirs = ["components/billing", "lib/billing"];
    const offenders: string[] = [];
    for (const dir of dirs) {
      for (const name of readdirSync(join(process.cwd(), dir))) {
        if (!/\.tsx?$/.test(name) || name === "types.ts") continue;
        const text = readFileSync(join(process.cwd(), dir, name), "utf8");
        if (/\b(planVersion|toVersion|fromVersion)\b/.test(text)) offenders.push(`${dir}/${name}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
