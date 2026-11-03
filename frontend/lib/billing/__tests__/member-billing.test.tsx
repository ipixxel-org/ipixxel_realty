/**
 * Billing permissions, step 1: people without billing:edit (e.g. a sales
 * agent) see the billing banner without amounts and with "ask your
 * organisation admin" instead of buttons; limit prompts show before a form
 * opens, for everyone; nothing on load answers 403; billing editors see
 * exactly what they did before.
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AccessStatus, BillingOverview, BillingPlan, OrgUsage } from "../types";
import { noticeFromOverview } from "../notice";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/org/projects",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));

/* --------------------------------------------------------------- the viewer */

let perms = new Set<string>();
const SALES_AGENT = ["crm:view", "crm:add", "crm:edit", "projects:view", "projects:add", "dashboard:view"];
const BILLING_EDITOR = [...SALES_AGENT, "billing:view", "billing:edit", "support:view"];
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({
    accessToken: "t",
    user: { id: "u1" },
    isLoading: false,
    hasPermission: (m: string, a: string) => perms.has(`${m}:${a}`),
  }),
}));

/* ------------------------------------------------------------ fake backend */

const plan = (id: string, name: string, rank: number, price: number): BillingPlan => ({
  id,
  name,
  tagline: "",
  priceMonthly: price,
  priceYearly: price * 10,
  isFree: price === 0,
  rank,
  limits: { users: price ? 5 : 1, projects: price ? 3 : 1, landingPages: 1, templates: null },
  modules: { teamChat: true, metaLeadAds: true, metaPages: null, whatsapp: false, aiCalling: false },
});
const BASIC = plan("basic", "Basic", 0, 0);
const PRO = plan("pro", "Pro", 2, 4000);
const STARTER = plan("starter", "Starter", 1, 2000);

const overview = (over: Partial<BillingOverview> = {}): BillingOverview => ({
  orgName: "Acme",
  ownerName: "Asha Rao",
  plan: PRO,
  paidPlan: PRO,
  interval: "monthly",
  status: "past_due",
  paymentMode: "manual",
  paymentModeReason: "switched_off",
  autoRenewAvailable: false,
  renewalMode: "manual",
  paymentMethod: null,
  billingProfile: { legalName: "Acme", addressLine1: "1 Road", addressLine2: null, city: "Mysuru", state: "29", pincode: "570001", country: "IN", gstin: null },
  billingDetailsMissing: [],
  periodStart: "2026-10-26",
  periodEnd: "2026-11-26",
  daysLeftInPeriod: 0,
  daysInPeriod: 31,
  dueDate: "2026-11-26",
  graceEndsAt: "2026-12-03",
  graceDays: 7,
  graceDay: 2,
  graceDaysLeft: 5,
  movedToBasicAt: null,
  cancelAt: null,
  downgradeTo: null,
  downgradeInterval: null,
  downgradeAt: null,
  renewalAmount: 4720,
  renewalBreakdown: null,
  usage: [],
  locked: { users: 0, projects: 0, landingPages: 0 },
  retention: null,
  pendingUpgrade: null,
  rejectedUpgrade: null,
  ...over,
});

const usage = (over: Partial<OrgUsage> = {}): OrgUsage => ({
  templatesUsed: 0,
  templatesLimit: null,
  projectsUsed: 1,
  projectsLimit: 3,
  usersUsed: 1,
  usersLimit: 5,
  landingPagesUsed: 0,
  landingPagesLimit: null,
  landingPagesCreateUsed: 0,
  landingPagesCreateLimit: null,
  ...over,
});

let backend: { overview: BillingOverview; access: AccessStatus };
/** Answers like the backend: billing:view routes refuse people without it. */
const apiFetch = vi.fn(async (path: string): Promise<unknown> => {
  const needsView = path === "/org/billing/v2" || path === "/org/billing/plans" || path === "/org/billing";
  if (needsView && !perms.has("billing:view")) throw Object.assign(new Error("Forbidden"), { status: 403 });
  if (path === "/org/billing/v2") return backend.overview;
  if (path === "/org/billing/notice") return noticeFromOverview(backend.overview);
  if (path === "/org/billing/access") return backend.access;
  if (path === "/org/billing/plans") return [BASIC, STARTER, PRO];
  if (path.startsWith("/org/projects")) return { data: [], total: 0, page: 1, limit: 12 };
  if (path.startsWith("/org/project-types")) return [];
  throw new Error(`unexpected API call ${path}`);
});
vi.mock("@/lib/api", () => ({
  apiFetch: (path: string) => apiFetch(path),
  getOrgProjectTypes: () => Promise.resolve([]),
  ApiError: class ApiError extends Error {},
}));

