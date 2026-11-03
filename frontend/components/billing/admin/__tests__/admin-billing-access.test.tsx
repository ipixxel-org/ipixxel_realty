/**
 * Billing permissions step 3: every Super Admin billing button shows only when
 * the backend allows it. SuperAdminGuard picks the action from the HTTP method
 * (POST add, PUT edit, DELETE delete; approve / reject on package requests).
 */
import { act, cleanup, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui/toast";
import type { BillingClient } from "@/lib/billing/client";
import { createMockBillingClient } from "@/lib/billing/mock/client";
import type { PackageChangeRequestRow } from "@/lib/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/admin-console/subscriptions",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));

let perms = new Set<string>();
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: { roleKeys: ["platform_team"] }, isLoading: false, hasPermission: (m: string, a: string) => perms.has(`${m}:${a}`) }),
}));

const shared = vi.hoisted(() => ({ client: null as unknown as BillingClient }));
vi.mock("@/lib/billing/flag", () => ({ BILLING_V2: true }));
vi.mock("@/lib/billing", () => ({
  get billingClient() {
    return shared.client;
  },
}));

const api = vi.hoisted(() => ({ rows: [] as unknown[] }));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getAdminPackageChangeRequests: async () => ({ data: api.rows, total: api.rows.length, page: 1, limit: 100 }),
}));

/** Platform roles, by the Subscriptions switches they hold. */
const ROLES = {
  viewOnly: ["view"],
  editOnly: ["view", "edit"],
  addOnly: ["view", "add"],
  addAndEdit: ["view", "add", "edit"],
  approveAndReject: ["view", "approve", "delete"],
} as const;
function as(role: keyof typeof ROLES, settings: string[] = []) {
  perms = new Set([...ROLES[role].map((a) => `admin_subscriptions:${a}`), ...settings.map((a) => `admin_settings:${a}`)]);
}

