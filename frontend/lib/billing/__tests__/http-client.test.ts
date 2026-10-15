/**
 * The real billing client: each function hits the endpoint in
 * docs/billing-ui-contract.md, and API errors keep their `code`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const apiFetch = vi.fn();
vi.mock("@/lib/api", () => {
  class ApiError extends Error {
    constructor(
      message: string,
      readonly status: number,
      readonly body?: unknown,
    ) {
      super(message);
    }
  }
  return { apiFetch: (...a: unknown[]) => apiFetch(...a), ApiError };
});

const { httpBilling } = await import("../http-client");
const { ApiError } = await import("@/lib/api");
const { BillingError } = await import("../client");

beforeEach(() => {
  apiFetch.mockReset();
  apiFetch.mockResolvedValue({});
});

const lastCall = () => {
  const [path, init] = apiFetch.mock.calls.at(-1)!;
  return { path, method: init?.method ?? "GET", body: init?.body ? JSON.parse(init.body) : undefined };
};

describe("billing http client — step 2", () => {
  it("billing profile: GET and PUT /org/billing/profile", async () => {
    await httpBilling.getBillingProfile!();
    expect(lastCall()).toEqual({ path: "/org/billing/profile", method: "GET", body: undefined });
    const profile = { legalName: "Acme", addressLine1: "1 Road", addressLine2: null, city: "Mysuru", state: "29", pincode: "570001", country: "IN", gstin: null };
    await httpBilling.saveBillingProfile!(profile);
    expect(lastCall()).toEqual({ path: "/org/billing/profile", method: "PUT", body: profile });
  });

  it("checkout: preview and start POST the request as-is", async () => {
    await httpBilling.previewCheckout!({ planId: "p1", interval: "yearly", billingState: "27" });
    expect(lastCall()).toEqual({ path: "/org/billing/checkout/preview", method: "POST", body: { planId: "p1", interval: "yearly", billingState: "27" } });
    await httpBilling.startCheckout!({ planId: "p1", interval: "yearly", purpose: "purchase" });
    expect(lastCall()).toEqual({ path: "/org/billing/checkout", method: "POST", body: { planId: "p1", interval: "yearly", purpose: "purchase" } });
  });

  it("confirm sends Razorpay's own snake_case payload", async () => {
    await httpBilling.confirmCheckout!({ checkoutId: "chk_1", razorpayOrderId: "order_A", razorpayPaymentId: "pay_B", razorpaySignature: "sig" });
    expect(lastCall()).toEqual({
      path: "/org/billing/checkout/confirm",
      method: "POST",
      body: { razorpay_order_id: "order_A", razorpay_payment_id: "pay_B", razorpay_signature: "sig" },
    });
  });

  it("admin checkouts: optional status filter", async () => {
    await httpBilling.listAdminCheckouts!();
    expect(lastCall().path).toBe("/admin/billing/checkouts");
    await httpBilling.listAdminCheckouts!("needs_review");
    expect(lastCall().path).toBe("/admin/billing/checkouts?status=needs_review");
  });

  it("step 4: cancel / downgrade and their undo", async () => {
    await httpBilling.cancelPlan!({ reason: "Too expensive" });
    expect(lastCall()).toEqual({ path: "/org/billing/cancel", method: "POST", body: { reason: "Too expensive" } });
    await httpBilling.undoCancel!();
    expect(lastCall()).toEqual({ path: "/org/billing/cancel", method: "DELETE", body: undefined });
    await httpBilling.scheduleDowngrade!({ planId: "p1", interval: "monthly" });
    expect(lastCall()).toEqual({ path: "/org/billing/downgrade", method: "POST", body: { planId: "p1", interval: "monthly" } });
    await httpBilling.undoDowngrade!();
    expect(lastCall()).toEqual({ path: "/org/billing/downgrade", method: "DELETE", body: undefined });
  });

  it("API errors become BillingError with the message and code", async () => {
    apiFetch.mockRejectedValueOnce(new ApiError("Add your billing details first.", 400, { code: "billing_profile_required", message: "Add your billing details first." }));
    const err = await httpBilling.startCheckout!({ planId: "p1", interval: "monthly", purpose: "purchase" }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BillingError);
    expect(err).toMatchObject({ message: "Add your billing details first.", code: "billing_profile_required" });

    apiFetch.mockRejectedValueOnce(new Error("Network down"));
    await expect(httpBilling.previewCheckout!({ planId: "p1", interval: "monthly" })).rejects.toMatchObject({ message: "Network down", code: null });
  });
});
