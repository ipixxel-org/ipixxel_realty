/**
 * Super Admin → Subscriptions: Package Requests open the org page (approve /
 * reject there, with a required rejection reason), and the tab + list filter
 * live in the URL so Back returns to them.
 */
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui/toast";
import type { BillingClient } from "@/lib/billing/client";
import type { PackageChangeRequestRow } from "@/lib/types";
import { createMockBillingClient } from "@/lib/billing/mock/client";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/admin-console/subscriptions",
  useSearchParams: () => new URLSearchParams(window.location.search),
  useParams: () => ({}),
}));

const auth = { user: { roleKeys: ["super_admin"] }, hasPermission: () => true, isLoading: false };
vi.mock("@/lib/auth-context", () => ({ useAuth: () => auth }));

const shared = vi.hoisted(() => ({ client: null as unknown as BillingClient }));
vi.mock("@/lib/billing/flag", () => ({ BILLING_V2: true }));
vi.mock("@/lib/billing", () => ({
  get billingClient() {
    return shared.client;
  },
}));

const plan = (id: string, name: string, priceMonthly: number) => ({ id, name, priceMonthly, priceYearly: priceMonthly * 10 });
const user = { id: "u1", firstName: "Vidya", lastName: "C", email: "vidya@example.com" };
const row = (over: Partial<PackageChangeRequestRow>): PackageChangeRequestRow =>
  ({
    id: "pcr_1",
    orgId: "org-1",
    currentPlanId: "basic",
    targetPlanId: "pro",
    billingCycle: "monthly",
    status: "pending",
    rejectionReason: null,
    reviewedAt: null,
    createdAt: "2026-10-20T10:00:00.000Z",
    updatedAt: "2026-10-20T10:00:00.000Z",
    organisation: { id: "org-1", name: "Prestige Test Org", slug: "prestige", city: "Bengaluru" },
    requestedBy: user,
    reviewedBy: null,
    currentPlan: plan("basic", "Basic", 0),
    targetPlan: plan("pro", "Pro", 999),
    billingCheckout: null,
    ...over,
  }) as unknown as PackageChangeRequestRow;

const api = vi.hoisted(() => ({
  rows: [] as unknown[],
  list: vi.fn(),
  approve: vi.fn(),
  reject: vi.fn(),
  apiFetch: vi.fn(),
}));
vi.mock("@/lib/api", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...real,
    apiFetch: api.apiFetch,
    getAdminPackageChangeRequests: api.list,
    approvePackageChangeRequest: api.approve,
    rejectPackageChangeRequest: api.reject,
    getPlanCapabilities: async () => [],
    getPlatformConfig: async () => ({}),
    updatePlatformConfig: async () => ({}),
  };
});

