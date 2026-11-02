/**
 * Plan versions are hidden from organisations: only the plan name, never
 * "v1" / "v2". The "what changes at renewal" notice shows only when the next
 * version is worse for them (a lower limit, a feature off, a higher price),
 * lists only what gets worse, and says "when you renew" during grace. The
 * banner, the renewal popup and the current-plan card share the wording.
 */
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui/toast";
import { BillingEnvProvider, OrgBillingProvider, useOrgBilling } from "@/components/billing/context";
import { BillingBanner, pausedCountsText, RenewalReminderPopup, UpcomingChoiceModal } from "@/components/billing/banners";
import { CurrentPlanCard } from "@/components/billing/overview";
import type { BillingClient } from "@/lib/billing/client";
import { createMockBillingClient } from "@/lib/billing/mock/client";
import type { Situation } from "@/lib/billing/mock/state";
import { formatDate } from "@/lib/billing/pricing";
import type { BillingOverview, NextPlanVersion, PlanVersionChange } from "@/lib/billing/types";
import { renewalChangeNotice, upcomingChoicePrompt } from "@/lib/billing/versions";

const nav = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => nav,
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

/* ------------------------- Answering what stays for an upcoming version */

/** Basic changes on AT: 4 users (they have 5). */
const smallerBasic = (whatStays: NextPlanVersion["whatStays"] = null): NextPlanVersion =>
  next({
    planName: "Basic",
    reason: "basic",
    changes: [users(5, 4, true)],
    lower: true,
    overLimits: [{ key: "users", limit: 4, used: 5 }],
    whatStays,
  });

describe("after choosing, the notice is one line", () => {
  it("chosen (or default picks): 'Basic changes on <date>. You've chosen what stays · View / Change'", async () => {
    for (const answer of ["chosen", "default"] as const) {
      const { client, o } = await overviewAt("basic", { nextVersion: smallerBasic(answer) });
      await show(client, <CurrentPlanCard overview={o} />);
      const line = screen.getByTestId("renewal-change");
      expect(line).toHaveAttribute("data-answered", "true");
      expect(line).toHaveTextContent(`Basic changes on ${formatDate(AT)}. You've chosen what stays · View / Change`);
      expect(within(line).getByRole("link", { name: "View / Change" }).getAttribute("href")).toContain("choose-what-stays");
      expect(screen.queryByRole("link", { name: "Choose what stays" })).toBeNull();
      cleanup();
    }
  });

  it("not chosen yet: the full notice with Choose what stays", async () => {
    const { client, o } = await overviewAt("basic", { nextVersion: smallerBasic(null) });
    await show(client, <CurrentPlanCard overview={o} />);
    const box = screen.getByTestId("renewal-change");
    expect(box).not.toHaveAttribute("data-answered");
    // "you have" is the org's own count (the sample org has 10 users).
    expect(box.textContent).toContain(`From ${formatDate(AT)}, Basic includes 4 users (you have `);
    expect(within(box).getByRole("link", { name: "Choose what stays" })).toBeInTheDocument();
  });

  it("the prompt text", () => {
    expect(upcomingChoicePrompt({ nextVersion: smallerBasic(null), status: "free" })).toBe(
      `Starting ${formatDate(AT)}, Basic includes 4 users (you have 5). Pick what stays active; nothing is deleted.`,
    );
    expect(upcomingChoicePrompt({ nextVersion: smallerBasic("default"), status: "free" })).toBeNull();
    expect(upcomingChoicePrompt({ nextVersion: { ...smallerBasic(null), overLimits: [] }, status: "free" })).toBeNull();
  });
});

