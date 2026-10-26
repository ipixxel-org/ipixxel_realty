/**
 * Scheduled plan changes (to Basic / a smaller plan) on the Requests lists:
 * a record with a "No approval needed" tag. Org side: "Keep <plan>" on a
 * Scheduled row (the banner's undo). Super Admin: read-only.
 */
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui/toast";
import { BillingEnvProvider, OrgBillingProvider } from "@/components/billing/context";
import { RequestsTable } from "@/components/billing/requests";
import { OrgPackageRequests } from "@/components/billing/admin/package-requests";
import type { BillingClient } from "@/lib/billing/client";
import { createMockBillingClient } from "@/lib/billing/mock/client";
import type { OrgPlanRequest } from "@/lib/billing/types";
import type { PackageChangeRequestRow } from "@/lib/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/org/settings",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ hasPermission: () => true, user: { roleKeys: ["super_admin"] } }) }));

const api = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock("@/lib/api", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/api")>();
  return { ...real, getAdminPackageChangeRequests: api.list };
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
  render(
    <ToastProvider>
      <BillingEnvProvider client={client}>
        <OrgBillingProvider>{node}</OrgBillingProvider>
      </BillingEnvProvider>
    </ToastProvider>,
  );
  await settle();
}

const STARTS = "2026-12-22T00:00:00.000Z";
const scheduledRow = (over: Partial<OrgPlanRequest> = {}): OrgPlanRequest => ({
  id: "s1",
  kind: "scheduled_change",
  requestedAt: "2026-10-26T10:00:00.000Z",
  requestedBy: "Rohan Mehta",
  fromPlan: { id: "pro", name: "Pro" },
  toPlan: { id: "basic", name: "Basic" },
  interval: "monthly",
  amount: null,
  amountNote: null,
  status: "scheduled",
  decidedAt: null,
  rejectionReason: null,
  whatStays: null,
  label: "Change to Basic",
  overdue: false,
  total: null,
  payment: null,
  movedToBasicAt: null,
  quote: null,
  startsAt: STARTS,
  reason: "Too expensive",
  ...over,
});

const withRows = (base: BillingClient, rows: OrgPlanRequest[]): BillingClient => ({
  ...base,
  listOrgRequests: async () => ({ data: rows, total: rows.length, page: 1, pageSize: 10 }),
});

describe("org Requests: scheduled changes", () => {
  it("a Scheduled move to Basic: start date, reason, nothing to pay, the tag and Keep <plan>", async () => {
    const base = createMockBillingClient({ initial: { situation: "cancellation_scheduled" } });
    const undoCancel = vi.fn(base.undoCancel);
    await show({ ...withRows(base, [scheduledRow()]), undoCancel }, <RequestsTable />);
    const row = screen.getByTestId("org-plan-request");
    expect(row).toHaveTextContent("Change to Basic");
    expect(row).toHaveTextContent("Pro → Basic");
    expect(row).toHaveTextContent("Starts 22 Dec 2026");
    expect(row).toHaveTextContent("Reason: Too expensive");
    expect(row).toHaveTextContent("Nothing to pay now");
    expect(row).toHaveTextContent("Scheduled (applies on 22 Dec)");
    expect(within(row).getByTestId("no-approval-tag")).toHaveTextContent("No approval needed");
    expect(within(row).queryByRole("button", { name: "Withdraw" })).toBeNull();

    fireEvent.click(within(row).getByRole("button", { name: /^Keep / }));
    await settle();
    expect(undoCancel).toHaveBeenCalled();
  });

  it("a smaller paid plan shows its price from the start date; Keep undoes the downgrade", async () => {
    const base = createMockBillingClient({ initial: { situation: "downgrade_scheduled" } });
    const undoDowngrade = vi.fn(base.undoDowngrade);
    await show(
      { ...withRows(base, [scheduledRow({ toPlan: { id: "growth", name: "Growth" }, label: "Change to Growth", amount: 999, reason: null })]), undoDowngrade },
      <RequestsTable />,
    );
    const row = screen.getByTestId("org-plan-request");
    expect(row).toHaveTextContent("₹999 + GST from 22 Dec");
    fireEvent.click(within(row).getByRole("button", { name: /^Keep / }));
    await settle();
    expect(undoDowngrade).toHaveBeenCalled();
  });

  it("Done / Undone / Replaced rows have no Keep button", async () => {
    const rows = (["done", "undone", "replaced"] as const).map((status, i) =>
      scheduledRow({ id: `s${i}`, status, decidedAt: "2026-12-22T00:00:00.000Z" }),
    );
    await show(withRows(createMockBillingClient(), rows), <RequestsTable />);
    const [done, undone, replaced] = screen.getAllByTestId("org-plan-request");
    expect(done).toHaveTextContent("Done");
    expect(undone).toHaveTextContent("Undone");
    expect(replaced).toHaveTextContent("Replaced");
    expect(screen.queryByRole("button", { name: /^Keep / })).toBeNull();
  });
});

describe("Super Admin org page: scheduled changes are read-only", () => {
  const adminRow = (over: Partial<PackageChangeRequestRow> = {}) =>
    ({
      id: "s1",
      orgId: "org-1",
      currentPlanId: "pro",
      targetPlanId: "basic",
      billingCycle: "monthly",
      status: "scheduled",
      kind: "scheduled_change",
      reason: "Too expensive",
      startsAt: STARTS,
      scheduledAmount: null,
      createdAt: "2026-10-26T10:00:00.000Z",
      updatedAt: "2026-10-26T10:00:00.000Z",
      organisation: { id: "org-1", name: "Prestige Test Org", slug: "prestige", city: "Bengaluru" },
      requestedBy: { id: "u1", firstName: "Rohan", lastName: "Mehta", email: "r@example.com" },
      reviewedBy: null,
      reviewedAt: null,
      currentPlan: { id: "pro", name: "Pro", priceMonthly: 1499, priceYearly: 14990 },
      targetPlan: { id: "basic", name: "Basic", priceMonthly: 0, priceYearly: 0 },
      label: "Change to Basic",
      overdue: false,
      payment: null,
      movedToBasicAt: null,
      billingCheckout: null,
      ...over,
    }) as unknown as PackageChangeRequestRow;

  it("no Mark as paid / Approve / Reject; the tag, start date and price show", async () => {
    api.list.mockReset().mockResolvedValue({
      data: [adminRow(), adminRow({ id: "s0", status: "done", targetPlanId: "growth", scheduledAmount: 999, reviewedAt: "2026-12-22T00:00:00.000Z" } as never)],
      total: 2,
      page: 1,
      limit: 100,
    });
    render(
      <ToastProvider>
        <OrgPackageRequests orgId="org-1" />
      </ToastProvider>,
    );
    await settle();
    const [scheduled, done] = screen.getAllByTestId("org-package-request");
    for (const r of [scheduled, done]) {
      expect(within(r).queryByRole("button", { name: /Mark as paid|Approve|Reject/ })).toBeNull();
      expect(within(r).getByTestId("no-approval-tag")).toBeInTheDocument();
    }
    expect(scheduled).toHaveTextContent("Scheduled (applies on 22 Dec)");
    expect(scheduled).toHaveTextContent("Nothing to pay now");
    expect(scheduled).toHaveTextContent("Starts 22 Dec 2026");
    expect(scheduled).toHaveTextContent("Reason: Too expensive");
    expect(done).toHaveTextContent("₹999 + GST from 22 Dec");
    expect(done).toHaveTextContent("Done on 22 Dec 2026");
  });
});
