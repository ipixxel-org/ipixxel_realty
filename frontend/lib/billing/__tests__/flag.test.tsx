/**
 * NEXT_PUBLIC_BILLING_V2 gates the real-app integration: off = untouched;
 * on = the hybrid client (real API for step-1/2 functions, mock for the rest).
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AccessStatus, BillingOverview, BillingPlan, CheckoutPreview } from "../types";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/org/projects",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));

/* ------------------------------------------------- fake backend (apiFetch) */

const plan = (id: string, name: string, rank: number, price: number, over: Partial<BillingPlan> = {}): BillingPlan => ({
  id,
  name,
  tagline: "",
  priceMonthly: price,
  priceYearly: price * 10,
  isFree: price === 0,
  rank,
  limits: { users: price ? 5 : 1, projects: null, landingPages: 1, templates: null },
  modules: { teamChat: price > 0, metaLeadAds: true, metaPages: null, whatsapp: false, aiCalling: false },
  ...over,
});
const BASIC = plan("uuid-basic", "Basic", 0, 0);
const GROWTH = plan("uuid-growth", "Growth", 1, 2000);

const overview = (over: Partial<BillingOverview> = {}): BillingOverview => ({
  orgName: "Acme Realty",
  ownerName: "Asha Rao",
  plan: BASIC,
  paidPlan: null,
  interval: "monthly",
  status: "free",
  paymentMode: "manual",
  paymentModeReason: "switched_off",
  autoRenewAvailable: false,
  renewalMode: "manual",
  paymentMethod: null,
  billingProfile: null,
  periodStart: null,
  periodEnd: null,
  daysLeftInPeriod: 0,
  daysInPeriod: 0,
  dueDate: null,
  graceEndsAt: null,
  graceDays: 7,
  graceDay: 0,
  graceDaysLeft: 0,
  movedToBasicAt: null,
  cancelAt: null,
  downgradeTo: null,
  downgradeAt: null,
  renewalAmount: null,
  usage: [
    { key: "users", label: "Users", used: 1, limit: 1 },
    { key: "projects", label: "Projects", used: 3, limit: null },
    { key: "landingPages", label: "Landing pages", used: 1, limit: 1 },
    { key: "templates", label: "Templates", used: 0, limit: null },
  ],
  locked: { users: 0, projects: 0, landingPages: 0 },
  retention: null,
  pendingUpgrade: null,
  ...over,
});

/** Growth monthly from Basic, manual mode, Karnataka buyer — as the backend previews it. */
const preview = (over: Partial<CheckoutPreview> = {}): CheckoutPreview => ({
  planId: GROWTH.id,
  planName: "Growth",
  interval: "monthly",
  kind: "new",
  fromPlan: { id: BASIC.id, name: "Basic", interval: "monthly" },
  planPrice: 2000,
  proration: null,
  couponsEnabled: false,
  coupon: null,
  couponError: null,
  couponDiscount: 0,
  taxable: 2000,
  billingState: "29",
  gst: { kind: "intra", cgst: 180, sgst: 180, igst: 0, total: 360 },
  total: 2360,
  periodEnd: "2026-11-13",
  recurringPrice: 2000,
  couponRenewalsLeft: 0,
  paymentMode: "manual",
  paymentModeReason: "switched_off",
  warnings: [],
  ...over,
});

let backend: { overview: BillingOverview; access: AccessStatus };
const apiFetch = vi.fn(async (path: string, init?: RequestInit): Promise<unknown> => {
  if (path === "/org/billing/v2") return backend.overview;
  if (path === "/org/billing/access") return backend.access;
  if (path === "/org/billing/plans") return [BASIC, GROWTH];
  if (path === "/org/billing/checkout/preview") return preview();
  if (path === "/org/billing/profile" && init?.method === "PUT") {
    const profile = JSON.parse(String(init.body));
    backend.overview = { ...backend.overview, billingProfile: profile };
    return profile;
  }
  if (path === "/org/billing/checkout" && init?.method === "POST") {
    backend.overview = {
      ...backend.overview,
      pendingUpgrade: { status: "pending_approval", requestId: "pcr_1", checkoutId: "chk_1", toPlan: { id: GROWTH.id, name: "Growth" }, interval: "monthly", createdAt: "2026-10-14T10:00:00.000Z" },
    };
    return { status: "pending_approval", mode: "manual", checkoutId: "chk_1", requestId: "pcr_1" };
  }
  throw new Error(`unexpected API call ${path}`);
});
vi.mock("@/lib/api", () => ({ apiFetch: (path: string, init?: RequestInit) => (init ? apiFetch(path, init) : apiFetch(path)), ApiError: class ApiError extends Error {} }));

