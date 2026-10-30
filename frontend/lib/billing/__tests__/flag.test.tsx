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
  billingProfile: { legalName: "Acme Realty Pvt Ltd", addressLine1: "1 Road", addressLine2: null, city: "Mysuru", state: "29", pincode: "570001", country: "IN", gstin: null },
  billingDetailsMissing: [],
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
  downgradeInterval: null,
  downgradeAt: null,
  renewalAmount: null,
  renewalBreakdown: null,
  usage: [
    { key: "users", label: "Users", used: 1, limit: 1 },
    { key: "projects", label: "Projects", used: 3, limit: null },
    { key: "landingPages", label: "Landing pages", used: 1, limit: 1 },
    { key: "templates", label: "Templates", used: 0, limit: null },
  ],
  locked: { users: 0, projects: 0, landingPages: 0 },
  retention: null,
  pendingUpgrade: null,
  rejectedUpgrade: null,
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
  if (path.startsWith("/org/billing/v2/invoices") || path.startsWith("/org/billing/v2/payments")) {
    return { data: [], total: 0, page: 1, pageSize: 5 };
  }
  if (path.startsWith("/org/billing/retention")) {
    const item = (id: string, name: string, selected: boolean, locked = false) => ({ id, name, detail: "", reason: "", defaultPicked: selected, selected, locked });
    return {
      targetPlan: BASIC,
      appliesOn: "2026-11-10",
      isDefault: true,
      users: [item("u1", "Asha Rao", true, true), item("u2", "Ravi", false), item("u3", "Meena", false)],
      projects: [item("p1", "Tower A", true)],
      landingPages: [item("lp1", "Launch", true)],
    };
  }
  if (path === "/org/billing/cancel" && init?.method === "POST") {
    backend.overview = { ...backend.overview, status: "cancellation_scheduled", cancelAt: backend.overview.periodEnd, renewalAmount: null };
    return backend.overview;
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
  const planChanges = await import("@/components/billing/plan-changes");
  const index = await import("@/lib/billing");
  // Same fresh module graph as the components (vi.resetModules), so the toast context matches.
  const { ToastProvider } = await import("@/components/ui/toast");
  return { ...shell, ...locked, ...overviewMod, ...plans, ...checkout, ...planChanges, ...index, ToastProvider };
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
    expect(apiFetch).toHaveBeenCalledWith("/org/billing/v2", { cache: "no-store" });
    expect(screen.getByText("Your Growth plan has expired")).toBeInTheDocument();
    // Manual mode: the renewal is a request (Request renewal → the Plans page, then the renewal request).
    expect(screen.getByRole("link", { name: /Request renewal/ })).toHaveAttribute("href", "/org/settings/billing/plans");
    expect(screen.queryByLabelText("composer")).toBeNull();
    expect(screen.getByText(/Team chat isn't included in Basic/)).toBeInTheDocument();
    expect(errors).toEqual([]);
  });

  it("on: Settings → Billing is all real data — no sample tags, invoices from the API", async () => {
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
    expect(screen.queryByText("Sample data")).toBeNull();
    expect(apiFetch.mock.calls.some(([p]) => String(p).startsWith("/org/billing/v2/invoices"))).toBe(true);
    expect(screen.queryByText(/Update payment method/)).toBeNull();
    expect(errors).toEqual([]);
  });

  it("on, manual mode: plans say Change plan and checkout explains approval", async () => {
    const { BillingV2Root, PlansScreen, CheckoutScreen, ToastProvider } = await load("true");
    const plans = render(
      <ToastProvider>
        <BillingV2Root canEdit>
          <PlansScreen />
        </BillingV2Root>
      </ToastProvider>,
    );
    await settle();
    expect(screen.getByRole("link", { name: /Change plan/ })).toHaveAttribute("href", expect.stringContaining("plan=uuid-growth"));
    plans.unmount();

    render(
      <ToastProvider>
        <BillingV2Root canEdit>
          <CheckoutScreen planId="uuid-growth" interval="monthly" />
        </BillingV2Root>
      </ToastProvider>,
    );
    await settle();
    expect(screen.getByText("Request a change to Growth")).toBeInTheDocument();
    expect(screen.getByText(/approved by our team/)).toBeInTheDocument();
    expect(screen.getByText("₹2,360")).toBeInTheDocument();
    // Coupons arrive later: the field is hidden while the API says so.
    expect(screen.queryByLabelText("Coupon code")).toBeNull();
    expect(screen.getByRole("button", { name: /Send change request/ })).toBeEnabled();
    expect(errors).toEqual([]);
  });

  it("on, manual mode: billing details are a read-only summary of General settings; sending the request, then the upgrade shows as pending", async () => {
    const { BillingV2Root, CheckoutScreen, PlansScreen, ToastProvider } = await load("true");
    const view = render(
      <ToastProvider>
        <BillingV2Root canEdit>
          <CheckoutScreen planId="uuid-growth" interval="monthly" />
        </BillingV2Root>
      </ToastProvider>,
    );
    await settle();
    const summary = screen.getByTestId("billing-details-summary");
    expect(summary).toHaveTextContent("Acme Realty Pvt Ltd");
    expect(summary).toHaveTextContent("Karnataka");
    expect(summary.querySelector("input, select, textarea")).toBeNull();
    expect(screen.queryByRole("button", { name: /Use saved details/ })).toBeNull();
    expect(screen.getByRole("link", { name: "Edit in General settings" })).toHaveAttribute("href", "/org/settings?section=general");
    fireEvent.click(screen.getByRole("button", { name: /Send change request/ }));
    await settle();

    expect(apiFetch.mock.calls.some(([p]) => p === "/org/billing/profile")).toBe(false);
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
    expect(screen.getByText("Change to Growth requested")).toBeInTheDocument();
    // Keeps its label, but disabled, with the reason on hover.
    const send = screen.getByRole("button", { name: /Send change request/ });
    expect(send).toBeDisabled();
    expect(send.parentElement!.getAttribute("title")).toMatch(/^You already have a pending request/);
    expect(screen.getByTestId("billing-details-summary")).toHaveTextContent(/1 Road.*Mysuru.*Karnataka.*570001/);
    expect(errors).toEqual([]);
  });

  it("on, online mode: Pay now is live and opens the Plans page (no payment started)", async () => {
    backend.overview = overview({
      billingProfile: { legalName: "", addressLine1: "", addressLine2: null, city: "", state: "", pincode: "", country: "IN", gstin: null },
      billingDetailsMissing: ["legalName", "addressLine1", "city", "state", "pincode"],
      plan: GROWTH,
      paidPlan: GROWTH,
      status: "renewal_due",
      periodEnd: "2026-10-16",
      renewalAmount: 2360,
      paymentMode: "online",
      paymentModeReason: null,
    });
    const { BillingV2Root, BillingOverviewPanel, ToastProvider } = await load("true");
    render(
      <ToastProvider>
        <BillingV2Root canEdit>
          <BillingOverviewPanel showInvoices={false} />
        </BillingV2Root>
      </ToastProvider>,
    );
    await settle();
    // The package price + GST (never the GST-inclusive ₹2,360).
    const pay = screen.getAllByRole("link", { name: "Pay now · ₹2,000 + GST" })[0];
    expect(pay).toHaveAttribute("href", "/org/settings/billing/plans");
    fireEvent.click(pay);
    await settle();
    expect(apiFetch.mock.calls.some(([p]) => p === "/org/billing/checkout")).toBe(false);
  });

  it("renewal checkout: previews with purpose renewal and pays the full term; manual mode sends a renewal request", async () => {
    const renewing = overview({
      plan: GROWTH,
      paidPlan: GROWTH,
      status: "past_due",
      periodEnd: "2026-10-10",
      dueDate: "2026-10-10",
      graceEndsAt: "2026-10-17",
      graceDay: 5,
      graceDaysLeft: 3,
      renewalAmount: 2360,
      paymentMode: "online",
      paymentModeReason: null,
    });
    backend.overview = renewing;
    const { BillingV2Root, CheckoutScreen, ToastProvider } = await load("true");
    const view = render(
      <ToastProvider>
        <BillingV2Root canEdit>
          <CheckoutScreen planId="uuid-growth" interval="monthly" renewal />
        </BillingV2Root>
      </ToastProvider>,
    );
    await settle();
    const previewCall = apiFetch.mock.calls.find(([p]) => p === "/org/billing/checkout/preview");
    expect(JSON.parse(String(previewCall![1]!.body))).toMatchObject({ planId: "uuid-growth", interval: "monthly", purpose: "renewal" });
    expect(screen.getByText("Renew Growth")).toBeInTheDocument();
    expect(screen.queryByText(/You're already on/)).toBeNull();
    expect(screen.getByRole("button", { name: /Pay ₹2,360/ })).toBeEnabled();
    view.unmount();

    backend.overview = { ...renewing, paymentMode: "manual", paymentModeReason: "switched_off" };
    render(
      <ToastProvider>
        <BillingV2Root canEdit>
          <CheckoutScreen planId="uuid-growth" interval="monthly" renewal />
        </BillingV2Root>
      </ToastProvider>,
    );
    await settle();
    expect(screen.getByText("Request renewal of Growth")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Send renewal request/ })).toBeEnabled();
    expect(screen.getByText(/Send a renewal request and our team will confirm how to pay/)).toBeInTheDocument();
    expect(errors).toEqual([]);
  });

  it("choosing Basic: sends the reason and shows the scheduled change", async () => {
    backend.overview = overview({ plan: GROWTH, paidPlan: GROWTH, status: "active", periodEnd: "2026-11-10", renewalAmount: 2360 });
    const { BillingV2Root, DowngradeScreen, ToastProvider } = await load("true");
    render(
      <ToastProvider>
        <BillingV2Root canEdit>
          <DowngradeScreen planId={BASIC.id} />
        </BillingV2Root>
      </ToastProvider>,
    );
    await settle();
    fireEvent.change(screen.getByLabelText("Why are you moving to Basic? (optional)"), { target: { value: "Too expensive" } });
    fireEvent.click(screen.getByRole("button", { name: /Move to Basic/ }));
    await settle();
    expect(screen.getByText("Move to Basic on 10 Nov 2026?")).toBeInTheDocument();
    expect(screen.getByText("You keep Growth until then.")).toBeInTheDocument();
    const buttons = screen.getAllByRole("button", { name: /Move to Basic/ });
    fireEvent.click(buttons[buttons.length - 1]);
    await settle();
    const call = apiFetch.mock.calls.find(([p, i]) => p === "/org/billing/cancel" && i?.method === "POST");
    expect(JSON.parse(String(call![1]!.body))).toEqual({ reason: "Too expensive" });
    // The toast, and the banner on the refreshed overview.
    expect(screen.getAllByText("Change to Basic scheduled for 10 Nov 2026").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByRole("button", { name: "Keep Growth" }).length).toBeGreaterThan(0);
    expect(push).toHaveBeenCalledWith("/org/settings?section=billing");
    expect(errors).toEqual([]);
  });

  it("downgrade over the smaller plan's limits: shows what stays; the button waits until an option is picked", async () => {
    backend.overview = overview({
      plan: GROWTH,
      paidPlan: GROWTH,
      status: "active",
      periodEnd: "2026-11-10",
      usage: [
        { key: "users", label: "Users", used: 3, limit: 5 },
        { key: "projects", label: "Projects", used: 1, limit: null },
        { key: "landingPages", label: "Landing pages", used: 1, limit: 1 },
        { key: "templates", label: "Templates", used: 0, limit: null },
      ],
    });
    const { BillingV2Root, DowngradeScreen, ToastProvider } = await load("true");
    render(
      <ToastProvider>
        <BillingV2Root canEdit>
          <DowngradeScreen planId="uuid-basic" />
        </BillingV2Root>
      </ToastProvider>,
    );
    await settle();
    expect(screen.getByText(/You have 3 users; Basic allows 1/)).toBeInTheDocument();
    expect(screen.getByText(/the extra ones are paused, not deleted/)).toBeInTheDocument();
    expect(apiFetch).toHaveBeenCalledWith("/org/billing/retention?targetPlanId=uuid-basic", { cache: "no-store" });
    expect(screen.getByText(/Asha Rao/)).toBeInTheDocument(); // the default pick that stays
    // Disabled until one of the two options is picked.
    expect(screen.getByRole("button", { name: /Move to Basic/ })).toBeDisabled();
    // "I'll choose" with nothing saved yet: the Choose what stays button, still disabled.
    fireEvent.click(screen.getByRole("radio", { name: "I'll choose what stays" }));
    expect(screen.getByRole("link", { name: "Choose what stays" })).toHaveAttribute(
      "href",
      "/org/settings/billing/choose-what-stays?target=uuid-basic&back=downgrade&interval=monthly",
    );
    expect(screen.getByRole("button", { name: /Move to Basic/ })).toBeDisabled();
    fireEvent.click(screen.getByRole("radio", { name: "Keep the default picks" }));
    expect(screen.getByRole("button", { name: /Move to Basic/ })).toBeEnabled();
    expect(errors).toEqual([]);
  });

  it("the hybrid client: every function is real except updatePaymentMethod", async () => {
    const { billingClient, REAL_FUNCTIONS, BillingError } = await load("true");
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
        "previewCheckout",
        "startCheckout",
        "confirmCheckout",
        "listAdminCheckouts",
        // online step 4: close a payment under review by hand
        "resolveAdminCheckout",
        // step 4
        "cancelPlan",
        "undoCancel",
        "scheduleDowngrade",
        "undoDowngrade",
        // step 5
        "listCoupons",
        "getCoupon",
        "saveCoupon",
        "listOrgOptions",
        // step 6
        "getRetentionChoices",
        "saveRetentionChoices",
        // step 7
        "listInvoices",
        "listPayments",
        "listSubscriptions",
        "getSubscription",
        "extendGrace",
        "markPaidOffline",
        "applyCoupon",
        "cancelSubscription",
        "listAdminPayments",
        "refundPayment",
        // fixes after testing
        "listOrgCoupons",
        // manual mode: requests list and withdraw
        "listOrgRequests",
        "withdrawRequest",
        // choose what stays rules: Super Admin any time
        "getAdminRetentionChoices",
        "saveAdminRetentionChoices",
        "getCompanyDetails",
        "saveCompanyDetails",
        "runLifecycleCheck",
      ].sort(),
    );
    // Only the saved-payment-method flow stays unimplemented (renewals are "pay each time").
    expect(billingClient.isReal("updatePaymentMethod")).toBe(false);
    expect(BillingError).toBeDefined();
  });
});

