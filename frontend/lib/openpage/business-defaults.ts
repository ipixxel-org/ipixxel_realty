import type { SafeOrganisation } from "@/lib/types";
import type { BusinessSettings } from "@/lib/openpage/types";

/**
 * Business Info fields owned by the organisation's Settings → General page.
 * In the builder they are read-only and always mirror the organisation;
 * the rest (tagline, WhatsApp, website) stay editable per page.
 */
export const ORG_BUSINESS_FIELDS = ["name", "address", "city", "email", "phone"] as const;
export type OrgBusinessField = (typeof ORG_BUSINESS_FIELDS)[number];
export type OrgBusinessValues = Record<OrgBusinessField, string>;

function clean(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

/** The organisation's General Information mapped onto Business Info fields. */
export function businessValuesFromOrg(org: SafeOrganisation | null | undefined): OrgBusinessValues | null {
  if (!org) return null;
  return {
    name: clean(org.name),
    address: [clean(org.address_line1), clean(org.address_line2)].filter(Boolean).join(", "),
    city: clean(org.city),
    email: clean(org.support_email),
    phone: clean(org.support_phone),
  };
}

/**
 * The patch that brings a page's Business Info in line with the
 * organisation, or null when it already matches (so opening the tab on an
 * up-to-date page writes nothing).
 */
export function businessSyncPatch(
  current: Partial<BusinessSettings> | null | undefined,
  org: OrgBusinessValues,
): Partial<BusinessSettings> | null {
  const patch: Partial<BusinessSettings> = {};
  for (const key of ORG_BUSINESS_FIELDS) {
    if ((current?.[key] ?? "") !== org[key]) patch[key] = org[key];
  }
  return Object.keys(patch).length ? patch : null;
}
