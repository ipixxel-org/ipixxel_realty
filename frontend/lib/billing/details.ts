import type { BillingDetailsField, BillingProfile } from "./types";

/**
 * Billing details are the organisation profile (Settings → General): the
 * organisation name (as the name on invoices), address, city, state (GST
 * code), PIN code and GSTIN. Billing only shows them; they're edited in
 * General settings.
 */

export const EMPTY_BILLING_DETAILS: BillingProfile = {
  legalName: "",
  addressLine1: "",
  addressLine2: null,
  city: "",
  state: "",
  pincode: "",
  country: "IN",
  gstin: null,
};

/** What an invoice can't be issued without (same list and order as the API). */
export const REQUIRED_BILLING_FIELDS: BillingDetailsField[] = ["legalName", "addressLine1", "city", "state", "pincode"];

export const BILLING_FIELD_LABEL: Record<BillingDetailsField, string> = {
  legalName: "organisation name",
  addressLine1: "address",
  city: "city",
  state: "state",
  pincode: "PIN code",
};

export function missingBillingDetails(p: BillingProfile | null | undefined): BillingDetailsField[] {
  return REQUIRED_BILLING_FIELDS.filter((k) => !String(p?.[k] ?? "").trim());
}