async function settle() {
  for (let i = 0; i < 10; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}
async function show(node: ReactNode) {
  const { BillingEnvProvider } = await import("@/components/billing/context");
  render(
    <ToastProvider>
      <BillingEnvProvider client={shared.client} canEdit={perms.has("admin_subscriptions:edit")}>
        {node}
      </BillingEnvProvider>
    </ToastProvider>,
  );
  await settle();
}
const has = (name: string | RegExp) => screen.queryAllByRole("button", { name }).length + screen.queryAllByRole("link", { name }).length > 0;

beforeEach(() => {
  shared.client = createMockBillingClient();
  api.rows = [];
});
afterEach(() => cleanup());

describe("Plans & Pricing: Edit Plan needs the preview (add) and the save (edit)", () => {
  it.each([
    ["viewOnly", false],
    ["editOnly", false],
    ["addOnly", false],
    ["addAndEdit", true],
  ] as const)("%s → Edit Plan shown: %s", async (role, shown) => {
    as(role);
    const { AdminPlansEditor } = await import("../plans-editor");
    await show(<AdminPlansEditor />);
    expect(has("Edit Plan")).toBe(shown);
  });
});

describe("Coupons follow their own module (admin_coupons): New coupon = Create, Edit = Edit", () => {
  it.each([
    ["Coupons View", ["view"], true, false, false],
    ["Coupons Create", ["view", "add"], true, true, false],
    ["Coupons Edit", ["view", "edit"], true, false, true],
    // Subscriptions switches no longer reach coupons.
    ["Subscriptions only", [], false, false, false],
  ] as const)("%s → page %s, New coupon %s, Edit %s", async (_name, coupons, page, newShown, editShown) => {
    as("addAndEdit");
    for (const a of coupons) perms.add(`admin_coupons:${a}`);
    const { AdminCouponsPage } = await import("../admin-pages");
    await show(<AdminCouponsPage />);
    expect(screen.queryByText("You don't have permission to view coupons.") === null).toBe(page);
    expect(has(/New coupon/)).toBe(newShown);
    expect(has(/^Edit$/)).toBe(editShown);
  });

  it("the coupon form's plan picker reads the Coupons endpoint, not Plans & Pricing", async () => {
    as("viewOnly");
    perms.add("admin_coupons:view");
    perms.add("admin_coupons:add");
    const listAdminPlans = vi.fn(shared.client.listAdminPlans);
    const listCouponPlans = vi.fn(shared.client.listCouponPlans);
    shared.client = { ...shared.client, listAdminPlans, listCouponPlans } as BillingClient;
    const { AdminNewCouponPage } = await import("../admin-pages");
    await show(<AdminNewCouponPage />);
    expect(listCouponPlans).toHaveBeenCalled();
    expect(listAdminPlans).not.toHaveBeenCalled();
    expect(has("Create coupon")).toBe(true);
  });
});

describe("Organisation billing: Extend grace and Move to Basic are POSTs (add)", () => {
  it.each([
    ["viewOnly", false],
    ["editOnly", false],
    ["addOnly", true],
  ] as const)("%s → shown: %s", async (role, shown) => {
    as(role);
    const base = createMockBillingClient();
    const first = (await base.listSubscriptions({ page: 1, pageSize: 10 } as never)).data[0];
    const real = await base.getSubscription(first.orgId);
    const paid = real.plan.isFree ? (await base.listPlans()).find((p) => !p.isFree)! : real.plan;
    shared.client = { ...base, getSubscription: async () => ({ ...real, status: "past_due", plan: paid, paymentMode: "online" }) } as BillingClient;
    const { SubscriptionDetailView } = await import("../subscriptions");
    await show(<SubscriptionDetailView orgId={first.orgId} />);
    const actions = screen.getByTestId("subscription-actions");
    expect(within(actions).queryByRole("button", { name: /Extend grace/ }) !== null).toBe(shown);
    expect(within(actions).queryByRole("button", { name: "Move to Basic" }) !== null).toBe(shown);
  });
});

describe("Payments: Refund is switched off for now", () => {
  it.each([
    ["viewOnly", false],
    ["editOnly", false],
    ["addOnly", false],
    ["addAndEdit", false],
  ] as const)("%s → Refund shown: %s", async (role, shown) => {
    as(role);
    const { AdminPaymentsView } = await import("../payments");
    await show(<AdminPaymentsView />);
    expect(has(/^Refund$/)).toBe(shown);
  });
});

describe("Package requests: Mark as paid is a PUT (edit); Approve is approve; Reject is delete", () => {
  const pending = {
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
    requestedBy: { id: "u1", firstName: "Vidya", lastName: "C", email: "v@example.com" },
    reviewedBy: null,
    currentPlan: { id: "basic", name: "Basic", priceMonthly: 0, priceYearly: 0 },
    targetPlan: { id: "pro", name: "Pro", priceMonthly: 999, priceYearly: 9990 },
    billingCheckout: { id: "c1", kind: "upgrade_same_interval", taxablePaise: 50000 },
  } as unknown as PackageChangeRequestRow;

  it.each([
    ["viewOnly", false, false, false],
    ["editOnly", true, false, false],
    ["addOnly", false, false, false],
    ["approveAndReject", false, true, true],
  ] as const)("%s → Mark as paid %s, Approve %s, Reject %s", async (role, markPaid, approve, reject) => {
    as(role);
    api.rows = [pending];
    const { OrgPackageRequests } = await import("../package-requests");
    render(
      <ToastProvider>
        <OrgPackageRequests orgId="org-1" />
      </ToastProvider>,
    );
    await settle();
    expect(has("Mark as paid")).toBe(markPaid);
    expect(has("Approve")).toBe(approve);
    expect(has("Reject")).toBe(reject);
  });
});

describe("Expiry & Grace Policy follows admin_settings", () => {
  it.each([
    [[], false, false],
    [["view"], true, false],
    [["view", "edit"], true, true],
  ] as const)("settings %j → card %s, Save %s", async (settings, card, save) => {
    as("addAndEdit", [...settings]);
    const { AdminLifecycleSettings } = await import("../admin-pages");
    await show(<AdminLifecycleSettings />);
    expect(screen.queryAllByText(/grace/i).length > 0).toBe(card);
    expect(has(/^Save$/)).toBe(save);
  });
});
