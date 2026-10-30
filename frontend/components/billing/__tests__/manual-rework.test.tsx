/**
 * Manual mode (online payments off): every paid action is a request the Super
 * Admin handles in one place — Mark as paid → Approve (or Reject). Org side:
 * Request renewal, Change plan in grace (Basic straight away), and the
 * payment state on Settings → Billing → Requests.
 */
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui/toast";
import { BillingEnvProvider, OrgBillingProvider, useOrgBilling } from "@/components/billing/context";
import { BillingOverviewPanel } from "@/components/billing/overview";
import { BillingBanner } from "@/components/billing/banners";
import { PlansScreen } from "@/components/billing/plans";
import { DowngradeScreen } from "@/components/billing/plan-changes";
import { RequestsTable } from "@/components/billing/requests";
import { OrgPackageRequests } from "@/components/billing/admin/package-requests";
import type { BillingClient } from "@/lib/billing/client";
import { createMockBillingClient } from "@/lib/billing/mock/client";
import { initialMockState, type MockState } from "@/lib/billing/mock/state";
import type { OrgPlanRequest } from "@/lib/billing/types";
import type { PackageChangeRequestRow } from "@/lib/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/org/settings",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ hasPermission: () => true, user: { roleKeys: ["super_admin"] } }) }));

const api = vi.hoisted(() => ({
  rows: [] as unknown[],
  list: vi.fn(),
  approve: vi.fn(),
  reject: vi.fn(),
  markPaid: vi.fn(),
  clearPaid: vi.fn(),
}));
vi.mock("@/lib/api", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...real,
    getAdminPackageChangeRequests: api.list,
    approvePackageChangeRequest: api.approve,
    rejectPackageChangeRequest: api.reject,
    markPackageChangeRequestPaid: api.markPaid,
    clearPackageChangeRequestPayment: api.clearPaid,
  };
});

afterEach(cleanup);