async function settle() {
  for (let i = 0; i < 8; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

beforeEach(() => {
  shared.client = createMockBillingClient();
  api.rows = [row({})];
  api.list.mockReset().mockImplementation(async () => ({ data: api.rows, total: api.rows.length, page: 1, limit: 20 }));
  api.approve.mockReset().mockResolvedValue({ success: true, message: "ok" });
  api.reject.mockReset().mockResolvedValue({ success: true, message: "ok" });
  api.apiFetch.mockReset().mockImplementation(async (path: string) => {
    if (path.startsWith("/admin/subscriptions?")) return { data: [], total: 0 };
    if (path === "/admin/plans") return [];
    return null;
  });
  window.history.replaceState(null, "", "/admin-console/subscriptions");
});
afterEach(cleanup);

/* ------------------------------------------------------- Subscriptions page */

describe("Subscriptions page: Package Requests", { timeout: 30_000 }, () => {
  async function renderPage(url: string) {
    window.history.replaceState(null, "", url);
    const { default: Page } = await import("@/app/admin-console/subscriptions/page");
    render(
      <ToastProvider>
        <Page />
      </ToastProvider>,
    );
    await settle();
  }

  it("reloading ?tab=package-requests&status=all opens that tab with that filter", async () => {
    await renderPage("/admin-console/subscriptions?tab=package-requests&status=all");
    expect(screen.getByRole("heading", { name: "Package Change Requests" })).toBeInTheDocument();
    expect(api.list).toHaveBeenLastCalledWith(expect.objectContaining({ status: undefined, page: 1 }));
    expect(screen.getByRole("button", { name: "All" })).toHaveStyle({ color: "#fff" });
  });

  it("rows have Open (to the org page's Package requests section) and no inline Approve / Reject", async () => {
    await renderPage("/admin-console/subscriptions?tab=package-requests&status=pending");
    const open = screen.getByRole("link", { name: "Open" });
    expect(open).toHaveAttribute("href", "/admin-console/subscriptions/org/org-1?from=package-requests&status=pending#package-requests");
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Reject" })).toBeNull();
    // Columns stay: organisation, requested by, plans, cycle, status.
    for (const text of ["Prestige Test Org", "Vidya C", "Basic", "Pro", "monthly", "pending"]) expect(screen.getAllByText(text).length).toBeGreaterThan(0);
  });

  it("the filter and tab changes are written to the URL; no ?tab= keeps today's default tab", async () => {
    await renderPage("/admin-console/subscriptions");
    expect(screen.queryByRole("heading", { name: "Package Change Requests" })).toBeNull();
    expect(window.location.search).toBe("");
    fireEvent.click(screen.getByRole("button", { name: /Package Requests/ }));
    await settle();
    expect(window.location.search).toBe("?tab=package-requests&status=pending");
    fireEvent.click(screen.getByRole("button", { name: "Rejected" }));
    await settle();
    expect(window.location.search).toBe("?tab=package-requests&status=rejected");
    fireEvent.click(screen.getByRole("button", { name: /Organisation Subscriptions/ }));
    await settle();
    expect(window.location.search).toContain("tab=org-subscriptions");
  });
});

/* --------------------------------------------------------------- Org page */

describe("org subscription page: Package requests section", () => {
  async function renderSection() {
    const { OrgPackageRequests } = await import("../package-requests");
    const onChanged = vi.fn();
    render(
      <ToastProvider>
        <OrgPackageRequests orgId="org-1" onChanged={onChanged} />
      </ToastProvider>,
    );
    await settle();
    return { onChanged };
  }

  it("lists the org's requests; Approve / Reject only on pending ones; decided ones show who, when and why", async () => {
    api.rows = [
      row({ id: "p_new", status: "pending", billingCheckout: { id: "c1", kind: "upgrade_same_interval", taxablePaise: 50000 } as never }),
      row({
        id: "p_old",
        status: "rejected",
        rejectionReason: "Please pay the pending invoice first.",
        reviewedAt: "2026-10-18T09:00:00.000Z",
        reviewedBy: { id: "a1", firstName: "Super", lastName: "Admin", email: "sa@example.com" },
      }),
    ];
    await renderSection();
    expect(api.list).toHaveBeenCalledWith({ orgId: "org-1", limit: 100 });
    const [pending, rejected] = screen.getAllByTestId("org-package-request");
    expect(within(pending).getByText("₹500 + GST · prorated")).toBeInTheDocument();
    expect(within(pending).getByRole("button", { name: "Approve" })).toBeInTheDocument();
    expect(within(pending).getByRole("button", { name: "Reject" })).toBeInTheDocument();
    expect(within(rejected).queryByRole("button")).toBeNull();
    expect(rejected).toHaveTextContent("Rejected by Super Admin on 18 Oct 2026");
    expect(rejected).toHaveTextContent("Reason: Please pay the pending invoice first.");
  });

  it("approve asks first, then uses the same approval call", async () => {
    const { onChanged } = await renderSection();
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    expect(screen.getByText('Approve "Change to Pro" for Prestige Test Org?')).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Approve" }));
    await settle();
    expect(api.approve).toHaveBeenCalledWith("pcr_1");
    expect(onChanged).toHaveBeenCalled();
  });

  it("reject needs a reason of at least 10 characters; it is sent trimmed", async () => {
    await renderSection();
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Reject Request" }));
    expect(within(dialog).getByText(/at least 10 characters\)/)).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText("Reason for rejection"), { target: { value: "too short" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Reject Request" }));
    expect(api.reject).not.toHaveBeenCalled();
    fireEvent.change(within(dialog).getByLabelText("Reason for rejection"), { target: { value: "  Pay the open invoice by NEFT first.  " } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Reject Request" }));
    await settle();
    expect(api.reject).toHaveBeenCalledWith("pcr_1", "Pay the open invoice by NEFT first.");
  });

  it("an API refusal is shown in the dialog", async () => {
    api.reject.mockRejectedValueOnce(new Error("Enter a reason for rejection (at least 10 characters)."));
    await renderSection();
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Reason for rejection"), { target: { value: "A long enough reason" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Reject Request" }));
    await settle();
    expect(within(screen.getByRole("dialog")).getByText(/Enter a reason for rejection/)).toBeInTheDocument();
  });
});

/* ------------------------------------------------------------------ Back */

describe("Back from an org page returns to the list it came from", () => {
  async function backHref(origin: Record<string, string | null>) {
    const { AdminSubscriptionDetailPage } = await import("../admin-pages");
    const view = render(
      <ToastProvider>
        <AdminSubscriptionDetailPage orgId="org-1" origin={origin} />
      </ToastProvider>,
    );
    await settle();
    const href = screen.getByRole("link", { name: /Subscriptions/ }).getAttribute("href");
    view.unmount();
    return href;
  }

  it("from Package Requests (tab, filter, page) and from Organisation Subscriptions (filters, search, page)", async () => {
    expect(await backHref({ from: "package-requests", status: "rejected", page: "2" })).toBe("/admin-console/subscriptions?tab=package-requests&status=rejected&page=2");
    expect(await backHref({ from: "org-subscriptions", status: "past_due", q: "acme", plan: "pro", page: "3" })).toBe(
      "/admin-console/subscriptions?tab=org-subscriptions&status=past_due&plan=pro&q=acme&page=3",
    );
    expect(await backHref({})).toBe("/admin-console/subscriptions");
  });

  it("Organisation Subscriptions restores its filters from the URL and passes them on Open", async () => {
    window.history.replaceState(null, "", "/admin-console/subscriptions?tab=org-subscriptions&q=acme");
    const { AdminSubscriptionsV2 } = await import("../admin-pages");
    render(
      <ToastProvider>
        <AdminSubscriptionsV2 />
      </ToastProvider>,
    );
    await settle();
    expect(screen.getByPlaceholderText("Search organisations…")).toHaveValue("acme");
    expect(window.location.search).toBe("?tab=org-subscriptions&q=acme");
    for (const open of screen.queryAllByRole("link", { name: "Open" })) {
      expect(open.getAttribute("href")).toMatch(/\?from=org-subscriptions&q=acme(&|$)/);
    }
  });
});

/* -------------------------------------------------------------- Org side */

describe("the org's Billing page shows the rejection reason", () => {
  it("RejectedUpgradeBanner", async () => {
    const { RejectedUpgradeBanner } = await import("../../checkout");
    render(
      <RejectedUpgradeBanner
        rejected={{ requestId: "pcr_1", toPlan: { id: "pro", name: "Pro" }, interval: "monthly", rejectedAt: "2026-10-18T09:00:00.000Z", reason: "Please pay the pending invoice first." }}
      />,
    );
    expect(screen.getByText("Change to Pro was not approved")).toBeInTheDocument();
    expect(screen.getByText(/rejected on 18 Oct 2026/)).toBeInTheDocument();
    expect(screen.getByText("Please pay the pending invoice first.", { exact: false })).toBeInTheDocument();
  });
});
