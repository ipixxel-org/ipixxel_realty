/**
 * Billing v2 "choose what stays" in the app: a view-only project hides every
 * edit action (leads keep working), the lists show one shared lock badge and
 * a filter, plan_locked errors read as a friendly message, and Pay now
 * amounts are the package price + GST.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui/toast";
import { BillingEnvProvider } from "@/components/billing/context";
import { BillingAccessProvider } from "@/components/billing/locked";
import { BillingBanner } from "@/components/billing/banners";
import { packagePriceText } from "@/lib/billing/pricing";
import { planLockMessage, PLAN_LOCK_COPY } from "@/lib/plan-lock";
import { createMockBillingClient } from "../mock/client";
import type { BillingOverview } from "../types";

class NoopIntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
  root = null;
  rootMargin = "";
  thresholds = [];
}
vi.stubGlobal("IntersectionObserver", NoopIntersectionObserver);

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "p1" }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/org/projects/p1",
}));
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ accessToken: "t", user: { org_id: "org-1" }, hasPermission: () => true, isOrgAdmin: () => true, isLoading: false }),
}));

const project = () => ({
  id: "p1",
  name: "Green Acres",
  status: "active",
  location: "Pune",
  reraId: null,
  manager: null,
  currency: "INR",
  areaUnit: "sqft",
  possession: null,
  projectType: "Apartment",
  projectTypeId: null,
  projectFieldTemplate: [],
  unitFieldTemplate: [{ key: "price", label: "Price", type: "number", required: false, role: "price" }],
  customFields: {},
  unitTypes: [],
  configurations: [],
  connectivity: [],
  amenities: [],
  galleryUrls: [],
  priceIncludes: [],
  marketing: null,
  specifications: null,
  rollup: { totalUnitsPlanned: 0, unitsCreated: 1, unitsAvailable: 1, unitsBooked: 0, unitsHeld: 0, unitsSold: 0 },
});
const unit = (id: string, projectRef: { id: string; name: string } | null) => ({
  id,
  unitNo: `U-${id}`,
  orgId: "org-1",
  projectId: projectRef?.id ?? null,
  project: projectRef ? { ...projectRef, currency: "INR", areaUnit: "sqft", unitFieldTemplate: [] } : null,
  status: "available",
  configuration: null,
  variantLabel: null,
  area: null,
  areaUnit: "sqft",
  tower: null,
  floor: null,
  facing: null,
  parking: null,
  price: null,
  pricePerArea: null,
  customFields: {},
  galleryUrls: [],
  floorPlanUrl: null,
  createdBy: null,
  updatedBy: null,
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
});
const listRow = (id: string, name: string) => ({ ...project(), id, name, unitTypeCount: 0, unitCount: 0, landingPageCount: 0, updatedAt: "2026-10-01" });
const page = (id: string, name: string) => ({
  id,
  name,
  slug: name.toLowerCase(),
  status: "unpublished",
  pageType: "landing",
  sourceTemplate: null,
  thumbnail: null,
  views: 0,
  leads: 0,
  assignedDomain: null,
  thankYouPage: null,
  updatedAt: "2026-10-01",
  createdAt: "2026-10-01",
});
const user = (id: string, firstName: string) => ({
  id,
  firstName,
  lastName: "",
  email: `${firstName.toLowerCase()}@acme.test`,
  phoneNumber: null,
  role: { key: "sales", name: "Sales" },
  status: "active",
  approvedAt: "2026-01-01",
  createdAt: "2026-01-01",
  mustChangePassword: false,
  hasTeam: false,
});

const api = vi.hoisted(() => ({ calls: [] as string[] }));
vi.mock("@/lib/api", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/api")>();
  const route = async (path: string) => {
    api.calls.push(path);
    if (path === "/org/projects/p1") return project();
    if (path === "/org/projects/p1/units") return [unit("u1", { id: "p1", name: "Green Acres" })];
    if (path.startsWith("/org/projects?")) return { data: [listRow("p1", "Green Acres"), listRow("p2", "Blue Bay")], total: 2, page: 1, limit: 10 };
    if (path.startsWith("/org/landing-pages?")) return { data: [page("lp1", "Offline Page"), page("lp2", "Draft Page")], total: 2, page: 1, limit: 10 };
    if (path === "/org/users/roles") return [];
    if (path.startsWith("/org/users?")) return { data: [user("u1", "Asha"), user("u2", "Ravi")], total: 2, page: 1, limit: 20 };
    if (path === "/org/billing") return { plan: { name: "Basic" }, usage: { usersUsed: 1, usersLimit: 2, projectsUsed: 1, projectsLimit: 1, landingPagesUsed: 0, landingPagesLimit: 1 } };
    if (path.startsWith("/org/templates")) return { data: [] };
    return {};
  };
  return {
    ...orig,
    apiFetch: vi.fn(route),
    getOrgUnits: vi.fn(async (p?: Record<string, unknown>) => {
      api.calls.push(`getOrgUnits:${JSON.stringify(p ?? {})}`);
      return { data: [unit("u1", { id: "p1", name: "Green Acres" }), unit("u2", { id: "p2", name: "Blue Bay" })], total: 2, page: 1, limit: 10, counts: {} };
    }),
    getCrmLeads: vi.fn(async () => ({ data: [], total: 0, page: 1, limit: 1 })),
    getProjectLandingPages: vi.fn(async () => []),
    getProjectSalesAgents: vi.fn(async () => []),
    getOrgCatalogOptions: vi.fn(async () => []),
    getOrgProjectTypes: vi.fn(async () => []),
    getOrgDomainInfo: vi.fn(async () => null),
  };
});

beforeEach(() => {
  api.calls = [];
});
afterEach(cleanup);

/** Render inside billing v2 with p1 view-only, lp1 offline and u2 paused. */
async function withLocks(node: ReactNode) {
  const client = createMockBillingClient();
  const base = await client.getAccessStatus();
  client.getAccessStatus = async () => ({ ...base, viewOnlyProjectIds: ["p1"], offlineLandingPageIds: ["lp1"], pausedUserIds: ["u2"] });
  return render(
    <ToastProvider>
      <BillingEnvProvider client={client}>
        <BillingAccessProvider>{node}</BillingAccessProvider>
      </BillingEnvProvider>
    </ToastProvider>,
  );
}

