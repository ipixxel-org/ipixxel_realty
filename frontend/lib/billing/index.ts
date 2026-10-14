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
  saveAdminPlan: true,
  getLifecycleSettings: true,
  saveLifecycleSettings: true,
  // Step 2 — billing profile and checkout (online via Razorpay, or a manual request)
  getBillingProfile: true,
  saveBillingProfile: true,
  previewCheckout: true,
  startCheckout: true,
  confirmCheckout: true,
  listAdminCheckouts: true,
  // Still mock
  updatePaymentMethod: false, // not offered: renewals are "pay each time"
  cancelPlan: false,
  undoCancel: false,
  scheduleDowngrade: false,
  undoDowngrade: false,
  getRetentionChoices: false,
  saveRetentionChoices: false,
  listInvoices: false,
  listPayments: false,
  listCoupons: false,
  getCoupon: false,
  saveCoupon: false,
  listOrgOptions: false,
  listSubscriptions: false,
  getSubscription: false,
  extendGrace: false,
  markPaidOffline: false,
  applyCoupon: false,
  cancelSubscription: false,
  listAdminPayments: false,
  refundPayment: false,
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