/* ------------------------------------------------------------------- setup */

async function settle() {
  for (let i = 0; i < 8; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

let errors: unknown[][] = [];
beforeEach(() => {
  errors = [];
  apiFetch.mockClear();
  push.mockClear();
  backend = {
    overview: overview(),
    access: { planId: BASIC.id, planName: "Basic", limits: BASIC.limits, modules: BASIC.modules, pausedUserIds: [], viewOnlyProjectIds: [], offlineLandingPageIds: [] },
  };
  vi.spyOn(console, "error").mockImplementation((...args) => {
    errors.push(args);
  });
  window.localStorage.clear();
  vi.resetModules();
});
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function load(flag: "true" | "false") {
  vi.stubEnv("NEXT_PUBLIC_BILLING_V2", flag);
  const shell = await import("@/components/billing/shell-integration");
  const locked = await import("@/components/billing/locked");
  const overviewMod = await import("@/components/billing/overview");
  const plans = await import("@/components/billing/plans");
  const checkout = await import("@/components/billing/checkout");
  const index = await import("@/lib/billing");
  // Same fresh module graph as the components (vi.resetModules), so the toast context matches.
  const { ToastProvider } = await import("@/components/ui/toast");
  return { ...shell, ...locked, ...overviewMod, ...plans, ...checkout, ...index, ToastProvider };
}

/* ------------------------------------------------------------------- tests */

describe("billing v2 flag", () => {
  it("off: the shell wrapper renders the page untouched and calls nothing", async () => {
    const { BillingV2Root, ProjectAccessBadge, TeamChatComposerGate, ToastProvider } = await load("false");
    render(
      <ToastProvider>
        <BillingV2Root canEdit>
          <p>page content</p>
          <ProjectAccessBadge projectId="p2" />
          <TeamChatComposerGate>
            <textarea aria-label="composer" />
          </TeamChatComposerGate>
        </BillingV2Root>
      </ToastProvider>,
    );
    await settle();
    expect(screen.getByText("page content")).toBeInTheDocument();
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByLabelText("composer")).toBeInTheDocument();
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("on: banners and locked states come from the real API", async () => {
    backend.overview = overview({ plan: GROWTH, paidPlan: GROWTH, status: "expired", dueDate: "2026-09-30", renewalAmount: 2360 });
    backend.access = { ...backend.access, modules: { ...BASIC.modules, teamChat: false } };
    const { BillingV2Root, TeamChatComposerGate, ToastProvider } = await load("true");
    render(
      <ToastProvider>
        <BillingV2Root canEdit>
          <TeamChatComposerGate>
            <textarea aria-label="composer" />
          </TeamChatComposerGate>
        </BillingV2Root>
      </ToastProvider>,
    );
    await settle();
    expect(apiFetch).toHaveBeenCalledWith("/org/billing/v2");
    expect(screen.getByText("Your Growth plan has expired")).toBeInTheDocument();
    // Manual mode: Pay now is shown but disabled with an explanation.
    expect(screen.getByRole("button", { name: /Pay now/ })).toBeDisabled();
    expect(screen.queryByLabelText("composer")).toBeNull();
    expect(screen.getByText(/Team chat isn't included in Basic/)).toBeInTheDocument();
    expect(errors).toEqual([]);
  });

  it("on: Settings → Billing shows real plan data without a sample tag; still-mock invoices keep theirs", async () => {
    const { BillingV2Root, BillingOverviewPanel, ToastProvider } = await load("true");
    render(
      <ToastProvider>
        <BillingV2Root canEdit>
          <BillingOverviewPanel />
        </BillingV2Root>
      </ToastProvider>,
    );
    await settle();
    expect(screen.getByText("Current plan")).toBeInTheDocument();
    expect(screen.getByText("3 · unlimited")).toBeInTheDocument();
    expect(screen.getAllByText("Sample data")).toHaveLength(1); // the Invoices section only
    expect(screen.queryByText(/Update payment method/)).toBeNull();
    expect(errors).toEqual([]);
  });

  it("on, manual mode: plans say Request upgrade and checkout explains approval", async () => {
    const { BillingV2Root, PlansScreen, CheckoutScreen, ToastProvider } = await load("true");
    const plans = render(
      <ToastProvider>
        <BillingV2Root canEdit>
          <PlansScreen />
        </BillingV2Root>
      </ToastProvider>,
    );
    await settle();
    expect(screen.getByRole("link", { name: /Request upgrade/ })).toHaveAttribute("href", expect.stringContaining("plan=uuid-growth"));
    plans.unmount();

    render(
      <ToastProvider>
        <BillingV2Root canEdit>
          <CheckoutScreen planId="uuid-growth" interval="monthly" />
        </BillingV2Root>
      </ToastProvider>,
    );
    await settle();
    expect(screen.getByText("Request an upgrade to Growth")).toBeInTheDocument();
    expect(screen.getByText(/approved by our team/)).toBeInTheDocument();
    expect(screen.getByText("₹2,360")).toBeInTheDocument();
    // Coupons arrive later: the field is hidden while the API says so.
    expect(screen.queryByLabelText("Coupon code")).toBeNull();
    expect(screen.getByRole("button", { name: /Send upgrade request/ })).toBeEnabled();
    expect(errors).toEqual([]);
  });

  it("on, manual mode: sending the request saves billing details, then the upgrade shows as pending", async () => {
    const { BillingV2Root, CheckoutScreen, PlansScreen, ToastProvider } = await load("true");
    const view = render(
      <ToastProvider>
        <BillingV2Root canEdit>
          <CheckoutScreen planId="uuid-growth" interval="monthly" />
        </BillingV2Root>
      </ToastProvider>,
    );
    await settle();
    const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
    type("Legal name", "Acme Realty Pvt Ltd");
    type("Address", "12 MG Road");
    type("City", "Bengaluru");
    type("State", "29");
    type("PIN code", "560001");
    type("GSTIN", "29AABCA1234F1Z5");
    await settle();
    fireEvent.click(screen.getByRole("button", { name: /Send upgrade request/ }));
    await settle();

    const put = apiFetch.mock.calls.find(([p, i]) => p === "/org/billing/profile" && i?.method === "PUT");
    expect(JSON.parse(String(put![1]!.body))).toMatchObject({ legalName: "Acme Realty Pvt Ltd", addressLine1: "12 MG Road", state: "29", country: "IN", gstin: "29AABCA1234F1Z5" });
    const start = apiFetch.mock.calls.find(([p, i]) => p === "/org/billing/checkout" && i?.method === "POST");
    expect(JSON.parse(String(start![1]!.body))).toMatchObject({ planId: "uuid-growth", interval: "monthly", purpose: "purchase" });
    expect(screen.getByText("Request sent")).toBeInTheDocument();
    expect(push).toHaveBeenCalledWith("/org/settings?section=billing");
    view.unmount();

    // Back on Plans: the requested plan can't be requested twice.
    render(
      <ToastProvider>
        <BillingV2Root canEdit>
          <PlansScreen />
        </BillingV2Root>
      </ToastProvider>,
    );
    await settle();
    expect(screen.getByRole("button", { name: /Request pending/ })).toBeDisabled();
    expect(errors).toEqual([]);
  });

  it("on: a pending request disables the checkout button", async () => {
    backend.overview = overview({
      billingProfile: { legalName: "Acme", addressLine1: "1 Road", addressLine2: null, city: "Mysuru", state: "29", pincode: "570001", country: "IN", gstin: null },
      pendingUpgrade: { status: "pending_approval", requestId: "pcr_1", checkoutId: "chk_1", toPlan: { id: GROWTH.id, name: "Growth" }, interval: "monthly", createdAt: "2026-10-14T10:00:00.000Z" },
    });
    const { BillingV2Root, CheckoutScreen, ToastProvider } = await load("true");
    render(
      <ToastProvider>
        <BillingV2Root canEdit>
          <CheckoutScreen planId="uuid-growth" interval="monthly" />
        </BillingV2Root>
      </ToastProvider>,
    );
    await settle();
    expect(screen.getByText("Upgrade to Growth requested")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Request pending/ })).toBeDisabled();
    expect(screen.getByText(/1 Road, Mysuru, Karnataka 570001/)).toBeInTheDocument();
    expect(errors).toEqual([]);
  });

  it("the hybrid client marks exactly the step-1 and step-2 functions as real", async () => {
    const { billingClient, REAL_FUNCTIONS } = await load("true");
    expect(billingClient.isMock).toBe(false);
    expect(Object.entries(REAL_FUNCTIONS).filter(([, v]) => v).map(([k]) => k).sort()).toEqual(
      [
        // step 1
        "getAccessStatus",
        "getBillingOverview",
        "getLifecycleSettings",
        "listAdminPlans",
        "listPlans",
        "saveAdminPlan",
        "saveLifecycleSettings",
        // step 2
        "getBillingProfile",
        "saveBillingProfile",
        "previewCheckout",
        "startCheckout",
        "confirmCheckout",
        "listAdminCheckouts",
      ].sort(),
    );
    expect(billingClient.isReal("listInvoices")).toBe(false);
    // A still-mock function that can't handle a real plan id says so plainly.
    await expect(billingClient.getRetentionChoices({ targetPlanId: "uuid-growth" })).rejects.toThrow("This isn't available yet.");
  });
});