async function settle() {
  for (let i = 0; i < 10; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

beforeEach(() => {
  // jsdom has no IntersectionObserver (the page's reveal animations use it).
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    },
  );
  apiFetch.mockClear();
  backend = {
    overview: overview(),
    access: { planId: PRO.id, planName: "Pro", limits: PRO.limits, modules: PRO.modules, pausedUserIds: [], viewOnlyProjectIds: [], offlineLandingPageIds: [], usage: usage() },
  };
  window.localStorage.clear();
  vi.resetModules();
});
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function renderShell(viewer: string[], children: React.ReactNode = <p>page</p>) {
  perms = new Set(viewer);
  vi.stubEnv("NEXT_PUBLIC_BILLING_V2", "true");
  const { BillingV2Root } = await import("@/components/billing/shell-integration");
  const { ToastProvider } = await import("@/components/ui/toast");
  render(
    <ToastProvider>
      <BillingV2Root canEdit={perms.has("billing:edit")} canView={perms.has("billing:view")}>
        {children}
      </BillingV2Root>
    </ToastProvider>,
  );
  await settle();
}

/** Every API path called, and whether the fake backend refused it. */
async function calls() {
  const out: { path: string; refused: boolean }[] = [];
  for (let i = 0; i < apiFetch.mock.calls.length; i++) {
    const result = apiFetch.mock.results[i];
    let refused = false;
    if (result.type === "return") await (result.value as Promise<unknown>).catch(() => (refused = true));
    out.push({ path: apiFetch.mock.calls[i][0], refused });
  }
  return out;
}

const banner = () => screen.getByTestId("billing-banner");

describe("a sales agent (no billing permission)", () => {
  it("grace: the banner without amounts, with the admin text, and no 403 on load", async () => {
    await renderShell(SALES_AGENT);
    expect(banner()).toHaveTextContent("Your Pro plan's renewal is overdue");
    expect(banner()).toHaveTextContent("Some users, projects and pages may pause on 3 Dec 2026 unless it's renewed.");
    expect(screen.getByTestId("billing-ask-admin")).toHaveTextContent("Ask your organisation admin to renew.");
    expect(banner().textContent).not.toMatch(/₹|Pay now|Request renewal|Change plan/);
    expect(screen.queryByRole("button", { name: /See what stays/ })).toBeNull();

    const made = await calls();
    expect(made.filter((c) => c.refused)).toEqual([]);
    expect(made.map((c) => c.path).sort()).toEqual(["/org/billing/access", "/org/billing/notice"]);
  });

  it("last day: 'Last day of Pro. From tomorrow Acme moves to Basic. Ask your organisation admin to renew today.'", async () => {
    backend.overview = overview({ status: "grace_ending", graceDaysLeft: 1 });
    await renderShell(SALES_AGENT);
    expect(banner()).toHaveTextContent("Last day of Pro · From tomorrow Acme moves to Basic.");
    expect(screen.getByTestId("billing-ask-admin")).toHaveTextContent("Ask your organisation admin to renew today.");
  });

  it("moved to Basic: nothing was deleted, ask to buy again", async () => {
    backend.overview = overview({ plan: BASIC, status: "moved_to_basic", movedToBasicAt: "2026-12-04", locked: { users: 2, projects: 0, landingPages: 1 } });
    await renderShell(SALES_AGENT);
    expect(banner()).toHaveTextContent("Your organisation is on Basic now");
    expect(banner()).toHaveTextContent("2 users paused, 1 landing page offline. Nothing was deleted and leads keep coming in.");
    expect(screen.getByTestId("billing-ask-admin")).toHaveTextContent("Ask your organisation admin to buy a plan again.");
    expect(banner().textContent).not.toMatch(/₹|Buy Pro again/);
  });

  it("scheduled change: 'Your plan changes to Starter on 26 Nov 2026. Your organisation admin decides what stays active.'", async () => {
    backend.overview = overview({ status: "downgrade_scheduled", downgradeTo: STARTER, downgradeAt: "2026-11-26", daysLeftInPeriod: 23, renewalAmount: null });
    await renderShell(SALES_AGENT);
    expect(banner()).toHaveTextContent("Your plan changes to Starter on 26 Nov 2026");
    expect(screen.getByTestId("billing-ask-admin")).toHaveTextContent("Your organisation admin decides what stays active.");
    expect(screen.queryByRole("button", { name: /Keep Pro/ })).toBeNull();
  });

  it("no renewal pop-up and no 'Choose what stays active' pop-up", async () => {
    backend.overview = overview({ status: "renewal_due", daysLeftInPeriod: 3, graceEndsAt: null, graceDaysLeft: 0, paymentMode: "online", paymentModeReason: null });
    await renderShell(SALES_AGENT);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(banner()).toHaveTextContent("Your Pro plan renews on 26 Nov 2026");
    expect(banner().textContent).not.toMatch(/₹/);
  });
});

