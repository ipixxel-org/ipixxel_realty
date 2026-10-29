/**
 * Online step 3: online payments on Settings → Billing → Requests and on the
 * Super Admin's Package requests — read-only rows with the payment's tag, the
 * Razorpay order ID, the invoice once paid, and what stays.
 */
import { act, cleanup, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui/toast";
import { BillingEnvProvider, OrgBillingProvider } from "@/components/billing/context";
import { RequestsTable } from "@/components/billing/requests";
import { NEEDS_REVIEW_HREF, OrgPackageRequests } from "@/components/billing/admin/package-requests";
import type { BillingClient } from "@/lib/billing/client";
import { createMockBillingClient } from "@/lib/billing/mock/client";
import { onlinePaymentTag } from "@/lib/billing/requests";
import type { OnlinePaymentView, OrgPlanRequest } from "@/lib/billing/types";
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
      <BillingEnvProvider client={client} canEdit>
        <OrgBillingProvider>{node}</OrgBillingProvider>
      </BillingEnvProvider>
    </ToastProvider>,
  );
  await settle();
}

const PAID_AT = "2026-10-27T10:00:00.000Z";
const INVOICE = { id: "inv-1", number: "INV/2026-27/0007", url: "https://api.test/invoices/inv-1?sig=x" };
const online = (state: OnlinePaymentView["state"], over: Partial<OnlinePaymentView> = {}): OnlinePaymentView => ({
  state,
  paidAt: state === "paid" || state === "needs_review" ? PAID_AT : null,
  orderId: `order_${state}`,
  invoice: state === "paid" ? INVOICE : null,
  ...over,
});
const ws = {
  planId: "starter",
  planName: "Starter",
  choice: "default" as const,
  applied: false,
  users: { limit: 2, total: 4, kept: [{ id: "u1", name: "A" }, { id: "u2", name: "B" }], paused: [{ id: "u3", name: "C" }, { id: "u4", name: "D" }] },
};

describe("the online payment tags", () => {
  it("say what happened to the payment", () => {
    expect(onlinePaymentTag(online("waiting"))).toBe("Waiting for payment");
    expect(onlinePaymentTag(online("paid"))).toBe("Paid online · 27 Oct");
    expect(onlinePaymentTag(online("failed"))).toBe("Payment failed");
    expect(onlinePaymentTag(online("expired"))).toBe("Expired (not paid)");
    expect(onlinePaymentTag(online("replaced"))).toBe("Replaced by a newer payment");
    expect(onlinePaymentTag(online("needs_review"))).toBe("Needs review");
  });
});

describe("org Requests tab", () => {
  const orgRow = (over: Partial<OrgPlanRequest>): OrgPlanRequest => ({
    id: "r",
    kind: "online_payment",
    requestedAt: "2026-10-27T08:00:00.000Z",
    requestedBy: "Vidya C",
    fromPlan: { id: "pro", name: "Pro" },
    toPlan: { id: "starter", name: "Starter" },
    interval: "monthly",
    amount: 1000,
    amountNote: null,
    status: "approved",
    decidedAt: PAID_AT,
    rejectionReason: null,
    whatStays: null,
    whatStaysAction: null,
    label: "Change to Starter",
    overdue: false,
    total: 1180,
    quote: { price: 1499, couponCode: "SAVE300", couponDiscount: 300, gst: 215.82, total: 1414.82, couponAdded: false },
    online: online("paid"),
    ...over,
  });

  it("each online payment shows its label, tag, amount, order ID and (once paid) the invoice; nothing to approve or withdraw", async () => {
    const rows = [
      orgRow({ id: "waiting", status: "awaiting_payment", decidedAt: null, online: online("waiting"), whatStays: ws, whatStaysAction: "change" }),
      orgRow({ id: "paid", label: "Renewal of Pro", overdue: true, whatStays: { ...ws, applied: true }, whatStaysAction: "view" }),
      orgRow({ id: "failed", status: "closed", online: online("failed") }),
      orgRow({ id: "expired", status: "closed", online: online("expired") }),
      orgRow({ id: "review", status: "needs_review", online: online("needs_review") }),
    ];
    const base = createMockBillingClient();
    await show({ ...base, listOrgRequests: async () => ({ data: rows, total: rows.length, page: 1, pageSize: 10 }) }, <RequestsTable />);
    const [waiting, paid, failed, expired, review] = screen.getAllByTestId("org-plan-request");

    expect(within(waiting).getByTestId("request-status")).toHaveTextContent("Waiting for payment");
    expect(within(waiting).getByTestId("online-payment-details")).toHaveTextContent("Order order_waiting");
    expect(within(waiting).queryByTestId("online-invoice-link")).toBeNull();
    expect(within(waiting).getByTestId("what-stays")).toHaveTextContent("Keeps 2 of 4 users");
    expect(within(waiting).getByRole("link", { name: "Change what stays" })).toHaveAttribute(
      "href",
      "/org/settings/billing/choose-what-stays?target=starter&back=requests&request=waiting",
    );

    expect(paid).toHaveTextContent("Renewal of Pro");
    expect(paid).toHaveTextContent("overdue renewal");
    expect(within(paid).getByTestId("request-status")).toHaveTextContent("Paid online · 27 Oct");
    expect(within(paid).getByTestId("request-coupon-amount")).toHaveTextContent("₹1,499 − ₹300 coupon + GST");
    expect(within(paid).getByTestId("online-invoice-link")).toHaveAttribute("href", INVOICE.url);
    expect(within(paid).getByTestId("online-invoice-link")).toHaveTextContent("Invoice INV/2026-27/0007");
    expect(within(paid).getByRole("link", { name: "View" })).toBeInTheDocument();

    expect(within(failed).getByTestId("request-status")).toHaveTextContent("Payment failed");
    expect(within(expired).getByTestId("request-status")).toHaveTextContent("Expired (not paid)");
    expect(within(review).getByTestId("request-status")).toHaveTextContent("Needs review");
    // The org never sees the review link or reason.
    expect(screen.queryByTestId("needs-review-link")).toBeNull();

    for (const r of [waiting, paid, failed, expired, review]) {
      expect(within(r).queryByRole("button", { name: /Withdraw|Approve|Reject|Mark as paid/ })).toBeNull();
    }
  });
});

