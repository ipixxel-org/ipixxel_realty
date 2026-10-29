/**
 * Manual mode, Super Admin: payments and coupons go through the org's
 * request. The org page hides "Mark paid offline" / "Apply coupon"; the Mark
 * as paid dialog takes a coupon (re-quoting the request) and its amount is
 * always the request total. The org's Requests tab shows the coupon.
 */
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui/toast";
import { BillingEnvProvider, OrgBillingProvider } from "@/components/billing/context";
import { RequestsTable } from "@/components/billing/requests";
import { OrgPackageRequests } from "@/components/billing/admin/package-requests";
import { SubscriptionDetailView } from "@/components/billing/admin/subscriptions";
import type { BillingClient } from "@/lib/billing/client";
import { createMockBillingClient } from "@/lib/billing/mock/client";
import { initialMockState } from "@/lib/billing/mock/state";
import type { OrgPlanRequest, PaymentMode, RequestQuote } from "@/lib/billing/types";
import type { PackageChangeRequestRow } from "@/lib/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/admin-console/subscriptions",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ hasPermission: () => true, user: { roleKeys: ["super_admin"] } }) }));

const api = vi.hoisted(() => ({
  rows: [] as unknown[],
  list: vi.fn(),
  approve: vi.fn(),
  markPaid: vi.fn(),
  applyCoupon: vi.fn(),
  removeCoupon: vi.fn(),
}));
vi.mock("@/lib/api", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...real,
    getAdminPackageChangeRequests: api.list,
    approvePackageChangeRequest: api.approve,
    markPackageChangeRequestPaid: api.markPaid,
    applyPackageChangeRequestCoupon: api.applyCoupon,
    removePackageChangeRequestCoupon: api.removeCoupon,
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

const ORIGINAL: RequestQuote = { price: 1499, couponCode: null, couponDiscount: 0, gst: 269.82, total: 1768.82, couponAdded: false };
const WITH_SAVE300: RequestQuote = { price: 1499, couponCode: "SAVE300", couponDiscount: 300, gst: 215.82, total: 1414.82, couponAdded: true };
const FREE100: RequestQuote = { price: 1499, couponCode: "FREE100", couponDiscount: 1499, gst: 0, total: 0, couponAdded: true };

const row = (quote: RequestQuote, over: Partial<PackageChangeRequestRow> = {}): PackageChangeRequestRow =>
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
    targetPlan: { id: "pro", name: "Pro", priceMonthly: 1499, priceYearly: 14990 },
    label: "Change to Pro",
    overdue: false,
    payment: null,
    movedToBasicAt: null,
    billingCheckout: {
      id: "c1",
      kind: "new",
      taxablePaise: Math.round((quote.price - quote.couponDiscount) * 100),
      cgstPaise: Math.round(quote.gst * 50),
      sgstPaise: Math.round(quote.gst * 50),
      igstPaise: 0,
      totalPaise: Math.round(quote.total * 100),
      buyerLegalName: "Prestige",
      buyerGstin: null,
      buyerState: "29",
    },
    quote,
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

describe("Mark as paid dialog: coupon on the request", () => {
  beforeEach(() => {
    api.rows = [row(ORIGINAL)];
    api.list.mockReset().mockImplementation(async () => ({ data: api.rows, total: api.rows.length, page: 1, limit: 100 }));
    api.approve.mockReset().mockResolvedValue({ success: true });
    api.markPaid.mockReset().mockResolvedValue({ success: true });
    api.applyCoupon.mockReset();
    api.removeCoupon.mockReset();
  });

  it("applying a coupon re-quotes the request: breakdown, read-only amount and the row follow it; Remove restores", async () => {
    api.applyCoupon.mockImplementation(async () => {
      api.rows = [row(WITH_SAVE300)];
      return { success: true, quote: WITH_SAVE300, paymentCleared: false };
    });
    api.removeCoupon.mockImplementation(async () => {
      api.rows = [row(ORIGINAL)];
      return { success: true, quote: ORIGINAL, paymentCleared: false };
    });
    const r = await adminSection();
    fireEvent.click(within(r).getByRole("button", { name: "Mark as paid" }));
    let dialog = screen.getByRole("dialog");
    expect(within(dialog).getByTestId("request-breakdown")).toHaveTextContent("₹1,499 + GST ₹269.82 = ₹1,768.82");
    expect(within(dialog).getByLabelText("Amount received (incl. GST)")).toHaveValue("₹1,768.82");

    fireEvent.change(within(dialog).getByLabelText("Coupon"), { target: { value: "save300" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Apply" }));
    await settle();
    expect(api.applyCoupon).toHaveBeenCalledWith("pcr_1", "SAVE300");
    dialog = screen.getByRole("dialog");
    expect(within(dialog).getByTestId("request-breakdown")).toHaveTextContent("₹1,499 − ₹300 coupon (SAVE300) + GST ₹215.82 = ₹1,414.82");
    expect(within(dialog).getByLabelText("Amount received (incl. GST)")).toHaveValue("₹1,414.82");
    expect(screen.getByTestId("org-package-request")).toHaveTextContent("₹1,499 − ₹300 coupon + GST");
    expect(screen.getByTestId("org-package-request")).toHaveTextContent("₹1,414.82 incl. GST");

    fireEvent.click(within(dialog).getByRole("button", { name: "Remove" }));
    await settle();
    expect(api.removeCoupon).toHaveBeenCalledWith("pcr_1");
    expect(within(screen.getByRole("dialog")).getByTestId("request-breakdown")).toHaveTextContent("₹1,499 + GST ₹269.82 = ₹1,768.82");
  });

  it("an invalid coupon shows the checkout's message", async () => {
    api.applyCoupon.mockRejectedValue(new Error("There's no coupon called NOPE. Check the spelling."));
    const r = await adminSection();
    fireEvent.click(within(r).getByRole("button", { name: "Mark as paid" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Coupon"), { target: { value: "NOPE" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Apply" }));
    await settle();
    expect(within(screen.getByRole("dialog")).getByTestId("request-coupon-error")).toHaveTextContent("There's no coupon called NOPE. Check the spelling.");
  });

  it("changing the coupon after Mark as paid asks first (the payment is cleared)", async () => {
    api.rows = [
      row(ORIGINAL, {
        payment: { id: "off_1", amount: 1768.82, method: "UPI", reference: "1", receivedOn: "2026-10-23", note: null, status: "awaiting_approval" },
      }),
    ];
    api.applyCoupon.mockResolvedValue({ success: true, quote: WITH_SAVE300, paymentCleared: true });
    const r = await adminSection();
    fireEvent.click(within(r).getByRole("button", { name: "Edit payment" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Coupon"), { target: { value: "SAVE300" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Apply" }));
    expect(api.applyCoupon).not.toHaveBeenCalled();
    expect(within(dialog).getByTestId("coupon-clears-payment")).toHaveTextContent("the payment recorded (₹1,768.82) is cleared");
    fireEvent.click(within(dialog).getByRole("button", { name: "Apply and clear payment" }));
    await settle();
    expect(api.applyCoupon).toHaveBeenCalledWith("pcr_1", "SAVE300");
  });

  it("a 100% coupon: ₹0, nothing to mark paid, Approve works without a payment", async () => {
    api.rows = [row(FREE100)];
    const r = await adminSection();
    const approve = within(r).getByRole("button", { name: "Approve" });
    expect(approve).toBeEnabled();
    expect(within(r).queryByRole("button", { name: "Mark as paid" })).toBeNull();
    fireEvent.click(within(r).getByRole("button", { name: "Edit coupon" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByTestId("nothing-to-pay")).toHaveTextContent("No invoice is issued.");
    expect(within(dialog).queryByLabelText("Amount received (incl. GST)")).toBeNull();
    expect(within(dialog).queryByRole("button", { name: "Mark as paid" })).toBeNull();
    fireEvent.click(within(dialog).getAllByRole("button", { name: "Close" }).at(-1)!);
    fireEvent.click(approve);
    expect(screen.getByText('Approve "Change to Pro" for Prestige Test Org?')).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Approve" }));
    await settle();
    expect(api.approve).toHaveBeenCalledWith("pcr_1");
  });
});

describe("Settings → Billing → Requests: the coupon on a request", () => {
  it("shows the coupon and the discounted amount", async () => {
    const req: OrgPlanRequest = {
      id: "r1",
      requestedAt: "2026-10-22T10:00:00.000Z",
      requestedBy: "Vidya C",
      fromPlan: { id: "starter", name: "Starter" },
      toPlan: { id: "pro", name: "Pro" },
      interval: "monthly",
      amount: 1199,
      amountNote: null,
      status: "pending",
      decidedAt: null,
      rejectionReason: null,
      whatStays: null,
      label: "Change to Pro",
      overdue: false,
      total: 1414.82,
      payment: null,
      movedToBasicAt: null,
      quote: WITH_SAVE300,
    };
    const base = createMockBillingClient({ initial: { lifecycle: { ...initialMockState().lifecycle, onlinePaymentsEnabled: false } } });
    render(
      <ToastProvider>
        <BillingEnvProvider client={{ ...base, listOrgRequests: async () => ({ data: [req], total: 1, page: 1, pageSize: 10 }) }}>
          <OrgBillingProvider>
            <RequestsTable />
          </OrgBillingProvider>
        </BillingEnvProvider>
      </ToastProvider>,
    );
    await settle();
    const r = screen.getByTestId("org-plan-request");
    expect(within(r).getByTestId("request-coupon-amount")).toHaveTextContent("₹1,499 − ₹300 coupon + GST");
    expect(r).toHaveTextContent("₹1,414.82 incl. GST · coupon SAVE300");
  });
});

describe("Subscriptions → org: actions by payment mode", () => {
  function detailIn(mode: PaymentMode | undefined): BillingClient {
    const base = createMockBillingClient();
    return { ...base, getSubscription: async (orgId) => ({ ...(await base.getSubscription(orgId)), paymentMode: mode }) };
  }
  function inEnv(client: BillingClient, node: ReactNode) {
    return render(
      <ToastProvider>
        <BillingEnvProvider client={client}>{node}</BillingEnvProvider>
      </ToastProvider>,
    );
  }

  it("manual mode hides Mark paid offline and Apply coupon; Extend grace stays", async () => {
    inEnv(detailIn("manual"), <SubscriptionDetailView orgId="org-skyline" />);
    await settle();
    expect(screen.getByRole("button", { name: /Extend grace/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Mark paid offline/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Apply coupon/ })).toBeNull();
  });

  it("manual mode never opens those dialogs from a link either", async () => {
    inEnv(detailIn("manual"), <SubscriptionDetailView orgId="org-skyline" initialAction="offline" />);
    await settle();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("online mode: Mark paid offline and Apply coupon are hidden for now too; Extend grace stays", async () => {
    inEnv(detailIn("online"), <SubscriptionDetailView orgId="org-skyline" />);
    await settle();
    expect(screen.getByRole("button", { name: /Extend grace/ })).toBeInTheDocument();
    for (const name of [/Mark paid offline/, /Apply coupon/]) {
      expect(screen.queryByRole("button", { name })).toBeNull();
    }
  });
});
