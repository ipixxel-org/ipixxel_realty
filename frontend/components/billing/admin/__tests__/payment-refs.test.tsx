/**
 * Payments cleanup: the Order ID column (with copy) and invoice / credit note
 * downloads on the Super Admin organisation page and Payments & Invoicing,
 * search by order / payment ID, and no separate Payments sidebar item.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui/toast";
import { BillingEnvProvider } from "@/components/billing/context";
import { AdminPaymentsView } from "@/components/billing/admin/payments";
import { SubscriptionDetailView } from "@/components/billing/admin/subscriptions";
import { NAV_GROUPS } from "@/components/superadmin/shell";
import { createMockBillingClient } from "@/lib/billing/mock/client";
import type { BillingClient } from "@/lib/billing/client";
import type { AdminPaymentRow } from "@/lib/billing/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/admin-console/subscriptions",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: { roleKeys: ["super_admin"] }, hasPermission: () => true, isLoading: false }) }));

const open = vi.fn();
beforeEach(() => {
  vi.stubGlobal("open", open);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  open.mockReset();
});

function inEnv(client: BillingClient, node: ReactNode) {
  return render(
    <ToastProvider>
      <BillingEnvProvider client={client}>{node}</BillingEnvProvider>
    </ToastProvider>,
  );
}

const row = (o: Partial<AdminPaymentRow>): AdminPaymentRow => ({
  id: "p1",
  orgId: "org-1",
  orgName: "Acme",
  createdAt: "2026-10-12T10:00:00.000Z",
  description: "Growth · monthly",
  amount: 2360,
  method: "Online · Razorpay",
  status: "captured",
  failureReason: null,
  couponCode: null,
  reference: "pay_PAID456",
  receiptUrl: "/api/billing/invoices/inv-paid/document?exp=1&sig=a",
  orderId: "order_PAID123",
  gatewayPaymentId: "pay_PAID456",
  invoice: { id: "inv-paid", number: "INV/26-27/0001", url: "/api/billing/invoices/inv-paid/document?exp=1&sig=a" },
  creditNote: null,
  ...o,
});

/** A client whose admin payments are `rows` (status/search filtering left to the real backend). */
function clientWith(rows: AdminPaymentRow[]) {
  const client = createMockBillingClient();
  client.listAdminPayments = vi.fn(async () => ({ data: rows, total: rows.length, page: 1, pageSize: 10, totals: { collected: 0, refunded: 0, failed: 0 } }));
  return client;
}

describe("Super Admin sidebar", () => {
  it("no longer has a separate Payments item", () => {
    const hrefs = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.href));
    expect(hrefs).not.toContain("/admin-console/payments");
    expect(hrefs).toContain("/admin-console/subscriptions");
  });
});