describe("billing:view without billing:edit", () => {
  it("member banner from the overview, with See what stays", async () => {
    backend.overview = overview({
      retention: { targetPlanId: BASIC.id, targetPlanName: "Basic", isDefault: true, users: ["Asha Rao"], projects: ["Tower A"], landingPages: [] },
    });
    await renderShell(["billing:view", ...SALES_AGENT]);
    expect(banner()).toHaveTextContent("Your Pro plan's renewal is overdue");
    expect(banner().textContent).not.toMatch(/₹|Pay now|Request renewal/);
    fireEvent.click(screen.getByRole("button", { name: "See what stays" }));
    expect(screen.getByText("Tower A")).toBeInTheDocument();
    expect((await calls()).filter((c) => c.refused)).toEqual([]);
  });
});

describe("billing editors see everything as before", () => {
  it("the banner keeps its buttons and amounts; the overview is loaded, not the notice", async () => {
    await renderShell(BILLING_EDITOR);
    expect(banner()).toHaveTextContent("Pro renewal overdue");
    expect(screen.getByRole("link", { name: /Request renewal · ₹4,000 \+ GST/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Change plan" })).toBeInTheDocument();
    expect(screen.queryByTestId("billing-ask-admin")).toBeNull();
    const paths = (await calls()).map((c) => c.path);
    expect(paths).toContain("/org/billing/v2");
    expect(paths).not.toContain("/org/billing/notice");
  });
});

describe("limit prompts appear before a form opens", () => {
  async function renderProjects(viewer: string[]) {
    backend.access = { ...backend.access, usage: usage({ projectsUsed: 3, projectsLimit: 3 }) };
    perms = new Set(viewer);
    const { default: ProjectsPage } = await import("@/app/org/projects/page");
    render(<ProjectsPage />);
    await settle();
  }

  it("a sales agent: New project opens 'Project limit reached … Ask your organisation admin' with OK", async () => {
    await renderProjects(SALES_AGENT);
    // Limits come from GET /org/billing/access, never the legacy GET /org/billing.
    const paths = (await calls()).map((c) => c.path);
    expect(paths).toContain("/org/billing/access");
    expect(paths).not.toContain("/org/billing");
    expect(screen.queryByRole("link", { name: "Upgrade plan" })).toBeNull();
    expect(screen.getAllByTestId("ask-admin-upgrade")[0]).toHaveTextContent("Ask your organisation admin to upgrade the plan.");

    fireEvent.click(screen.getByRole("button", { name: /New project/ }));
    expect(screen.getByText("Project limit reached")).toBeInTheDocument();
    expect(screen.getByTestId("limit-prompt-text")).toHaveTextContent(
      "Your plan allows 3 and you have 3. Ask your organisation admin to upgrade the plan.",
    );
    fireEvent.click(screen.getByTestId("limit-prompt-ok"));
    expect(screen.queryByText("Project limit reached")).toBeNull();
  });

  it("a billing editor: today's disabled New project and the Upgrade plan link", async () => {
    await renderProjects(BILLING_EDITOR);
    expect(screen.getByRole("link", { name: "Upgrade plan" })).toHaveAttribute("href", "/org/settings?section=billing");
    expect(screen.getByRole("button", { name: /New project/ })).toBeDisabled();
    expect(screen.queryByTestId("ask-admin-upgrade")).toBeNull();
  });
});

describe("lock notices and badges", () => {
  it("a sales agent: ask-your-admin words, no Upgrade, no Contact support without support:view", async () => {
    perms = new Set(SALES_AGENT);
    const { PlanLockNotice, PlanLockBadge, TeamChatReadOnlyNotice } = await import("@/components/billing/locked");
    const { BillingEnvProvider } = await import("@/components/billing/context");
    const { createMockBillingClient } = await import("@/lib/billing/mock/client");
    render(
      <BillingEnvProvider client={createMockBillingClient()} canEdit={false}>
        <PlanLockNotice kind="project_view_only" />
        <PlanLockBadge kind="user_paused" />
        <TeamChatReadOnlyNotice planName="Basic" />
      </BillingEnvProvider>,
    );
    expect(screen.getByText(/This project is view-only because your plan's project limit is lower\. Ask your organisation admin to upgrade or change what stays\./)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Upgrade" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Contact support" })).toBeNull();
    expect(screen.getByText("Paused")).toHaveAttribute(
      "title",
      "Paused because your plan's user limit is lower. Ask your organisation admin to upgrade or change what stays.",
    );
    expect(screen.queryByRole("link", { name: "Upgrade to chat" })).toBeNull();
    expect(screen.getByText(/Ask your organisation admin to upgrade to send messages again/)).toBeInTheDocument();
  });

  it("a billing editor with support: Upgrade and Contact support as before", async () => {
    perms = new Set(BILLING_EDITOR);
    const { PlanLockNotice } = await import("@/components/billing/locked");
    render(<PlanLockNotice kind="project_view_only" />);
    expect(screen.getByRole("link", { name: "Upgrade" })).toHaveAttribute("href", "/org/settings/billing/plans");
    expect(screen.getByRole("link", { name: "Contact support" })).toBeInTheDocument();
  });
});