describe("billing details come from General settings", () => {
  const incomplete = () =>
    overview({
      billingProfile: { legalName: "", addressLine1: "12 MG Road", addressLine2: null, city: "Bengaluru", state: "", pincode: "", country: "IN", gstin: null },
      billingDetailsMissing: ["legalName", "state", "pincode"],
    });

  it("Settings → Billing shows a read-only summary with a link to General settings", async () => {
    const { BillingV2Root, BillingDetailsCard, ToastProvider } = await load("true");
    render(
      <ToastProvider>
        <BillingV2Root canEdit>
          <BillingDetailsCard overview={backend.overview} />
        </BillingV2Root>
      </ToastProvider>,
    );
    await settle();
    const summary = screen.getByTestId("billing-details-summary");
    for (const text of ["Acme Realty Pvt Ltd", "1 Road", "Mysuru", "Karnataka", "570001"]) expect(summary).toHaveTextContent(text);
    expect(summary.querySelector("input, select, textarea")).toBeNull();
    expect(screen.getByRole("link", { name: "Edit in General settings" })).toHaveAttribute("href", "/org/settings?section=general");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("checkout is blocked while a required field is missing — with a link for those who can edit General settings", async () => {
    backend.overview = incomplete();
    const { BillingV2Root, CheckoutScreen, ToastProvider } = await load("true");
    render(
      <ToastProvider>
        <BillingV2Root canEdit canEditOrgProfile>
          <CheckoutScreen planId="uuid-growth" interval="monthly" />
        </BillingV2Root>
      </ToastProvider>,
    );
    await settle();
    expect(screen.getByText(/Complete your organisation details to continue\. Missing: organisation name, state, PIN code\./)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Complete organisation details" })).toHaveAttribute("href", "/org/settings?section=general");
    expect(screen.queryByText(/Ask your organisation admin/)).toBeNull();
    const send = screen.getByRole("button", { name: /Send change request/ });
    expect(send).toBeDisabled();
    fireEvent.click(send);
    await settle();
    expect(apiFetch.mock.calls.some(([p, i]) => p === "/org/billing/checkout" && i?.method === "POST")).toBe(false);
  });

  it("users who can't edit General settings are told to ask their admin", async () => {
    backend.overview = incomplete();
    const { BillingV2Root, CheckoutScreen, ToastProvider } = await load("true");
    render(
      <ToastProvider>
        <BillingV2Root canEdit canEditOrgProfile={false}>
          <CheckoutScreen planId="uuid-growth" interval="monthly" />
        </BillingV2Root>
      </ToastProvider>,
    );
    await settle();
    expect(screen.getByText(/Complete your organisation details to continue/)).toBeInTheDocument();
    expect(screen.getByText("Ask your organisation admin to complete these details.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Complete organisation details|Edit in General settings/ })).toBeNull();
    expect(screen.getByRole("button", { name: /Send change request/ })).toBeDisabled();
  });
});