describe("Payments & Invoicing", () => {
  it("shows the order ID with the payment ID, and offline payments as Offline + reference", async () => {
    const client = clientWith([
      row({}),
      row({ id: "off-1", method: "Offline · Bank transfer", status: "offline", reference: "UTR998877", orderId: null, gatewayPaymentId: null, invoice: null }),
    ]);
    inEnv(client, <AdminPaymentsView />);
    const online = (await screen.findByText("order_PAID123")).closest("tr") as HTMLElement;
    expect(within(online).getByText("pay_PAID456")).toBeInTheDocument();
    expect(within(online).getByRole("button", { name: "Copy order ID order_PAID123" })).toBeInTheDocument();
    const offline = screen.getByText("Offline").closest("tr") as HTMLElement;
    expect(within(offline).getByText("UTR998877")).toBeInTheDocument();
  });

  it("copies the order ID", async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    inEnv(clientWith([row({})]), <AdminPaymentsView />);
    fireEvent.click(await screen.findByRole("button", { name: "Copy order ID order_PAID123" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("order_PAID123"));
  });

  it("searches by order ID / payment ID (sent to the server)", async () => {
    const client = clientWith([row({})]);
    inEnv(client, <AdminPaymentsView />);
    await screen.findByText("order_PAID123");
    fireEvent.change(screen.getByRole("searchbox", { name: "Search by order ID or payment ID" }), { target: { value: " pay_PAID " } });
    await waitFor(() => expect(client.listAdminPayments).toHaveBeenLastCalledWith(expect.objectContaining({ search: "pay_PAID", page: 1 })));
  });

  it("search works end to end on the sample data", async () => {
    inEnv(createMockBillingClient(), <AdminPaymentsView />);
    await screen.findByText("order_PxR41kz1mAq7");
    expect(screen.getByText("order_PxV09aLm3Qe2")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "pxr41" } });
    await waitFor(() => expect(screen.queryByText("order_PxV09aLm3Qe2")).toBeNull());
    expect(screen.getByText("order_PxR41kz1mAq7")).toBeInTheDocument();
  });

  it("Download invoice opens that payment's invoice; a refund also offers its credit note", async () => {
    inEnv(
      clientWith([
        row({}),
        row({
          id: "p2",
          status: "refunded",
          orderId: "order_REF789",
          gatewayPaymentId: "pay_REF000",
          invoice: { id: "inv-ref", number: "INV/26-27/0002", url: "/api/billing/invoices/inv-ref/document?sig=b" },
          creditNote: { id: "cn-ref", number: "CN/26-27/0001", url: "/api/billing/invoices/cn-ref/document?sig=c" },
        }),
      ]),
      <AdminPaymentsView />,
    );
    const paid = (await screen.findByText("order_PAID123")).closest("tr") as HTMLElement;
    expect(within(paid).queryByRole("button", { name: /Credit note/ })).toBeNull();
    fireEvent.click(within(paid).getByRole("button", { name: /Invoice/ }));
    expect(open).toHaveBeenLastCalledWith("/api/billing/invoices/inv-paid/document?exp=1&sig=a", "_blank", "noopener");

    const refunded = screen.getByText("order_REF789").closest("tr") as HTMLElement;
    fireEvent.click(within(refunded).getByRole("button", { name: /Invoice/ }));
    expect(open).toHaveBeenLastCalledWith("/api/billing/invoices/inv-ref/document?sig=b", "_blank", "noopener");
    fireEvent.click(within(refunded).getByRole("button", { name: /Credit note/ }));
    expect(open).toHaveBeenLastCalledWith("/api/billing/invoices/cn-ref/document?sig=c", "_blank", "noopener");
  });
});

describe("Organisation Subscriptions → Open → Payments", () => {
  it("shows the order ID and the invoice / credit note downloads", async () => {
    const client = createMockBillingClient();
    const base = await client.getSubscription("org-skyline");
    client.getSubscription = async () => ({
      ...base,
      payments: [
        row({}),
        row({
          id: "p2",
          status: "refunded",
          orderId: "order_REF789",
          gatewayPaymentId: "pay_REF000",
          invoice: { id: "inv-ref", number: "INV/26-27/0002", url: "/api/billing/invoices/inv-ref/document?sig=b" },
          creditNote: { id: "cn-ref", number: "CN/26-27/0001", url: "/api/billing/invoices/cn-ref/document?sig=c" },
        }),
      ],
    });
    inEnv(client, <SubscriptionDetailView orgId="org-skyline" />);
    const paid = (await screen.findByText("order_PAID123")).closest("tr") as HTMLElement;
    expect(within(paid).getByText("pay_PAID456")).toBeInTheDocument();
    fireEvent.click(within(paid).getByRole("button", { name: /Invoice/ }));
    expect(open).toHaveBeenLastCalledWith("/api/billing/invoices/inv-paid/document?exp=1&sig=a", "_blank", "noopener");
    const refunded = screen.getByText("order_REF789").closest("tr") as HTMLElement;
    fireEvent.click(within(refunded).getByRole("button", { name: /Credit note/ }));
    expect(open).toHaveBeenLastCalledWith("/api/billing/invoices/cn-ref/document?sig=c", "_blank", "noopener");
  });
});