describe("the question after login", () => {
  /** An overview the client serves (and updates when they keep the default picks). */
  async function setup(canEdit: boolean, whatStays: NextPlanVersion["whatStays"] = null) {
    const base = createMockBillingClient({ initial: { situation: "basic", renewalMode: "manual" } });
    let o: BillingOverview = { ...(await base.getBillingOverview()), nextVersion: smallerBasic(whatStays) };
    const keepDefaultPicks = vi.fn(async () => {
      o = { ...o, nextVersion: smallerBasic("default") };
      return {} as never;
    });
    const client = { ...base, getBillingOverview: async () => o, keepDefaultPicks } as BillingClient;
    function Modal({ onChooseScreen = false }: { onChooseScreen?: boolean }) {
      const { overview } = useOrgBilling();
      return overview ? <UpcomingChoiceModal overview={overview} onChooseScreen={onChooseScreen} /> : null;
    }
    const view = (onChooseScreen = false) =>
      render(
        <ToastProvider>
          <BillingEnvProvider client={client} canEdit={canEdit}>
            <OrgBillingProvider>
              <Modal onChooseScreen={onChooseScreen} />
            </OrgBillingProvider>
          </BillingEnvProvider>
        </ToastProvider>,
      );
    return { view, keepDefaultPicks };
  }

  it("billing editors over the limits who haven't chosen: the question, with no way to close it", async () => {
    const { view } = await setup(true);
    view();
    await settle();
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByTestId("upcoming-choice-text")).toHaveTextContent(
      `Starting ${formatDate(AT)}, Basic includes 4 users (you have 5). Pick what stays active; nothing is deleted.`,
    );
    expect(within(dialog).getByRole("button", { name: "Keep the default picks" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Choose what stays" })).toBeInTheDocument();
    // No close button; Escape and clicking outside do nothing.
    expect(within(dialog).queryByRole("button", { name: "Close" })).toBeNull();
    fireEvent.keyDown(document, { key: "Escape" });
    const backdrop = document.querySelector(".modal-backdrop");
    if (backdrop) fireEvent.click(backdrop);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("people without billing:edit see nothing", async () => {
    const { view } = await setup(false);
    view();
    await settle();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("already answered, or on the Choose what stays screen: nothing", async () => {
    const answered = await setup(true, "chosen");
    answered.view();
    await settle();
    expect(screen.queryByRole("dialog")).toBeNull();
    cleanup();
    const onScreen = await setup(true);
    onScreen.view(true);
    await settle();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Keep the default picks: saved, closed, and not shown again", async () => {
    const { view, keepDefaultPicks } = await setup(true);
    view();
    await settle();
    fireEvent.click(screen.getByRole("button", { name: "Keep the default picks" }));
    await settle();
    expect(keepDefaultPicks).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
    // A fresh load (next login): still answered.
    cleanup();
    view();
    await settle();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Choose what stays opens the screen", async () => {
    const { view } = await setup(true);
    view();
    await settle();
    fireEvent.click(screen.getByRole("button", { name: "Choose what stays" }));
    expect(nav.push).toHaveBeenCalledWith(expect.stringContaining("/choose-what-stays"));
  });
});

describe("the 'You're on Basic now' banner", () => {
  it("counts: no zeros, singular / plural right", () => {
    expect(pausedCountsText({ users: 2, projects: 0, landingPages: 1, templates: 2 })).toBe("2 users paused, 1 landing page offline, 2 templates paused");
    expect(pausedCountsText({ users: 1, projects: 3, landingPages: 0, templates: 1 })).toBe("1 user paused, 3 projects view-only, 1 template paused");
    expect(pausedCountsText({ users: 0, projects: 0, landingPages: 0, templates: 0 })).toBe("");
  });

  it("the banner uses them; the support note only when no change is open", async () => {
    const { client, o } = await overviewAt("moved_to_basic", {
      locked: { users: 2, projects: 0, landingPages: 1, templates: 2 },
      nextVersion: null,
    });
    await show(client, <BillingBanner overview={o} />);
    const banner = screen.getByTestId("billing-banner");
    expect(banner).toHaveTextContent("2 users paused, 1 landing page offline, 2 templates paused. Nothing was deleted");
    expect(banner.textContent).not.toMatch(/\b0 projects|landing pages offline/);
    expect(within(banner).getByTestId("what-stays-locked")).toHaveTextContent("To change what stays, contact our support team");
    cleanup();

    const open = await overviewAt("moved_to_basic", { nextVersion: smallerBasic(null) });
    await show(open.client, <BillingBanner overview={open.o} />);
    expect(within(screen.getByTestId("billing-banner")).queryByTestId("what-stays-locked")).toBeNull();
  });
});
