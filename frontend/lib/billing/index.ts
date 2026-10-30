/**
 * The ONE place the app picks its billing data layer.
 *
 * A hybrid client: every function listed `true` in REAL_FUNCTIONS calls the
 * backend (http-client.ts); everything else still runs on the mock. Each
 * backend step flips more entries to `true` until the mock is gone.
 * Walkthrough pages don't use this — they build their own mock clients.
 */
import { BillingError, type BillingClient, type BillingFunction } from "./client";
import { httpBilling } from "./http-client";
import { createMockBillingClient } from "./mock/client";

export const REAL_FUNCTIONS: Record<BillingFunction, boolean> = {
  // Step 1 — read-only screens, plans editor, payment switch
  getBillingOverview: true,
  listPlans: true,
  getAccessStatus: true,
  listAdminPlans: true,
  // Plan versions: the save confirm (a new version? who it affects).
  previewAdminPlanSave: true,
  // Plan versions: version history and the orgs on a version.
  getPlanVersions: true,
  listPlanVersionOrgs: true,
  saveAdminPlan: true,
  getLifecycleSettings: true,
  saveLifecycleSettings: true,
  // Step 2 — checkout (online via Razorpay, or a manual request)
  previewCheckout: true,
  startCheckout: true,
  confirmCheckout: true,
  listAdminCheckouts: true,
  resolveAdminCheckout: true,
  // Step 3 (renewals) reuses previewCheckout / startCheckout with purpose "renewal".
  // Step 4 — cancel / downgrade at the end of the term
  cancelPlan: true,
  undoCancel: true,
  scheduleDowngrade: true,
  undoDowngrade: true,
  // Step 5 — coupons (the checkout applies them through previewCheckout / startCheckout)
  listCoupons: true,
  getCoupon: true,
  saveCoupon: true,
  listOrgOptions: true,
  // Step 6 — choose what stays (applied by the backend on every plan change)
  getRetentionChoices: true,
  saveRetentionChoices: true,
  // Step 7 — invoices, payments, Super Admin subscriptions and refunds
  listInvoices: true,
  listPayments: true,
  listSubscriptions: true,
  getSubscription: true,
  extendGrace: true,
  markPaidOffline: true,
  applyCoupon: true,
  cancelSubscription: true,
  listAdminPayments: true,
  refundPayment: true,
  // Fixes after testing — org coupons page, company & tax details, "Run lifecycle check now"
  listOrgCoupons: true,
  // Manual mode: the org's requests list and withdrawing a pending request.
  listOrgRequests: true,
  withdrawRequest: true,
  // Choose what stays rules: Super Admin can change it any time.
  getAdminRetentionChoices: true,
  saveAdminRetentionChoices: true,
  getCompanyDetails: true,
  saveCompanyDetails: true,
  runLifecycleCheck: true,
  // Never real: renewals are "pay each time" (no saved payment method).
  updatePaymentMethod: false,
};

export function createHybridBillingClient(): BillingClient {
  const mock = createMockBillingClient({ persistKey: "billing-v2:mock:v1" });
  const client = { isMock: false, isReal: (fn: BillingFunction) => REAL_FUNCTIONS[fn] } as BillingClient;
  for (const fn of Object.keys(REAL_FUNCTIONS) as BillingFunction[]) {
    const real = httpBilling[fn];
    if (REAL_FUNCTIONS[fn] && !real) throw new Error(`REAL_FUNCTIONS.${fn} is true but http-client.ts has no implementation`);
    (client as unknown as Record<string, unknown>)[fn] = REAL_FUNCTIONS[fn]
      ? real
      : // Mock functions know only the sample plans/org; with real ids they can
        // throw — show that as "not available yet" rather than a stack message.
        async (...args: unknown[]) => {
          try {
            return await (mock[fn] as (...a: unknown[]) => Promise<unknown>)(...args);
          } catch (e) {
            throw e instanceof BillingError ? e : new BillingError("This isn't available yet.");
          }
        };
  }
  return client;
}

export const billingClient: BillingClient = createHybridBillingClient();

export { BILLING_V2 } from "./flag";
export { BillingError, type BillingClient } from "./client";
