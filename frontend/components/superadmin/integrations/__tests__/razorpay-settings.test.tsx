/**
 * The Razorpay settings form no longer has its own on/off checkbox — whether
 * customers pay online is the Online payments switch. Saving always keeps the
 * gateway on, which also clears an "off" saved by the old checkbox.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RazorpaySettings } from "@/components/superadmin/razorpay-settings";
import type { RazorpaySettingsView } from "@/lib/types";

const view = (o: Partial<RazorpaySettingsView>): RazorpaySettingsView => ({
  source: "database",
  isActive: true,
  configured: true,
  ready: true,
  mode: "test",
  keyId: "rzp_test_abc",
  keySecret: "••••••••",
  hasKeySecret: true,
  webhookSecret: "••••••••",
  hasWebhookSecret: true,
  envFallbackAvailable: false,
  webhookUrl: "https://api.example.test/webhooks/razorpay",
  updatedAt: null,
  ...o,
});

const api = vi.hoisted(() => ({
  getRazorpaySettings: vi.fn(),
  updateRazorpaySettings: vi.fn(),
  clearRazorpaySettings: vi.fn(),
  testRazorpaySettings: vi.fn(),
}));
vi.mock("@/lib/api", () => api);
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: { roleKeys: ["super_admin"] } }) }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Razorpay settings form", () => {
  it("has no 'Enable Razorpay payments' checkbox", async () => {
    api.getRazorpaySettings.mockResolvedValue(view({}));
    render(<RazorpaySettings />);
    await screen.findByText(/Active • Test mode/);
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByText(/Enable Razorpay payments/)).toBeNull();
  });

  it("saving keeps the gateway on, turning back on one the old checkbox left off", async () => {
    api.getRazorpaySettings.mockResolvedValue(view({ isActive: false, ready: false }));
    api.updateRazorpaySettings.mockResolvedValue(view({}));
    render(<RazorpaySettings />);
    expect(await screen.findByText("Configured • Save to turn on")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Save Razorpay" }));
    await waitFor(() => expect(api.updateRazorpaySettings).toHaveBeenCalledWith(expect.objectContaining({ isActive: true })));
    expect(await screen.findByText(/Active • Test mode/)).toBeInTheDocument();
  });
});
