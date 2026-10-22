import type { Organisation, PrismaClient } from '@prisma/client';
import type { BillingProfileV2 } from './billing.types';
import { gstinProblem, isGstStateCode, normaliseGstin } from './gst';

/**
 * Billing details (the buyer on GST invoices) come from the organisation's
 * profile — Settings → General — not from a separate billing form. The old
 * billing.billing_profiles table is deprecated: copied into the org profile
 * once (migration 20261022090000_org_profile_billing_details) and no longer
 * read or written.
 *
 * Field mapping (Organisation → BillingProfileV2):
 *   name (the organisation name) → legalName, addressLine1 → addressLine1,
 *   addressLine2 → addressLine2, city → city, state (GST state code) → state,
 *   postalCode → pincode, gstin → gstin, country ("India" / empty → "IN").
 */

export type OrgBillingSource = Pick<
  Organisation,
  | 'name'
  | 'addressLine1'
  | 'addressLine2'
  | 'city'
  | 'state'
  | 'postalCode'
  | 'country'
  | 'gstin'
>;

export const ORG_BILLING_SELECT = {
  name: true,
  addressLine1: true,
  addressLine2: true,
  city: true,
  state: true,
  postalCode: true,
  country: true,
  gstin: true,
} as const;

/** What an invoice can't be issued without, in the order they're shown. */
export const REQUIRED_BILLING_FIELDS = [
  'legalName',
  'addressLine1',
  'city',
  'state',
  'pincode',
] as const;
export type BillingDetailsField = (typeof REQUIRED_BILLING_FIELDS)[number];

export const BILLING_DETAILS_INCOMPLETE =
  'Complete your organisation details to continue.';

const text = (v: string | null | undefined) => (v ?? '').trim();

/** "India" (or nothing) → "IN"; anything else is kept as entered. */
export function countryCodeOf(country: string | null | undefined): string {
  const c = text(country);
  return !c || /^(india|in|ind)$/i.test(c) ? 'IN' : c;
}

export function billingDetailsFromOrg(
  org: OrgBillingSource | null,
): BillingProfileV2 {
  return {
    // The name on invoices is the organisation name (Settings → General).
    legalName: text(org?.name),
    addressLine1: text(org?.addressLine1),
    addressLine2: text(org?.addressLine2) || null,
    city: text(org?.city),
    // Only a GST state code counts; anything else reads as "not chosen".
    state: isGstStateCode(text(org?.state)) ? text(org?.state) : '',
    pincode: text(org?.postalCode),
    country: countryCodeOf(org?.country),
    gstin: normaliseGstin(org?.gstin) || null,
  };
}

export function missingBillingDetails(
  d: BillingProfileV2,
): BillingDetailsField[] {
  return REQUIRED_BILLING_FIELDS.filter((k) => !text(d[k]));
}

export async function loadOrgBillingDetails(
  db: Pick<PrismaClient, 'organisation'>,
  orgId: string,
): Promise<{ details: BillingProfileV2; missing: BillingDetailsField[] }> {
  const org = await db.organisation.findUnique({
    where: { id: orgId },
    select: ORG_BILLING_SELECT,
  });
  const details = billingDetailsFromOrg(org);
  return { details, missing: missingBillingDetails(details) };
}

/**
 * Settings → General save check (Org Admin and Super Admin): the state must
 * be a GST state code (or empty), and an optional GSTIN must be well-formed
 * and registered in that state — the same rules and messages the billing
 * form used. Returns the problem, or null.
 */
export function orgTaxDetailsProblem(
  state: string | null | undefined,
  gstin: string | null | undefined,
): string | null {
  const code = text(state);
  if (code && !isGstStateCode(code))
    return 'Choose the state from the list — it decides how GST is split.';
  return gstinProblem(gstin, code || null);
}