describe("Super Admin: Package requests on the org page", () => {
  const adminRow = (over: Partial<PackageChangeRequestRow>): PackageChangeRequestRow =>
    ({
      id: "r",
      orgId: "org-1",
      kind: "online_payment",
      currentPlanId: "pro",
      targetPlanId: "starter",
      billingCycle: "monthly",
      status: "approved",
      createdAt: "2026-10-27T08:00:00.000Z",
      updatedAt: "2026-10-27T10:00:00.000Z",
      reviewedAt: PAID_AT,
      organisation: { id: "org-1", name: "Acme", slug: "acme", city: "Pune" },
      requestedBy: { id: "u", firstName: "Vidya", lastName: "C", email: "v@acme.test" },
      reviewedBy: null,
      currentPlan: { id: "pro", name: "Pro", priceMonthly: 3000, priceYearly: 30000 },
      targetPlan: { id: "starter", name: "Starter", priceMonthly: 1000, priceYearly: 10000 },
      label: "Change to Starter",
      payment: null,
      billingCheckout: { id: "chk", kind: "renewal", totalPaise: 118000, taxablePaise: 100000, cgstPaise: 9000, sgstPaise: 9000, igstPaise: 0 },
      whatStays: null,
      whatStaysEditable: false,
      online: online("paid", { reviewReason: null }),
      ...over,
    }) as unknown as PackageChangeRequestRow;

  it("online rows are read-only: tag, order ID, invoice; Needs review links to the review list with the reason; what stays on the latest row", async () => {
    api.list.mockReset().mockResolvedValue({
      data: [
        adminRow({ id: "latest", whatStays: { ...ws, applied: true }, whatStaysEditable: true } as never),
        adminRow({ id: "review", status: "needs_review", online: online("needs_review", { reviewReason: "Amount mismatch: paid 1179, quoted 1180." }) } as never),
        adminRow({ id: "waiting", status: "awaiting_payment", online: online("waiting") } as never),
      ],
      total: 3,
      page: 1,
      limit: 100,
    });
    await show(createMockBillingClient(), <OrgPackageRequests orgId="org-1" />);
    const [latest, review, waiting] = screen.getAllByTestId("org-package-request");

    expect(within(latest).getByTestId("online-payment-status")).toHaveTextContent("Paid online · 27 Oct");
    expect(within(latest).getByTestId("online-invoice-link")).toHaveAttribute("href", INVOICE.url);
    expect(within(latest).getByTestId("online-payment-details")).toHaveTextContent("Order order_paid");
    expect(within(latest).getByRole("button", { name: "Choose what stays" })).toBeInTheDocument();
    // No "Approved by … on …" line: nobody approved it, it was paid.
    expect(latest).not.toHaveTextContent(/Approved (by|on)/);

    expect(within(review).getByTestId("online-payment-status")).toHaveTextContent("Needs review");
    expect(within(review).getByTestId("online-payment-details")).toHaveTextContent("Amount mismatch");
    expect(within(review).getByTestId("needs-review-link")).toHaveAttribute("href", NEEDS_REVIEW_HREF);
    expect(within(review).queryByRole("button", { name: "Choose what stays" })).toBeNull();

    expect(within(waiting).getByTestId("online-payment-status")).toHaveTextContent("Waiting for payment");
    for (const r of [latest, review, waiting]) {
      expect(within(r).queryByRole("button", { name: /Approve|Reject|Mark as paid|Edit payment|Edit coupon/ })).toBeNull();
    }
  });

  it("manual and scheduled rows look the same as before next to online rows", async () => {
    api.list.mockReset().mockResolvedValue({
      data: [
        adminRow({ id: "online" }),
        adminRow({ id: "manual", kind: "request", status: "pending", online: null, billingCheckout: { id: "c2", kind: "new", totalPaise: 118000, taxablePaise: 100000, cgstPaise: 9000, sgstPaise: 9000, igstPaise: 0 } } as never),
        adminRow({ id: "sched", kind: "scheduled_change", status: "scheduled", online: null, billingCheckout: null, startsAt: "2026-11-26T00:00:00.000Z" } as never),
      ],
      total: 3,
      page: 1,
      limit: 100,
    });
    await show(createMockBillingClient(), <OrgPackageRequests orgId="org-1" />);
    const [, manual, sched] = screen.getAllByTestId("org-package-request");
    expect(within(manual).getByRole("button", { name: "Approve" })).toBeInTheDocument();
    expect(within(manual).getByRole("button", { name: "Mark as paid" })).toBeInTheDocument();
    expect(within(manual).queryByTestId("online-payment-status")).toBeNull();
    expect(within(sched).getByTestId("scheduled-change-status")).toBeInTheDocument();
    expect(within(sched).queryByTestId("online-payment-status")).toBeNull();
  });
});
