/**
 * Integrations → Online payments: the card's switch (online_payments_enabled),
 * its disabled state without a usable gateway, the payment gateways list and
 * the old Razorpay URL redirect.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IntegrationsGrid } from "../integrations-grid";
import { PaymentGatewaysList } from "../payment-gateways";
import { onlinePaymentsBadge } from "../online-payments-card";
import { RAZORPAY_SETTINGS_HREF, type IntegrationStatus } from "@/lib/integrations";

const api = vi.hoisted(() => ({
  getIntegrationsStatus: vi.fn(),
  saveOnlinePayments: vi.fn(),
  getRazorpaySettings: vi.fn(),
}));
vi.mock("@/lib/api", () => api);

const redirect = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  redirect,
  usePathname: () => "/admin-console/integrations",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
}));

const auth = vi.hoisted(() => ({
  user: { roleKeys: ["super_admin"] } as unknown,
  hasPermission: vi.fn(() => true),
  isLoading: false,
}));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => auth }));
vi.mock("@/components/superadmin/shell", () => ({
  isUnrestrictedPlatformUser: (u: { roleKeys?: string[] } | null) => Boolean(u?.roleKeys?.includes("super_admin")),
}));

const payments = (o: Partial<IntegrationStatus>): IntegrationStatus => ({
  key: "payments",
  configured: true,
  active: false,
  enabled: false,
  gateway: "razorpay",
  ...o,
});

function card() {
  return screen.getByRole("heading", { name: "Online payments" }).closest(".card") as HTMLElement;
}

beforeEach(() => {
  auth.user = { roleKeys: ["super_admin"] };
  auth.hasPermission.mockReturnValue(true);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Online payments card", () => {
  it("replaces the Razorpay card: no key fields, a Manage link to the gateways page", async () => {
    api.getIntegrationsStatus.mockResolvedValue([payments({})]);
    render(<IntegrationsGrid />);
    await within(card()).findByText("Off");
    expect(screen.queryByRole("heading", { name: "Razorpay" })).toBeNull();
    expect(within(card()).getByText("Let organisations pay online. When off, upgrades go to Super Admin for approval.")).toBeInTheDocument();
    expect(within(card()).queryByLabelText(/key/i)).toBeNull();
    expect(within(card()).getByRole("link", { name: "Manage" })).toHaveAttribute("href", "/admin-console/integrations/payments");
  });

  it("reads online_payments_enabled into the switch", async () => {
    api.getIntegrationsStatus.mockResolvedValue([payments({ enabled: true, active: true })]);
    render(<IntegrationsGrid />);
    await within(card()).findByText("Active · Razorpay");
    expect(within(card()).getByRole("switch", { name: "Online payments" })).toHaveAttribute("aria-checked", "true");
  });

  it("writes online_payments_enabled after the confirm dialog", async () => {
    api.getIntegrationsStatus.mockResolvedValue([payments({})]);
    api.saveOnlinePayments.mockResolvedValue({ enabled: true, paymentMode: "online", paymentModeReason: null, gateway: "razorpay" });
    render(<IntegrationsGrid />);
    await within(card()).findByText("Off");

    fireEvent.click(within(card()).getByRole("switch", { name: "Online payments" }));
    expect(api.saveOnlinePayments).not.toHaveBeenCalled(); // asks first
    fireEvent.click(await screen.findByRole("button", { name: "Turn on" }));

    await waitFor(() => expect(api.saveOnlinePayments).toHaveBeenCalledWith(true));
    await within(card()).findByText("Active · Razorpay");
    expect(within(card()).getByRole("switch", { name: "Online payments" })).toHaveAttribute("aria-checked", "true");
  });

  it("asks before turning it off too; cancelling changes nothing", async () => {
    api.getIntegrationsStatus.mockResolvedValue([payments({ enabled: true, active: true })]);
    render(<IntegrationsGrid />);
    await within(card()).findByText("Active · Razorpay");
    fireEvent.click(within(card()).getByRole("switch", { name: "Online payments" }));
    expect(await screen.findByText("Turn off online payments?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(api.saveOnlinePayments).not.toHaveBeenCalled();
  });

  it("is disabled with a hint when no gateway has usable keys", async () => {
    api.getIntegrationsStatus.mockResolvedValue([payments({ configured: false, gateway: null })]);
    render(<IntegrationsGrid />);
    await within(card()).findByText("No gateway configured");
    const toggle = within(card()).getByRole("switch", { name: "Online payments" });
    expect(toggle).toHaveAttribute("aria-disabled", "true");
    expect(within(card()).getByText(/Add working keys for a payment gateway/)).toBeInTheDocument();
    fireEvent.click(toggle);
    expect(screen.queryByText("Turn on online payments?")).toBeNull();
    expect(api.saveOnlinePayments).not.toHaveBeenCalled();
  });

  it("is disabled for a platform user without Settings edit access", async () => {
    auth.user = { roleKeys: ["support"] };
    auth.hasPermission.mockImplementation(((module: string, action: string) => !(module === "admin_settings" && action === "edit")) as never);
    api.getIntegrationsStatus.mockResolvedValue([payments({})]);
    render(<IntegrationsGrid />);
    await within(card()).findByText("Off");
    expect(within(card()).getByRole("switch", { name: "Online payments" })).toHaveAttribute("aria-disabled", "true");
  });

  it("status text: Active · Razorpay / Off / No gateway configured", () => {
    expect(onlinePaymentsBadge(payments({ enabled: true, active: true }), false).text).toBe("Active · Razorpay");
    expect(onlinePaymentsBadge(payments({ enabled: false }), false).text).toBe("Off");
    expect(onlinePaymentsBadge(payments({ configured: false, gateway: null }), false).text).toBe("No gateway configured");
    expect(onlinePaymentsBadge(payments({ enabled: true, configured: false, gateway: null }), false).text).toBe("No gateway configured");
  });
});

describe("Payment gateways page", () => {
  it("lists Razorpay with its mode, status and an Edit link to the settings form", async () => {
    api.getRazorpaySettings.mockResolvedValue({ configured: true, mode: "test" });
    render(<PaymentGatewaysList />);
    const row = (await screen.findByText("Configured")).closest("tr") as HTMLElement;
    expect(within(row).getByText("Razorpay")).toBeInTheDocument();
    expect(within(row).getByText("Test")).toBeInTheDocument();
    expect(within(row).getByRole("link", { name: "Edit" })).toHaveAttribute("href", RAZORPAY_SETTINGS_HREF);
  });

  it("shows Live and Not configured from the saved keys", async () => {
    api.getRazorpaySettings.mockResolvedValue({ configured: false, mode: "live" });
    render(<PaymentGatewaysList />);
    expect(await screen.findByText("Not configured")).toBeInTheDocument();
    expect(screen.getByText("Live")).toBeInTheDocument();
  });
});

describe("old Razorpay URL", () => {
  it("redirects to the Razorpay settings under Online payments", async () => {
    const { default: OldRazorpayPage } = await import("@/app/admin-console/integrations/razorpay/page");
    OldRazorpayPage();
    expect(redirect).toHaveBeenCalledWith("/admin-console/integrations/payments/razorpay");
  });
});
