/**
 * Billing v2 feature flag. Inlined at build time — set
 * NEXT_PUBLIC_BILLING_V2=true in the environment to turn the new billing UI
 * on. Off (the default) = the app behaves exactly as before.
 */
export const BILLING_V2 = process.env.NEXT_PUBLIC_BILLING_V2 === "true";
