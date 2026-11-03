/**
 * Billing permissions step 3: the Billing row in both org-role editors (the
 * org's Roles & Permissions and Super Admin → Organisation roles) shows only
 * View and Manage; the hidden Add / Delete / Approve keep their stored value
 * on every save; Manage turns View on, View off turns Manage off.
 */
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyPermissionToggle } from "@/lib/permissions";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({
    accessToken: "t",
    user: { id: "u1", roleKeys: ["admin", "super_admin"] },
    isLoading: false,
    hasPermission: () => true,
  }),
}));

const COLS = ["canView", "canAdd", "canEdit", "canDelete", "canApprove", "canActivate", "canDeactivate", "canAddLead"] as const;
const row = (moduleKey: string, on: Partial<Record<(typeof COLS)[number], boolean>> = {}) => {
  const r: Record<string, unknown> = { moduleKey };
  for (const c of COLS) r[c] = on[c] ?? false;
  return r;
};
// A role whose stored Billing row has the unused Add and Approve on (e.g. set by an older editor).
const storedBilling = () => row("billing", { canView: true, canAdd: true, canApprove: true });

const MODULES = [
  { key: "crm", label: "Leads / CRM", description: "Lead inbox", actions: ["view", "add", "edit", "delete", "approve"] },
  { key: "billing", label: "Billing", description: "Plan, subscription and invoices" },
];

const api = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock("@/lib/api", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api")>()), apiFetch: api.apiFetch }));

let puts: { path: string; body: { permissions: Record<string, unknown>[] } }[] = [];
beforeEach(() => {
  puts = [];
  api.apiFetch.mockReset().mockImplementation(async (path: string, init?: RequestInit) => {
    if (init?.method === "PUT") {
      puts.push({ path, body: JSON.parse(String(init.body)) });
      return {};
    }
    if (path === "/org/permissions/modules") {
      return { actions: [], modules: MODULES, roles: [{ key: "sales", name: "Sales", scope: "organisation", locked: false }] };
    }
    if (path === "/org/permissions") return [{ roleKey: "sales", permissions: [row("crm", { canView: true }), storedBilling()] }];
    if (path.startsWith("/org/users")) return { data: [], total: 0 };
    if (path === "/admin/roles") return [{ id: "r1", key: "sales", name: "Sales", scope: "organisation", status: "active", isSystem: true }];
    if (path === "/admin/roles/r1/permissions") {
      return { permissions: [{ ...row("crm", { canView: true }), label: "Leads / CRM", description: "Lead inbox" }, { ...storedBilling(), label: "Billing", description: "Plan, subscription and invoices" }] };
    }
    throw new Error(`unexpected ${path}`);
  });
  // jsdom has neither (the editors scroll the matrix into view and animate rows in).
  Element.prototype.scrollIntoView = vi.fn();
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
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function settle() {
  for (let i = 0; i < 10; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

/** The pill buttons of the Billing row (aria-label "<label> permission for Billing"). */
const billingPills = () => screen.getAllByRole("button", { name: / permission for Billing$/ });
const savedBilling = () => puts[puts.length - 1].body.permissions.find((p) => p.moduleKey === "billing")!;

describe("the toggle rule for Billing", () => {
  it("Manage on turns View on; View off turns Manage off; hidden switches are never touched", () => {
    const off = row("billing", { canAdd: true, canApprove: true }) as Record<string, boolean>;
    const managed = applyPermissionToggle("billing", off, "canEdit", true, COLS);
    expect(managed).toMatchObject({ canView: true, canEdit: true, canAdd: true, canApprove: true, canDelete: false });
    const viewOff = applyPermissionToggle("billing", managed, "canView", false, COLS);
    expect(viewOff).toMatchObject({ canView: false, canEdit: false, canAdd: true, canApprove: true });
  });
});

describe.each([
  ["the org's Roles & Permissions", async () => (await import("@/app/org/roles-permissions/page")).default, false],
  ["Super Admin → Organisation roles", async () => (await import("@/app/admin-console/roles/page")).default, true],
])("%s", (_name, load, isAdminEditor) => {
  async function open() {
    const Page = await load();
    render(<Page />);
    await settle();
    if (isAdminEditor) {
      fireEvent.click(screen.getByRole("button", { name: /Permissions/ }));
      await settle();
    }
  }

  it("Billing shows two switches, View and Manage, with the new description and tooltips", async () => {
    await open();
    const pills = billingPills();
    expect(pills.map((b) => b.getAttribute("aria-label"))).toEqual(["View permission for Billing", "Manage permission for Billing"]);
    expect(pills[0]).toHaveAttribute("title", "See the plan, usage, invoices, payments, requests and coupons");
    expect(pills[1]).toHaveAttribute("title", "Pay, renew, change plan, move to Basic, keep the current plan, choose what stays, withdraw requests");
    expect(screen.getByText("Plan, usage, invoices, payments, requests and coupons")).toBeInTheDocument();
    // Other modules keep all their switches.
    expect(screen.getAllByRole("button", { name: / permission for Leads \/ CRM$/ }).length).toBeGreaterThanOrEqual(5);
  });

  it("Manage turns View on; saving keeps the stored Add / Approve; View off turns Manage off", async () => {
    await open();
    fireEvent.click(billingPills()[1]);
    await settle();
    expect(savedBilling()).toMatchObject({ canView: true, canEdit: true, canAdd: true, canApprove: true, canDelete: false });

    fireEvent.click(billingPills()[0]);
    await settle();
    expect(savedBilling()).toMatchObject({ canView: false, canEdit: false, canAdd: true, canApprove: true });
  });

  it("None on the Billing row clears View and Manage only", async () => {
    await open();
    const rowEl = billingPills()[0].closest(".platform-permission-row") as HTMLElement;
    fireEvent.click(within(rowEl).getByRole("button", { name: "None" }));
    await settle();
    expect(savedBilling()).toMatchObject({ canView: false, canEdit: false, canAdd: true, canApprove: true });
  });
});
