/**
 * Real HTTP implementations of BillingClient functions, one per backend
 * endpoint in docs/billing-ui-contract.md. Only the functions that exist on
 * the backend are here; `index.ts` decides which ones the app uses.
 */
import { apiFetch, ApiError } from "@/lib/api";
import { BillingError, type BillingClient, type BillingFunction } from "./client";

type Impl = Partial<Omit<BillingClient, "isMock" | "isReal">>;

/** API errors carry customer-facing messages (and a `code` to branch on) — surface them as BillingError. */
async function call<T>(path: string, init?: RequestInit): Promise<T> {
  try {
    return await apiFetch<T>(path, init);
  } catch (e) {
    if (e instanceof ApiError) {
      throw new BillingError(e.message, e.body?.code ?? null);
    }
    if (e instanceof Error) throw new BillingError(e.message);
    throw new BillingError("Something went wrong. Please try again.");
  }
}

const put = (body: unknown): RequestInit => ({ method: "PUT", body: JSON.stringify(body) });
const post = (body: unknown): RequestInit => ({ method: "POST", body: JSON.stringify(body) });
const del: RequestInit = { method: "DELETE" };

/** "?a=1&b=x" from the defined values, or "". */
function qs(params: Record<string, string | number | undefined | null>): string {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") s.set(k, String(v));
  const out = s.toString();
  return out ? `?${out}` : "";
}

export const httpBilling: Impl = {
  getBillingOverview: () => call("/org/billing/v2"),
  listPlans: () => call("/org/billing/plans"),
  getAccessStatus: () => call("/org/billing/access"),
  listAdminPlans: () => call("/admin/billing/plans"),
  saveAdminPlan: (plan) => call(`/admin/billing/plans/${encodeURIComponent(plan.id)}`, put(plan)),
  getLifecycleSettings: () => call("/admin/billing/lifecycle"),
  saveLifecycleSettings: (settings) => call("/admin/billing/lifecycle", put(settings)),

  // Step 2 — billing profile and checkout
  getBillingProfile: () => call("/org/billing/profile"),
  saveBillingProfile: (profile) => call("/org/billing/profile", put(profile)),
  previewCheckout: (req) => call("/org/billing/checkout/preview", post(req)),
  startCheckout: (req) => call("/org/billing/checkout", post(req)),
  // The backend takes Razorpay Checkout's own success payload; the order id identifies the checkout.
  confirmCheckout: (req) =>
    call(
      "/org/billing/checkout/confirm",
      post({
        razorpay_order_id: req.razorpayOrderId,
        razorpay_payment_id: req.razorpayPaymentId,
        razorpay_signature: req.razorpaySignature,
      }),
    ),
  listAdminCheckouts: (status) =>
    call(`/admin/billing/checkouts${status ? `?status=${encodeURIComponent(status)}` : ""}`),

  // Step 4 — cancel / downgrade at the end of the term (each returns the overview)
  cancelPlan: (req) => call("/org/billing/cancel", post(req)),
  undoCancel: () => call("/org/billing/cancel", del),
  scheduleDowngrade: (req) => call("/org/billing/downgrade", post(req)),
  undoDowngrade: () => call("/org/billing/downgrade", del),

  // Step 5 — coupons (Super Admin) and the org picker for org-only coupons
  listCoupons: () => call("/admin/billing/coupons"),
  getCoupon: (code) => call(`/admin/billing/coupons/${encodeURIComponent(code)}`),
  saveCoupon: (req) =>
    req.isNew ? call("/admin/billing/coupons", post(req)) : call(`/admin/billing/coupons/${encodeURIComponent(req.coupon.code)}`, put(req)),
  listOrgOptions: () => call("/admin/billing/org-options"),

  // Step 6 — choose what stays on a smaller plan
  getRetentionChoices: (req) =>
    call(`/org/billing/retention${req.targetPlanId ? `?targetPlanId=${encodeURIComponent(req.targetPlanId)}` : ""}`),
  saveRetentionChoices: (req) => call("/org/billing/retention", put(req)),

  // Step 7 — invoices, payment history, Super Admin subscriptions and payments.
  // (Org lists are under /org/billing/v2/: /org/billing/invoices is the legacy list.)
  listInvoices: (req) => call(`/org/billing/v2/invoices${qs({ page: req.page, pageSize: req.pageSize })}`),
  listPayments: (req) => call(`/org/billing/v2/payments${qs({ page: req.page, pageSize: req.pageSize })}`),
  listSubscriptions: (req) =>
    call(`/admin/billing/subscriptions${qs({ status: req.status, planId: req.planId, q: req.q, page: req.page, pageSize: req.pageSize })}`),
  getSubscription: (orgId) => call(`/admin/billing/subscriptions/${encodeURIComponent(orgId)}`),
  extendGrace: ({ orgId, ...body }) => call(`/admin/billing/subscriptions/${encodeURIComponent(orgId)}/extend-grace`, post(body)),
  markPaidOffline: ({ orgId, ...body }) => call(`/admin/billing/subscriptions/${encodeURIComponent(orgId)}/offline-payment`, post(body)),
  applyCoupon: ({ orgId, ...body }) => call(`/admin/billing/subscriptions/${encodeURIComponent(orgId)}/coupon`, post(body)),
  cancelSubscription: ({ orgId, ...body }) => call(`/admin/billing/subscriptions/${encodeURIComponent(orgId)}/cancel`, post(body)),
  listAdminPayments: (req) =>
    call(`/admin/billing/payments${qs({ status: req.status, orgId: req.orgId, page: req.page, pageSize: req.pageSize })}`),
  refundPayment: ({ paymentId, ...body }) => call(`/admin/billing/payments/${encodeURIComponent(paymentId)}/refund`, post(body)),
};

export const HTTP_FUNCTIONS = Object.keys(httpBilling) as BillingFunction[];