const lockBadges = (kind: string) => document.querySelectorAll(`[data-plan-lock="${kind}"]`);

describe("a view-only project's pages", () => {
  it("overview: View only in the header, no Edit, Direct Lead Entry still works", async () => {
    const { default: ProjectPage } = await import("@/app/org/projects/[id]/page");
    await withLocks(<ProjectPage />);
    const heading = await screen.findByRole("heading", { level: 1 });
    await waitFor(() => expect(within(heading).getByText("View only")).toBeInTheDocument());
    expect(within(heading).getByText("View only").closest("[title]")).toHaveAttribute("title", PLAN_LOCK_COPY.project_view_only.tooltip);
    expect(screen.queryByRole("link", { name: /Edit/ })).toBeNull();
    expect(screen.getByText(PLAN_LOCK_COPY.project_view_only.error)).toBeInTheDocument();
    // Leads keep working.
    expect(screen.getByRole("button", { name: /Submit & Create Lead/ })).toBeEnabled();
  });

  it("units: no add, edit or delete, and the status can't be changed (book / hold)", async () => {
    const { default: UnitsPage } = await import("@/app/org/projects/[id]/units/page");
    await withLocks(<UnitsPage />);
    await screen.findAllByText("U-u1");
    await waitFor(() => expect(screen.queryByRole("button", { name: /Add unit/ })).toBeNull());
    expect(screen.queryByRole("button", { name: /Add configuration/ })).toBeNull();
    const status = screen.getAllByRole("combobox").find((el) => (el as HTMLSelectElement).value === "available")!;
    expect(status).toBeDisabled();
  });

  it("is refused by the API with one code, shown as a friendly message", () => {
    expect(planLockMessage({ statusCode: 403, code: "plan_locked", lock: "project_view_only", message: "raw" })).toBe(PLAN_LOCK_COPY.project_view_only.error);
    expect(planLockMessage({ code: "plan_locked", lock: "user_paused" })).toBe(PLAN_LOCK_COPY.user_paused.error);
    expect(planLockMessage({ code: "something_else" })).toBeNull();
  });
});