async function settle() {
  for (let i = 0; i < 8; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

function manual(over: Partial<MockState> = {}): Partial<MockState> {
  const base = initialMockState().lifecycle;
  return { lifecycle: { ...base, onlinePaymentsEnabled: false }, ...over };
}

async function show(client: BillingClient, node: ReactNode) {
  const view = render(
    <ToastProvider>
      <BillingEnvProvider client={client}>
        <OrgBillingProvider>{node}</OrgBillingProvider>
      </BillingEnvProvider>
    </ToastProvider>,
  );
  await settle();
  return view;
}

/* ------------------------------------------------------------ Super Admin */

const payment = (amount: number) => ({
  id: "off_1",
  amount,
  method: "UPI",
  reference: "12345",
  receivedOn: "2026-10-23",
  note: null,
  status: "awaiting_approval" as const,
});
const adminRow = (over: Partial<PackageChangeRequestRow> = {}): PackageChangeRequestRow =>
  ({
    id: "pcr_1",
    orgId: "org-1",
    currentPlanId: "starter",
    targetPlanId: "pro",
    billingCycle: "monthly",
    status: "pending",
    createdAt: "2026-10-22T10:00:00.000Z",
    updatedAt: "2026-10-22T10:00:00.000Z",
    organisation: { id: "org-1", name: "Prestige Test Org", slug: "prestige", city: "Bengaluru" },
    requestedBy: { id: "u1", firstName: "Vidya", lastName: "C", email: "v@example.com" },
    reviewedBy: null,
    currentPlan: { id: "starter", name: "Starter", priceMonthly: 999, priceYearly: 9990 },
    targetPlan: { id: "pro", name: "Pro", priceMonthly: 999, priceYearly: 9990 },
    label: "Change to Pro",
    overdue: false,
    payment: null,
    movedToBasicAt: null,
    billingCheckout: { id: "c1", kind: "new", taxablePaise: 99_900, cgstPaise: 8_991, sgstPaise: 8_991, igstPaise: 0, totalPaise: 117_882, buyerLegalName: "Prestige", buyerGstin: null, buyerState: "29" },
    ...over,
  }) as unknown as PackageChangeRequestRow;

async function adminSection() {
  render(
    <ToastProvider>
      <OrgPackageRequests orgId="org-1" />
    </ToastProvider>,
  );
  await settle();
  return screen.getByTestId("org-package-request");
}

describe("Super Admin: Mark as paid → Approve", () => {
  beforeEach(() => {
    api.rows = [adminRow()];
    api.list.mockReset().mockImplementation(async () => ({ data: api.rows, total: api.rows.length, page: 1, limit: 100 }));
    api.approve.mockReset().mockResolvedValue({ success: true });
    api.reject.mockReset().mockResolvedValue({ success: true });
    api.markPaid.mockReset().mockResolvedValue({ success: true });
    api.clearPaid.mockReset().mockResolvedValue({ success: true });
  });

  it("Approve is disabled until the request is marked paid; the amount is the total, read-only", async () => {
    const r = await adminSection();
    const approve = within(r).getByRole("button", { name: "Approve" });
    expect(approve).toBeDisabled();
    expect(approve.parentElement!.getAttribute("title")).toBe("Mark this request as paid before approving it.");
    expect(r).toHaveTextContent("Waiting for payment");

    fireEvent.click(within(r).getByRole("button", { name: "Mark as paid" }));
    const dialog = screen.getByRole("dialog");
    const amount = within(dialog).getByLabelText("Amount received (incl. GST)");
    expect(amount).toHaveValue("₹1,178.82");
    expect(amount).toHaveAttribute("readonly");
    // Reference is required (except cash).
    fireEvent.click(within(dialog).getByRole("button", { name: "Mark as paid" }));
    expect(within(dialog).getByText(/Enter the UTR or cheque number/)).toBeInTheDocument();
    expect(api.markPaid).not.toHaveBeenCalled();
    fireEvent.change(within(dialog).getByLabelText("Method"), { target: { value: "UPI" } });
    fireEvent.change(within(dialog).getByLabelText(/Reference/), { target: { value: "12345" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Mark as paid" }));
    await settle();
    expect(api.markPaid).toHaveBeenCalledWith("pcr_1", expect.objectContaining({ method: "UPI", reference: "12345" }));
    expect(api.markPaid.mock.calls[0][1]).not.toHaveProperty("amount");
  });

  it("once paid it shows the payment and Approve works; the same amount approves straight away", async () => {
    api.rows = [adminRow({ payment: payment(1178.82) })];
    const r = await adminSection();
    expect(within(r).getByTestId("request-payment")).toHaveTextContent("Paid · ₹1,178.82 · UPI · UTR 12345 · 23 Oct");
    fireEvent.click(within(r).getByRole("button", { name: "Approve" }));
    expect(screen.getByText('Approve "Change to Pro" for Prestige Test Org? The GST invoice is issued and emailed now.')).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Approve" }));
    await settle();
    expect(api.approve).toHaveBeenCalledWith("pcr_1");
  });

  it("Approve never asks about the amount (it's always the request total)", async () => {
    api.rows = [adminRow({ payment: payment(1000) })];
    const r = await adminSection();
    fireEvent.click(within(r).getByRole("button", { name: "Approve" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).not.toHaveTextContent("Approve anyway");
    fireEvent.click(within(dialog).getByRole("button", { name: "Approve" }));
    await settle();
    expect(api.approve).toHaveBeenCalledWith("pcr_1");
  });

  it("rejecting a paid request warns to refund outside the app", async () => {
    api.rows = [adminRow({ payment: payment(1178.82) })];
    const r = await adminSection();
    fireEvent.click(within(r).getByRole("button", { name: "Reject" }));
    expect(screen.getByTestId("reject-paid-warning")).toHaveTextContent("This request was marked paid (₹1,178.82). Refund the customer outside the app.");
  });

  it("shows the overdue tag, the renewal label and Option A's note", async () => {
    api.rows = [adminRow({ label: "Renewal of Pro", overdue: true, movedToBasicAt: "2026-10-25T00:00:00.000Z" })];
    const r = await adminSection();
    expect(r).toHaveTextContent("Renewal of Pro");
    expect(r).toHaveTextContent("overdue renewal");
    expect(within(r).getByTestId("moved-to-basic-note")).toHaveTextContent("Org moved to Basic while waiting");
  });
});

/* -------------------------------------------------------- Requests (org) */

describe("Settings → Billing → Requests: payment state", () => {
  const req = (over: Partial<OrgPlanRequest>): OrgPlanRequest => ({
    id: "r",
    requestedAt: "2026-10-22T10:00:00.000Z",
    requestedBy: "Vidya C",
    fromPlan: { id: "starter", name: "Starter" },
    toPlan: { id: "pro", name: "Pro" },
    interval: "monthly",
    amount: 999,
    amountNote: null,
    status: "pending",
    decidedAt: null,
    rejectionReason: null,
    whatStays: null,
    label: "Change to Pro",
    overdue: false,
    total: 1178.82,
    payment: null,
    movedToBasicAt: null,
    ...over,
  });

  it("Waiting for payment (Withdraw) → Payment received – waiting for approval (Contact us to withdraw)", async () => {
    const rows = [
      req({ id: "r2", label: "Renewal of Pro", overdue: true, payment: payment(1178.82), movedToBasicAt: "2026-10-25T00:00:00.000Z" }),
      req({ id: "r1" }),
    ];
    const base = createMockBillingClient({ initial: manual() });
    await show({ ...base, listOrgRequests: async () => ({ data: rows, total: 2, page: 1, pageSize: 10 }) }, <RequestsTable />);
    const [paid, waiting] = screen.getAllByTestId("org-plan-request");
    expect(waiting).toHaveTextContent("Waiting for payment");
    expect(within(waiting).getByRole("button", { name: "Withdraw" })).toBeInTheDocument();
    expect(paid).toHaveTextContent("Renewal of Pro");
    expect(paid).toHaveTextContent("overdue renewal");
    expect(paid).toHaveTextContent("Payment received – waiting for approval");
    expect(paid).toHaveTextContent("Paid · ₹1,178.82 · UPI · UTR 12345 · 23 Oct");
    expect(paid).toHaveTextContent("Org moved to Basic while waiting");
    expect(within(paid).queryByRole("button", { name: "Withdraw" })).toBeNull();
    expect(paid).toHaveTextContent("Contact us to withdraw");
  });
});

/* ------------------------------------------------------ Org: manual mode */

describe("org, manual mode", () => {
  it("in the renewal window the banner and the overview offer Request renewal (to the Plans page)", async () => {
    await show(createMockBillingClient({ initial: manual({ situation: "renewal_3d", renewalMode: "manual" }) }), <BillingOverviewPanel showInvoices={false} />);
    const links = screen.getAllByRole("link", { name: /Request renewal/ });
    expect(links.length).toBeGreaterThanOrEqual(2); // banner + action row
    for (const a of links) expect(a.getAttribute("href")).toBe("/org/settings/billing/plans");
    // The amount stays on the button.
    for (const a of links) expect(a.textContent).toContain(" + GST");
    expect(screen.queryByRole("button", { name: /Pay now/ })).toBeNull();
  });

  it("the grace banner shows Request renewal and Change plan", async () => {
    const client = createMockBillingClient({ initial: manual({ situation: "payment_due" }) });
    await show(client, <BannerOnly />);
    expect(screen.getByRole("link", { name: /Request renewal/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Change plan" })).toHaveAttribute("href", "/org/settings/billing/plans");
  });

  it("in grace, a smaller paid plan is a request (checkout) and Basic is the move-now screen", async () => {
    await show(createMockBillingClient({ initial: manual({ situation: "payment_due", paidPlanId: "pro" }) }), <PlansScreen />);
    const hrefs = screen.getAllByRole("link").map((a) => a.getAttribute("href") ?? "");
    expect(hrefs.some((h) => h.includes("/checkout?plan=growth"))).toBe(true);
    expect(hrefs.some((h) => h.includes("/downgrade?plan=growth"))).toBe(false);
    expect(hrefs.some((h) => h.includes("/downgrade?plan=basic"))).toBe(true);
  });

  it("in grace, Basic moves straight away after a confirm", async () => {
    const client = createMockBillingClient({ initial: manual({ situation: "payment_due", paidPlanId: "pro" }) });
    const cancelPlan = vi.spyOn(client, "cancelPlan");
    await show(client, <DowngradeScreen planId="basic" />);
    expect(screen.getByText("Straight away")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "Keep the default picks" }));
    fireEvent.click(screen.getByRole("button", { name: /Move to Basic/ }));
    expect(screen.getByText("Move to Basic now?")).toBeInTheDocument();
    expect(screen.getByText(/renewal is overdue, so the move happens straight away/)).toBeInTheDocument();
    const buttons = screen.getAllByRole("button", { name: /Move to Basic/ });
    fireEvent.click(buttons[buttons.length - 1]);
    await settle();
    expect(cancelPlan).toHaveBeenCalled();
  });
});

function BannerOnly() {
  const { overview } = useOrgBilling();
  return overview ? <BillingBanner overview={overview} /> : null;
}
