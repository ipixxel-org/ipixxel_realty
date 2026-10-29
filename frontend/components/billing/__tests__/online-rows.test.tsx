/**
 * Online step 3: online payments on Settings → Billing → Requests and on the
 * Super Admin's Package requests — read-only rows with the payment's tag, the
 * Razorpay order ID, the invoice once paid, and what stays.
 */
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui/toast";
import { BillingEnvProvider, OrgBillingProvider } from "@/components/billing/context";
import { RequestsTable } from "@/components/billing/requests";
import { PlansScreen } from "@/components/billing/plans";
import { DowngradeScreen } from "@/components/billing/plan-changes";
import { CheckoutScreen } from "@/components/billing/checkout";
import { BillingOverviewPanel } from "@/components/billing/overview";
import { CheckoutsNeedingReview } from "@/components/billing/admin/checkouts-review";
import { NEEDS_REVIEW_HREF, OrgPackageRequests } from "@/components/billing/admin/package-requests";
import type { BillingClient } from "@/lib/billing/client";
import { createMockBillingClient } from "@/lib/billing/mock/client";
import { onlinePaymentTag, PAYMENT_REVIEW_TEXT, planChangeBlock } from "@/lib/billing/requests";
import type { AdminCheckoutRow, BillingOverview, OnlinePaymentView, OrgPlanRequest } from "@/lib/billing/types";
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
    expect(onlinePaymentTag(online("superseded"))).toBe("Superseded");
    expect(onlinePaymentTag(online("needs_review"))).toBe("Needs review");
    expect(onlinePaymentTag(online("refunded"))).toBe("Refunded");
    expect(onlinePaymentTag(online("resolved"))).toBe("Resolved by our team");
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

describe("online step 4: a payment under review puts plan changes on hold", () => {
  const review = { status: "needs_review", requestId: null, checkoutId: "chk", fromPlan: { id: "growth", name: "Growth" }, toPlan: { id: "pro", name: "Pro" }, interval: "monthly", createdAt: PAID_AT } as const;
  /** Online, on Growth, with a paid checkout under review. */
  async function underReview(withReason = true): Promise<BillingClient> {
    const base = createMockBillingClient({ initial: { paidPlanId: "growth" } });
    const o = await base.getBillingOverview();
    const blocked: BillingOverview = {
      ...o,
      pendingUpgrade: review as never,
      ...(withReason ? { planChangeBlockedReason: "payment_review" as const, planChangeBlockedMessage: PAYMENT_REVIEW_TEXT } : { planChangeBlockedReason: undefined, planChangeBlockedMessage: undefined }),
    };
    return { ...base, getBillingOverview: async () => blocked };
  }

  it("the block says payment_review with the message (also worked out for an older API)", async () => {
    for (const withReason of [true, false]) {
      const o = await (await underReview(withReason)).getBillingOverview();
      expect(planChangeBlock(o)).toEqual({ reason: "payment_review", message: PAYMENT_REVIEW_TEXT });
    }
  });

  it("plan cards are disabled with the message", async () => {
    await show(await underReview(), <PlansScreen />);
    const blocked = screen.getAllByTestId("plan-action-blocked");
    expect(blocked.length).toBeGreaterThan(0);
    for (const b of blocked) expect(b).toHaveAttribute("title", PAYMENT_REVIEW_TEXT);
  });

  it("the downgrade page says plan changes are on hold, with no form", async () => {
    await show(await underReview(), <DowngradeScreen planId="basic" />);
    expect(screen.getByTestId("payment-review-note")).toHaveTextContent(PAYMENT_REVIEW_TEXT);
    expect(screen.queryByRole("button", { name: /Move to Basic/ })).toBeNull();
  });

  it("the checkout's Pay is disabled with the message; a renewal still goes through", async () => {
    await show(await underReview(), <CheckoutScreen planId="pro" interval="monthly" />);
    const pay = screen.getByRole("button", { name: /Pay|Request pending/ });
    expect(pay).toBeDisabled();
    expect(pay.parentElement).toHaveAttribute("title", PAYMENT_REVIEW_TEXT);
    cleanup();
    await show(await underReview(), <CheckoutScreen planId="growth" interval="monthly" renewal />);
    expect(screen.getByRole("button", { name: /^Pay / })).toBeEnabled();
  });
});

describe("online step 4: no standalone Choose what stays on the org's action row", () => {
  it("online: not in the action row; on Basic after a paid plan the locked note stays", async () => {
    await show(createMockBillingClient(), <BillingOverviewPanel showInvoices={false} />);
    expect(within(screen.getByTestId("billing-actions")).queryByRole("link", { name: "Choose what stays" })).toBeNull();
    cleanup();
    await show(createMockBillingClient({ initial: { situation: "moved_to_basic" } }), <BillingOverviewPanel showInvoices={false} />);
    expect(within(screen.getByTestId("billing-actions")).getByTestId("what-stays-locked")).toBeInTheDocument();
  });
});

describe("online step 4: Super Admin closes a payment under review by hand", () => {
  it("Mark resolved sends the note and reloads the list", async () => {
    const row: AdminCheckoutRow = {
      id: "chk-1",
      organisation: { id: "org-1", name: "Acme" },
      fromPlanName: "Growth",
      toPlanName: "Pro",
      toInterval: "monthly",
      kind: "new",
      mode: "online",
      status: "needs_review",
      total: 3540,
      paid: 3540,
      razorpayPaymentId: "pay_1",
      buyerGstin: null,
      reviewReason: "Paid after a newer change",
      createdAt: PAID_AT,
      updatedAt: PAID_AT,
    } as AdminCheckoutRow;
    const base = createMockBillingClient();
    const list = vi.fn().mockResolvedValueOnce([row]).mockResolvedValue([]);
    const resolve = vi.fn(async () => ({ id: "chk-1", status: "rejected" as const }));
    const prompt = vi.spyOn(window, "prompt").mockReturnValue("Plan changed by hand");
    await show({ ...base, listAdminCheckouts: list, resolveAdminCheckout: resolve }, <CheckoutsNeedingReview />);
    fireEvent.click(screen.getByTestId("resolve-checkout"));
    await settle();
    expect(resolve).toHaveBeenCalledWith({ checkoutId: "chk-1", note: "Plan changed by hand" });
    expect(list).toHaveBeenCalledTimes(2);
    expect(screen.queryByTestId("resolve-checkout")).toBeNull();
    prompt.mockRestore();
  });
});