describe("lists: one shared lock badge and a filter", () => {
  it("projects: View only on the locked project only, and a View only filter", async () => {
    const { default: ProjectsPage } = await import("@/app/org/projects/page");
    await withLocks(<ProjectsPage />);
    await screen.findByText("Blue Bay");
    await waitFor(() => expect(lockBadges("project_view_only")).toHaveLength(1));
    const filter = screen.getAllByRole("combobox").find((el) => within(el).queryByRole("option", { name: "View only" }))!;
    fireEvent.change(filter, { target: { value: "3" } });
    await waitFor(() => expect(api.calls.some((c) => c.startsWith("/org/projects?") && c.includes("viewOnly=true"))).toBe(true));
  });

  it("units: View only on units of the locked project, and a View only filter", async () => {
    const { default: AllUnitsPage } = await import("@/app/org/projects/all-units/page");
    await withLocks(<AllUnitsPage />);
    await screen.findByText("U-u2");
    await waitFor(() => expect(lockBadges("project_view_only")).toHaveLength(1));
    const filter = screen.getAllByRole("combobox").find((el) => within(el).queryByRole("option", { name: "View only" }))!;
    fireEvent.change(filter, { target: { value: "__view_only__" } });
    await waitFor(() => expect(api.calls.some((c) => c.startsWith("getOrgUnits:") && c.includes('"viewOnly":true'))).toBe(true));
  });

  it("landing pages: Offline on the locked page, Publish disabled with the reason, and an Offline filter", async () => {
    const { default: LandingPagesPage } = await import("@/app/org/landing-pages/page");
    await withLocks(<LandingPagesPage />);
    await screen.findAllByText("Offline Page");
    await waitFor(() => expect(lockBadges("landing_page_offline").length).toBeGreaterThan(0));
    // Table view: the offline page's Publish is disabled with the reason; the other's isn't.
    fireEvent.click(screen.getByTitle(/table/i));
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Publish" })).toHaveLength(2));
    const [offline, other] = screen.getAllByRole("button", { name: "Publish" });
    expect(offline).toBeDisabled();
    expect(offline).toHaveAttribute("title", PLAN_LOCK_COPY.landing_page_offline.tooltip);
    expect(other).toBeEnabled();
    const filter = screen.getAllByRole("combobox").find((el) => within(el).queryByRole("option", { name: "Offline" }))!;
    fireEvent.change(filter, { target: { value: "4" } });
    await waitFor(() => expect(api.calls.some((c) => c.startsWith("/org/landing-pages?") && c.includes("offline=true"))).toBe(true));
  }, 30_000);

  it("users: Paused (not Active) on the paused user, no Activate, and a Paused filter", async () => {
    const { default: UsersPage } = await import("@/app/org/users/page");
    await withLocks(<UsersPage />);
    await screen.findByText("Ravi");
    await waitFor(() => expect(lockBadges("user_paused")).toHaveLength(1));
    const ravi = screen.getByText("Ravi").closest("tr")!;
    expect(within(ravi).getByText("Paused")).toBeInTheDocument();
    expect(within(ravi).queryByText("Active")).toBeNull();
    fireEvent.click(within(ravi).getByTitle("More options"));
    expect(within(ravi).queryByText("Activate user")).toBeNull();
    expect(within(ravi).getByText("Change what stays")).toBeInTheDocument();
    const filter = screen.getAllByRole("combobox").find((el) => within(el).queryByRole("option", { name: "Paused" }))!;
    fireEvent.change(filter, { target: { value: "paused" } });
    await waitFor(() => expect(api.calls.some((c) => c.startsWith("/org/users?") && c.includes("paused=true") && !c.includes("status="))).toBe(true));
  }, 30_000);

  it("the badge words come from one place", () => {
    expect(PLAN_LOCK_COPY.project_view_only.badge).toBe("View only");
    expect(PLAN_LOCK_COPY.landing_page_offline.badge).toBe("Offline");
    expect(PLAN_LOCK_COPY.user_paused.badge).toBe("Paused");
  });
});

describe("price display", () => {
  it("is the package amount + GST, or just the amount where GST doesn't apply", () => {
    expect(packagePriceText(1499)).toBe("₹1,499 + GST");
    expect(packagePriceText(1349.1)).toBe("₹1,349.10 + GST");
    expect(packagePriceText(1499, { gst: false })).toBe("₹1,499");
  });

  it("banners and Pay now never show a bare GST-inclusive total", async () => {
    const client = createMockBillingClient();
    const o = await client.getBillingOverview();
    const growth = (await client.listPlans()).find((p) => !p.isFree)!;
    const due: BillingOverview = {
      ...o,
      plan: growth,
      paidPlan: growth,
      interval: "monthly",
      status: "past_due",
      renewalMode: "manual",
      dueDate: "2026-10-13",
      graceEndsAt: "2026-10-20",
      graceDay: 3,
      graceDays: 7,
      graceDaysLeft: 4,
      renewalAmount: 1768.82,
      renewalBreakdown: { planName: growth.name, interval: "monthly", price: 1499, couponCode: null, couponDiscount: 0, taxable: 1499, gst: 269.82, total: 1768.82 },
    };
    render(
      <ToastProvider>
        <BillingEnvProvider client={client}>
          <BillingBanner overview={due} />
        </BillingEnvProvider>
      </ToastProvider>,
    );
    expect(screen.getByRole("button", { name: "Pay now · ₹1,499 + GST" })).toBeInTheDocument();
    expect(document.body.textContent).toContain(`Your ${growth.name} renewal (₹1,499 + GST) was due on`);
    expect(screen.queryByText(/1,768\.82/)).toBeNull();
  });

  it("moved to Basic: Buy again shows the package price + GST", async () => {
    const client = createMockBillingClient();
    const o = await client.getBillingOverview();
    const growth = (await client.listPlans()).find((p) => !p.isFree)!;
    render(
      <ToastProvider>
        <BillingEnvProvider client={client}>
          <BillingBanner overview={{ ...o, status: "moved_to_basic", paidPlan: growth, interval: "monthly", movedToBasicAt: "2026-10-14", locked: { users: 1, projects: 1, landingPages: 0 } }} />
        </BillingEnvProvider>
      </ToastProvider>,
    );
    expect(screen.getByText(`Buy ${growth.name} again · ${packagePriceText(growth.priceMonthly)}`)).toBeInTheDocument();
  });
});
