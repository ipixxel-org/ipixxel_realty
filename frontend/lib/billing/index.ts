/**
 * The ONE place the app picks its billing data layer. Today: the mock client
 * (state kept in this browser). When the backend ships, export an
 * `apiBillingClient` implementing `BillingClient` here instead — nothing else
 * changes.
 */
import type { BillingClient } from "./client";
import { createMockBillingClient } from "./mock/client";

export const billingClient: BillingClient = createMockBillingClient({ persistKey: "billing-v2:mock:v1" });

export { BILLING_V2 } from "./flag";
export { BillingError, type BillingClient } from "./client";
