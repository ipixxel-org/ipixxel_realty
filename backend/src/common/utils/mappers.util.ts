import {
  Organisation,
  OrgIndustry,
  Prisma,
  User,
} from '@prisma/client';

type SafeUserSource = Pick<
  User,
  | 'id'
  | 'orgId'
  | 'firstName'
  | 'lastName'
  | 'email'
  | 'phoneNumber'
  | 'status'
  | 'mustChangePassword'
  | 'createdAt'
  | 'onboardingStep'
> & {
  emailVerifiedAt?: Date | null;
  approvedAt?: Date | null;
  // Optional (not in the Pick list) rather than required: the login SQL
  // fallback path (Prisma unavailable) doesn't select it, same treatment as
  // emailVerifiedAt/approvedAt above.
  country?: string | null;
};

// Strips password_hash and other internal fields before a user ever reaches a response.
export function toSafeUser(user: SafeUserSource) {
  return {
    id: user.id,
    org_id: user.orgId,
    first_name: user.firstName,
    last_name: user.lastName,
    email: user.email,
    phone_number: user.phoneNumber,
    status: user.status,
    must_change_password: user.mustChangePassword,
    approved_at: user.approvedAt ?? null,
    created_at: user.createdAt,
    onboarding_step: user.onboardingStep,
    email_verified_at: user.emailVerifiedAt ?? null,
    country: user.country ?? null,
  };
}

export function toSafeOrganisation(organisation: Organisation) {
  return {
    id: organisation.id,
    name: organisation.name,
    slug: organisation.slug,
    city: organisation.city,
    status: organisation.status,
    created_at: organisation.createdAt,
    timezone: organisation.timezone,
    currency: organisation.currency,
    default_language: organisation.defaultLanguage,
    logo_url: organisation.logoUrl,
    favicon_url: organisation.faviconUrl,
    brand_colour: organisation.brandColour,
    website: organisation.website,
    address_line1: organisation.addressLine1,
    address_line2: organisation.addressLine2,
    state: organisation.state,
    postal_code: organisation.postalCode,
    country: organisation.country,
    rera_license_no: organisation.reraLicenseNo,
    gstin: organisation.gstin,
    team_size: organisation.teamSize,
    legal_name: organisation.legalName,
    industry: organisation.industry,
    support_email: organisation.supportEmail,
    support_phone: organisation.supportPhone,
    enabled_modules: organisation.enabledModules,
    subdomain: organisation.subdomain,
    subdomain_status: organisation.subdomainStatus,
    custom_domain: organisation.customDomain,
    custom_domain_status: organisation.customDomainStatus,
    rejection_reason: organisation.rejectionReason,
  };
}

export const ORGANISATION_EDITABLE_FIELDS = [
  'name',
  'city',
  'timezone',
  'currency',
  'defaultLanguage',
  'logoUrl',
  'faviconUrl',
  'brandColour',
  'website',
  'addressLine1',
  'addressLine2',
  'state',
  'postalCode',
  'country',
  'reraLicenseNo',
  'gstin',
  'legalName',
  'supportEmail',
  'supportPhone',
] as const;

// Shared by the Super Admin and Org Admin organisation-update paths — both
// accept the same editable-profile-fields DTO shape (slug/status excluded).
// Only copies fields the caller actually sent, so a partial PATCH body
// doesn't clobber the rest with undefined.
//
// `industry` is handled separately from the loop below — it's the one enum
// among these fields (Prisma.OrganisationUpdateInput expects OrgIndustry, not
// an arbitrary string), so it can't share the generic plain-string assignment
// the rest of these use.
export function buildOrganisationUpdateData(
  dto: Partial<Record<(typeof ORGANISATION_EDITABLE_FIELDS)[number], string>> & {
    industry?: OrgIndustry;
  },
): Prisma.OrganisationUpdateInput {
  const data: Prisma.OrganisationUpdateInput = {};
  for (const field of ORGANISATION_EDITABLE_FIELDS) {
    if (dto[field] !== undefined) {
      data[field] = dto[field];
    }
  }
  if (dto.industry !== undefined) {
    data.industry = dto.industry;
  }
  return data;
}
