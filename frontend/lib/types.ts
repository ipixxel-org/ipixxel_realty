import type { FieldDef } from "./field-template";

export type OnboardingStep =
  | "account"
  | "organisation"
  | "business_details"
  | "modules"
  | "subscription"
  | "templates"
  | "invite"
  | "connect"
  | "completed";

export type OrgIndustry = "developer" | "broker" | "channel" | "mixed";

export interface SafeUser {
  id: string;
  org_id: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string;
  phone_number: string | null;
  status: string;
  must_change_password: boolean;
  created_at: string;
  onboarding_step: OnboardingStep;
  email_verified_at?: string | null;
  country?: string | null;
}

export interface SafeOrganisation {
  id: string;
  name: string;
  slug: string;
  city: string;
  status: string;
  created_at: string;
  timezone: string;
  currency: string;
  default_language: string;
  logo_url: string | null;
  favicon_url: string | null;
  brand_colour: string | null;
  website: string | null;
  address_line1: string | null;
  address_line2: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  rera_license_no: string | null;
  gstin: string | null;
  team_size: string | null;
  legal_name: string | null;
  industry: OrgIndustry | null;
  support_email: string | null;
  support_phone: string | null;
  enabled_modules: string[];
  subdomain: string | null;
  subdomain_status: string;
  custom_domain: string | null;
  custom_domain_status: string;
}

export interface UpdateOrganisationSettingsInput {
  name?: string;
  city?: string;
  timezone?: string;
  currency?: string;
  defaultLanguage?: string;
  logoUrl?: string;
  faviconUrl?: string;
  brandColour?: string;
  website?: string;
  addressLine1?: string;
  addressLine2?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  reraLicenseNo?: string;
  gstin?: string;
  legalName?: string;
  industry?: OrgIndustry;
  supportEmail?: string;
  supportPhone?: string;
}

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
}

export interface LoginResponse extends AuthTokens {
  user: SafeUser;
  roles?: string[];
  onboarding_incomplete?: boolean;
}

export interface SignupResponse extends Partial<AuthTokens> {
  organisation: SafeOrganisation;
  user: SafeUser;
  pending?: boolean;
  message?: string;
}

export interface ApiErrorBody {
  statusCode?: number;
  message?: string | string[];
  error?: string;
}

// --- Signup wizard (resumable, step-wise) ---

export interface OnboardingAccountInput {
  first_name: string;
  last_name: string;
  work_email: string;
  phone_number: string;
  password?: string;
  country: string;
  googleToken?: string;
}

export type SignupStep1Response =
  | ({ status: "created" } & AuthTokens & {
        user: SafeUser;
        onboardingStep: OnboardingStep;
        nextStep: OnboardingStep;
        email_verification_required?: boolean;
      })
  | {
      status: "exists_incomplete";
      existingUserId: string;
      firstName: string | null;
      lastName: string | null;
      onboardingStep: OnboardingStep;
    }
  | { status: "exists_completed" };

// "You already started this" popup — resolves an exists_incomplete match by
// either continuing the old draft or restarting it, both with whatever was
// just retyped on Step 1. See AuthService.resumeExistingDraft/restartExistingDraft.
export interface ResolveDraftInput {
  existingUserId: string;
  first_name: string;
  last_name: string;
  work_email: string;
  phone_number: string;
  country: string;
}

export interface ResumeSignupResponse extends AuthTokens {
  user: SafeUser;
  organisation: SafeOrganisation | null;
  onboardingStep: OnboardingStep;
  nextStep: OnboardingStep;
  subscription: { planId: string; billingCycle: string } | null;
  templateIds: string[];
  email_verification_required?: boolean;
}

export interface OnboardingOrganisationInput {
  company_name: string;
  industry?: OrgIndustry;
  teamSize?: string;
  // Moved here from the removed Business Details step.
  city?: string;
  // Terms of Service & Privacy Policy — moved here from the removed
  // Templates step. Must be true.
  agreedToTerms: boolean;
  // No `subdomain` — the simplified wizard doesn't collect one; every org
  // gets a unique auto-generated one instead (see AuthService).
  custom_domain?: string;
  country?: string;
  currency?: string;
  timezone?: string;
}

export interface OrganisationStepResponse extends AuthTokens {
  organisation: SafeOrganisation;
  user: SafeUser;
  onboardingStep: OnboardingStep;
  nextStep: OnboardingStep;
}

// Kept live — not onboarding-specific. Shared presigned-upload-URL response
// shape, also used by support-ticket attachment uploads
// (createSupportUploadUrl / createAdminSupportUploadUrl in lib/api.ts).
export interface LogoUploadUrlResult {
  uploadUrl: string;
  publicUrl: string;
  key: string;
  expiresIn: number;
}

export interface SignupInput {
  first_name: string;
  last_name: string;
  company_name: string;
  work_email: string;
  phone_number: string;
  city: string;
  country: string;
  currency: string;
  timezone: string;
  password: string;
  planId?: string;
  billingCycle?: "monthly" | "yearly";
  templateIds?: string[];
  subdomain?: string;
  custom_domain?: string;
}

export interface LoginInput {
  email: string;
  password: string;
  portal?: "organisation" | "platform";
}

export type UserRole = "super_admin" | "organisation_admin" | "team_member";

export type PermissionAction =
  | "view"
  | "add"
  | "edit"
  | "delete"
  | "approve"
  // Users module: approve/re-enable and disable a member.
  | "activate"
  | "deactivate"
  // Projects: create a lead from a project page.
  | "add_lead";

export type Permissions = Record<
  string,
  Partial<Record<PermissionAction, boolean>>
>;

export interface SessionUser extends SafeUser {
  role: UserRole;
  roleLabel: string;
  permissions: Permissions;
  organisation: SafeOrganisation | null;
  /** Platform console: true when the user has the system `super_admin` role. */
  platformUnrestricted?: boolean;
  /** Role keys from login / platform-roles/me (e.g. `super_admin`). */
  roleKeys?: string[];
}

/** Shape returned by GET /auth/me — the logged-in user plus their organisation. */
export interface UserProfile {
  user: SafeUser;
  organisation: SafeOrganisation | null;
}

export interface ChangePasswordInput {
  current_password: string;
  new_password: string;
}

export type SendViaChannel = "email" | "whatsapp" | "sms";

export interface OnboardCompanyInput {
  company_name: string;
  city: string;
}

export interface OnboardCompanyResponse {
  orgId: string;
  slug: string;
}

export interface OnboardAdminInput {
  first_name: string;
  last_name: string;
  work_email: string;
  phone_number: string;
  force_password_change: boolean;
  send_via: SendViaChannel[];
}

export interface ActivateOrganisationResponse {
  organisation: SafeOrganisation;
  admin: SafeUser;
}

export interface OrganisationListRow {
  id: string;
  name: string;
  slug: string;
  city: string;
  subdomain: string | null;
  subdomainHost: string | null;
  subdomainStatus: string;
  customDomain: string | null;
  customDomainStatus: string;
  adminName: string | null;
  adminEmail: string | null;
  adminPhone: string | null;
  status: "active" | "disabled" | "pending" | "rejected" | "draft";
  rejectionReason?: string | null;
  createdAt: string;
  userCount: number;
  teamCount: number;
  templatesCount: number;
  plan: {
    id: string;
    name: string;
    slug: string;
    badge: string;
    billingCycle?: string;
    amount?: number;
  } | null;
  mrr: number | null;
}

export interface OrganisationListResponse {
  data: OrganisationListRow[];
  total: number;
  page: number;
  limit: number;
}

export interface OrganisationSummary {
  total: number;
  active: number;
  pending?: number;
  disabled?: number;
  draft?: number;
  // Step 1 (Account) drafts that never became an Organisation — not part of
  // `draft` above, which counts real Organisation.status === 'draft' rows.
  pendingSignups?: number;
  onTrial: null;
  suspended: null;
}

// A Step 1 (Account) draft that never reached Step 2 — has no orgId, so it
// can never be shown as an OrganisationListRow (no fake org id). Only
// email-verified rows are ever returned by the backend (see
// PENDING_SIGNUP_WHERE) — unverified throwaway signups are filtered out,
// not just hidden client-side.
export interface PendingSignupRow {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  phoneNumber: string | null;
  country: string | null;
  onboardingStep: OnboardingStep;
  emailVerifiedAt: string;
  createdAt: string;
}

export interface PendingSignupListResponse {
  data: PendingSignupRow[];
  total: number;
  page: number;
  limit: number;
}

export interface OrganisationDetail {
  id: string;
  name: string;
  slug: string;
  city: string;
  subdomain: string | null;
  subdomainHost: string | null;
  subdomainStatus: string;
  customDomain: string | null;
  customDomainStatus: string;
  status: "active" | "disabled" | "pending" | "draft" | "rejected";
  rejectionReason?: string | null;
  createdAt: string;
  timezone: string;
  currency: string;
  defaultLanguage: string;
  logoUrl: string | null;
  faviconUrl: string | null;
  brandColour: string | null;
  website: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  admin: {
    firstName: string | null;
    lastName: string | null;
    email: string;
    phoneNumber: string | null;
  } | null;
  userCount: number;
  teamCount: number;
  plan: { id: string; name: string; slug: string; badge: string } | null;
  planValue: number | null;
  subscriptionRenewsAt: string | null;
  assignedTemplates?: number;
  subscription?: Subscription | null;
}

export type OrgUserAssignableRole = string;
export type OrgUserStatus = "active" | "disabled" | "pending";

export interface OrgUserRole {
  key: string;
  name: string;
}

export interface OrgUser {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  phoneNumber: string | null;
  role: OrgUserRole | null;
  status: OrgUserStatus;
  approvedAt?: string | null;
  createdAt: string;
  mustChangePassword: boolean;
  // Always false today — Teams have no creation/membership UI yet.
  hasTeam: boolean;
}

export interface OrgUsersListResponse {
  data: OrgUser[];
  total: number;
  page: number;
  limit: number;
}

export interface CreateOrgUserInput {
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber?: string;
  role: string;
  password?: string;
}

export interface UpdateOrgUserInput {
  firstName?: string;
  lastName?: string;
  email?: string;
  phoneNumber?: string;
  role?: string;
  password?: string;
}

export interface DynamicRole {
  id: string;
  key: string;
  name: string;
  description: string | null;
  scope: "platform" | "organisation" | "team";
  status: "active" | "inactive";
  sortOrder: number;
  _count?: { userRoles: number };
}

export interface PlatformTeamRole {
  id?: string;
  key: string;
  name: string;
  description?: string | null;
  scope: "platform";
}

export interface PlatformTeamMember {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  phoneNumber: string | null;
  status: "active" | "disabled" | string;
  createdAt: string;
  role: PlatformTeamRole | null;
  roles: PlatformTeamRole[];
}

export interface OrgDashboardKpiData {
  role: string;
  period: string;
  kpis: {
    totalLeads: number;
    periodChangePercent: number;
    wonLeads: number;
    wonRevenue: number;
    activePipelineRevenue: number;
    conversionRate: number;
    totalCalls: number;
    connectedCalls: number;
    callConnectRate: number;
    totalTalkTimeSeconds: number;
    siteVisitsBooked: number;
  };
  pipelineBreakdown: { status: string; label: string; count: number }[];
  callOutcomes: { outcome: string; label: string; count: number }[];
  projectMetrics: {
    projectId: string;
    projectName: string;
    leadsCount: number;
    wonCount: number;
    revenue: number;
  }[];
  agentLeaderboard: {
    userId: string;
    name: string;
    email: string;
    role: string;
    leadsCount: number;
    wonCount: number;
    revenue: number;
    callsCount: number;
    conversionRate: number;
  }[];
  recentActivity: {
    id: string;
    type: string;
    text: string;
    createdAt: string;
  }[];
  inventorySummary?: {
    totalProjects: number;
    activeProjects: number;
    totalUnits: number;
    unitsAvailable: number;
    unitsBooked: number;
    unitsHeld: number;
    portfolioOccupancyRate: number;
    inventoryValueAvailable: number;
    inventoryValueSold: number;
    projects: {
      id: string;
      name: string;
      status: string;
      location: string;
      priceMin?: number | null;
      priceMax?: number | null;
      currency: string;
      possession?: string | null;
      reraId?: string | null;
      coverImageUrl?: string | null;
      totalUnitsPlanned: number;
      unitsCreated: number;
      unitsAvailable: number;
      unitsBooked: number;
      unitsHeld: number;
      occupancyPct: number;
      inventoryValueAvailable: number;
      inventoryValueSold: number;
      unitTypesCount: number;
      configurations: string;
    }[];
  };
}

export interface OrganisationActivityRow {
  id: string;
  action: string;
  entity: string | null;
  entityId: string | null;
  createdAt: string;
}

// GET /org/templates row — the free-template library card list. No `content`;
// fetch GET /org/templates/:id for the full sections/config to preview one.
export interface OrgTemplateSummary {
  id: string;
  name: string;
  slug: string;
  thumbnail: string | null;
  category: string | null;
  categoryId?: string | null;
  tier?: "free" | "paid" | "premium";
  template: string;
  updatedAt: string;
  // How many of this org's own landing pages were built from this
  // template — 0 for anything never assigned. Lets the frontend disable
  // "Remove" up front instead of letting someone confirm an action the
  // backend guard (unassignTemplate) is just going to reject.
  landingPageCount: number;
  isAssigned?: boolean;
  isLocked?: boolean;
  lockReason?: string | null;
}

export interface OrgTemplatesListResponse {
  data: OrgTemplateSummary[];
  total: number;
  page: number;
  limit: number;
}

// --- Billing: Plans & Subscriptions ---

/** Numeric plan quotas. `null` means unlimited. */
export interface PlanLimits {
  projects: number | null;
  users: number | null;
  templates: number | null;
  landingPages: number | null;
  landingPagesCreate?: number | null;
}

/** One entry of the plan capability catalog (`GET /admin/plans/capabilities`). */
export interface PlanCapability {
  key: string;
  label: string;
  description: string;
}

export interface Plan {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  priceMonthly: number;
  priceYearly: number;
  /** Marketing bullet points only — not functional. */
  features: string[];
  limits: PlanLimits;
  /** { <capability key>: boolean }; a missing key means false. */
  capabilities: Record<string, boolean>;
  color: string;
  badge: string;
  isPopular: boolean;
  isActive: boolean;
  /** The seeded default onboarding plan (Basic) — editable, never deletable. */
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Subscription {
  id: string;
  orgId: string;
  planId: string;
  billingCycle: "monthly" | "yearly";
  status: "active" | "past_due" | "trial" | "cancelled" | "paused" | "expired";
  amount: number;
  currency: string;
  mrr: number | null;
  renewsAt: string | null;
  graceEndsAt: string | null;
  startedAt: string;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
  organisation: { id: string; name: string; city: string; slug: string } | null;
  plan: {
    id: string;
    name: string;
    slug: string;
    priceMonthly: number;
    priceYearly: number;
    color: string;
    badge: string;
    isPopular: boolean;
  } | null;
}

export interface SubscriptionsListResponse {
  data: Subscription[];
  total: number;
  page: number;
  limit: number;
}

export interface BillingOverview {
  mrr: number;
  arr: number;
  activePlans: number;
  activeSubscriptions: number;
  totalSubscriptions: number;
  churnRate: number;
  distribution: {
    planId: string;
    planName: string;
    badge: string;
    count: number;
    pct: number;
  }[];
  mrrHistory: { month: string; mrr: number }[];
}

export interface CreatePlanInput {
  name: string;
  slug?: string;
  description?: string;
  priceMonthly: number;
  priceYearly: number;
  features?: string[];
  limits?: Partial<PlanLimits>;
  capabilities?: Record<string, boolean>;
  color?: string;
  badge?: string;
  isPopular?: boolean;
}

export interface UpdatePlanInput extends Partial<CreatePlanInput> {
  isActive?: boolean;
}

export interface CreateSubscriptionInput {
  orgId: string;
  planId: string;
  billingCycle?: "monthly" | "yearly";
  status?: string;
  currency?: string;
  renewsAt?: string;
}

export interface UpdateSubscriptionInput {
  planId?: string;
  billingCycle?: "monthly" | "yearly";
  status?: "active" | "past_due" | "trial" | "cancelled" | "paused" | "expired";
  currency?: string;
  renewsAt?: string;
}

// --- Landing pages: org-owned copies made from an assigned template ---
export type LandingPageStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "rejected"
  | "published"
  | "unpublished";

export interface LandingPageRow {
  id: string;
  name: string;
  slug: string;
  status: LandingPageStatus;
  thumbnail: string | null;
  pageType: "landing" | "thank_you";
  parentId?: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  views?: number;
  leads?: number;
  sourceTemplate: { id: string; name: string } | null;
  assignedDomain?: {
    id: string;
    customDomain: string;
    status: string;
  } | null;
  thankYouPage?: {
    id: string;
    name: string;
    slug: string;
    status: LandingPageStatus;
  } | null;
  parentLandingPage?: {
    id: string;
    name: string;
    slug: string;
    status: LandingPageStatus;
  } | null;
}

export interface OrgLandingPagesListResponse {
  data: LandingPageRow[];
  total: number;
  page: number;
  limit: number;
}

export interface CreateLandingPageInput {
  templateId: string;
  name: string;
}

export interface AdminLandingPageRow extends LandingPageRow {
  organisation: { id: string; name: string; slug: string };
}

export interface AdminLandingPagesListResponse {
  data: AdminLandingPageRow[];
  total: number;
  page: number;
  limit: number;
}

// GET /org/billing — read-only view over the subscriptions module for the
// org settings screen. No invoices/payment methods exist in the schema, so
// this is deliberately just plan + usage.
export interface OrgBillingPlan {
  id: string;
  name: string;
  slug: string;
  priceMonthly: number;
  priceYearly: number;
  color: string;
  badge: string;
  isPopular: boolean;
  limits: PlanLimits | null;
  /** { <capability key>: boolean }; a missing key means false. */
  capabilities?: Record<string, boolean>;
}

export type SubscriptionStatus =
  | "active"
  | "past_due"
  | "trial"
  | "cancelled"
  | "paused"
  | "expired";

export interface OrgBillingSubscription {
  id?: string;
  status: SubscriptionStatus;
  billingCycle: "monthly" | "yearly";
  amount: number;
  currency: string;
  startedAt: string;
  renewsAt: string | null;
  /** End of the platform-configurable grace window once the term lapses. */
  graceEndsAt: string | null;
  cancelledAt: string | null;
}

export interface OrgBillingSummary {
  plan: OrgBillingPlan | null;
  subscription: OrgBillingSubscription | null;
  usage: {
    /** `*Limit` is null = unlimited when a plan exists; also null when there's
     *  no plan at all — callers branch on `plan === null` first, so this is
     *  never ambiguous in practice. */
    templatesUsed: number;
    templatesLimit: number | null;
    projectsUsed: number;
    projectsLimit: number | null;
    usersUsed: number;
    usersLimit: number | null;
    landingPagesUsed: number;
    landingPagesLimit: number | null;
    landingPagesCreateUsed?: number;
    landingPagesCreateLimit?: number | null;
  };
}

export type PackageChangeRequestStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "cancelled";

export interface PackageChangeRequestRow {
  id: string;
  orgId: string;
  currentPlanId: string;
  targetPlanId: string;
  billingCycle: "monthly" | "yearly";
  status: PackageChangeRequestStatus;
  rejectionReason?: string | null;
  reviewedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  organisation?: {
    id: string;
    name: string;
    slug: string;
    city: string;
  };
  requestedBy?: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
  };
  reviewedBy?: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
  } | null;
  currentPlan?: Plan | OrgBillingPlan;
  targetPlan?: Plan | OrgBillingPlan;
}

export interface PackageChangeRequestsListResponse {
  data: PackageChangeRequestRow[];
  total: number;
  page: number;
  limit: number;
}

// POST /org/billing/plan — org-self-service upgrade / downgrade
export interface ChangePlanInput {
  planId: string;
  billingCycle?: "monthly" | "yearly";
}

export interface ChangePlanResult {
  id: string;
  planId: string;
  planName: string;
  billingCycle: "monthly" | "yearly";
  status: string;
  amount: number;
  currency: string;
  renewsAt: string | null;
  startedAt: string;
}

// POST /org/billing/renew — extends the current term on the same plan,
// clearing any grace/expired state.
export interface BillingRenewResult {
  id: string;
  status: SubscriptionStatus;
  renewsAt: string | null;
  graceEndsAt: string | null;
}

/** Backend-persisted lead form (GET/POST/PATCH/DELETE /org/forms and
 *  /admin/forms). `content` is the full FormDefinition JSON tree. */
export interface LeadFormRecord {
  id: string;
  orgId: string | null;
  name: string;
  content: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface CreateFormInput {
  name: string;
  content: Record<string, unknown>;
}

export interface UpdateFormInput {
  name?: string;
  content?: Record<string, unknown>;
}

// GET /org/billing/invoices — derived from the active subscription (no payment
// provider exists yet, so invoices are generated from the billing cycle).
export interface InvoiceRow {
  id: string;
  number: string;
  issuedAt: string;
  dueAt: string;
  amount: number;
  currency: string;
  billingCycle: "monthly" | "yearly";
  status: "paid" | "pending";
  planName: string;
}

// --- Projects & inventory (org-scoped) ---
// All money fields are integer rupees. `possession` is deliberately free
// text ("Dec 2027"); `manager` is a free-text name, not a user id. There is
// no fixed "no. of towers / floors / area range / total land" concept —
// those are ordinary default `projectFieldTemplate` entries now (see
// FieldDef), same mechanism as Specifications.
export type ProjectStatus = "active" | "inactive";
export type UnitStatus = "available" | "booked" | "held" | "sold";

export interface Amenity {
  name: string;
  /** Public R2 URL from POST /org/projects/upload-url, or null. */
  iconUrl: string | null;
}

/** The project's manager, expanded onto every project response so the UI
 *  can show a name without a second request. */
export interface ProjectManager {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  /** "First Last", or the email if no name is set. */
  name: string;
}

export interface Project {
  id: string;
  orgId: string;
  name: string;
  location: string | null;
  reraId: string | null;
  possession: string | null;
  managerId: string | null;
  manager: ProjectManager | null;
  status: ProjectStatus;
  priceMin: number | null;
  priceMax: number | null;
  baseRate: number | null;
  /** The project type's name, copied at write time (no FK). */
  projectType: string | null;
  projectTypeId: string | null;
  /** Unit every `area`-role figure and price-per-unit-area display uses ("sqft" | "acre"). */
  areaUnit: string;
  /** This project's own copy of its type's field templates. Which inventory
   *  controls exist (grouping, floors, configurations, price) is derived
   *  from which role fields `unitFieldTemplate` carries — see field-template.ts. */
  projectFieldTemplate: FieldDef[];
  unitFieldTemplate: FieldDef[];
  /** Typed values for `projectFieldTemplate`, by field key. */
  customFields: Record<string, string | number | boolean | null>;
  tagline: string | null;
  /** ISO "YYYY-MM-DD", as an `<input type="date">` produces it. */
  launchDate: string | null;
  constructionStage: string | null;
  /** Free text, one selling point per line. */
  highlights: string | null;
  salesTeam: string | null;
  amenities: Amenity[];
  // --- Onboarding-wizard fields (Steps 3-8). Persisted by the backend as of
  // Piece A; the wizard wires them progressively in Pieces B-E. ---
  bookingAmount: number | null;
  currency: string;
  priceIncludes: string[];
  paymentPlan: string | null;
  offers: string | null;
  addressLine: string | null;
  city: string | null;
  locality: string | null;
  pincode: string | null;
  latitude: number | null;
  longitude: number | null;
  connectivity: string[];
  landmarks: string | null;
  /**
   * Loose preference blob: `{ items: [{ label, value }], notes }`. Projects
   * created before the dynamic-rows rework hold the original fixed-key shape
   * (`{ flooring, kitchen, doorsWindows, fittings, notes }`) — read both
   * through `normalizeSpecifications` in lib/specifications.
   */
  specifications: Record<string, unknown> | null;
  /** Loose preference blob: ad sources, budgets, lead goal, automation flags */
  marketing: Record<string, unknown> | null;
  requireBookingApproval: boolean;
  visibleToTelecallers: boolean;
  publishedToWebsite: boolean;
  coverImageUrl: string | null;
  galleryUrls: string[];
  brochureUrl: string | null;
  reraCertificateUrl: string | null;
  /** Overall project floor / site plans. Per-unit-type plans live on UnitType. */
  floorPlanUrls: string[];
  createdAt: string;
  updatedAt: string;
}

export interface EnquiryUnit {
  id: string;
  unitNo: string;
  configuration: string | null;
  variantLabel: string | null;
  area: number | null;
  tower: string | null;
  floor: number | null;
  facing: string | null;
  price: number | null;
  status: string;
}

export interface PublicProject extends Project {
  /** Available units for this project (a unit belongs straight to the project now). */
  units: EnquiryUnit[];
  /** Planned unit mix. */
  unitTypes: Array<{ id: string; name: string }>;
}

export interface ProjectListRow extends Project {
  unitTypeCount: number;
  /** Units actually added to this project (any status). */
  unitCount: number;
  /** Landing pages bound to this project (its `content.propertyBinding`), regardless of status. */
  landingPageCount: number;
}

/** A sales user assigned to a project (GET/PUT /org/projects/:id/sales-agents). */
export interface ProjectSalesAgent {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  name: string;
  assignedAt: string;
}

export interface UnitType {
  id: string;
  projectId: string;
  name: string;
  /** Default values to prefill onto a new unit of this configuration, keyed
   *  by the project's current unit-template field keys — typically at least
   *  the `area`- and `price`-role fields. */
  fieldDefaults: Record<string, string | number | boolean | null>;
  totalUnits: number;
  floorPlanUrl: string | null;
  brochureUrl: string | null;
  videoUrl: string | null;
  galleryUrls: string[];
  /** Derived live from Unit rows — never stored, so it can't drift. */
  unitCount: number;
  availableUnits: number;
  bookedUnits: number;
  heldUnits: number;
  soldUnits: number;
  createdAt: string;
  updatedAt: string;
}

export interface Unit {
  id: string;
  orgId: string;
  /** Null for a standalone unit (no project). */
  projectId: string | null;
  /** Project currency for project-bound units; null for standalone units. */
  currency?: string | null;
  /** A `unit_type` catalog label. Null only on legacy/imported rows. */
  configuration: string | null;
  /** A `unit_variant` catalog label ("Type A"). Optional — blank is valid. */
  variantLabel: string | null;
  unitNo: string;
  /** Optional — set only when the project's unit template has a `group`-role field. */
  tower: string | null;
  /** Optional — set only when the unit template has a `floor`-role field. */
  floor: number | null;
  facing: string | null;
  /** Free text as entered on the form ("1 covered", "2 covered", "Open"). */
  parking: string | null;
  price: number | null;
  /** Derived server-side. Null unless the project's CURRENT unit template has
   *  both a `price`- and an `area`-role field, and this unit has both values. */
  pricePerArea: number | null;
  /** The project's area unit ("sqft" | "acre"); null for a standalone unit. */
  areaUnit?: string | null;
  /** The unit's single area figure (whichever field carries the `area` role), in `areaUnit`. */
  area: number | null;
  /** Typed values for the project's unit field template, by field key. */
  customFields: Record<string, string | number | boolean | null>;
  /** Standalone-listing-only (null for project units). */
  addressLine: string | null;
  ownerName: string | null;
  notes: string | null;
  /** Public R2 URLs. */
  floorPlanUrl: string | null;
  galleryUrls: string[];
  status: UnitStatus;
  /** Assignment — mainly meaningful for a standalone unit (a project-bound
   *  unit inherits access from its project's manager/sales team instead). */
  managerId: string | null;
  manager: UnitActor | null;
  salesAgentIds: string[];
  createdById: string | null;
  updatedById: string | null;
  /** Who created / last edited this unit. Null on rows written before this existed. */
  createdBy: UnitActor | null;
  updatedBy: UnitActor | null;
  createdAt: string;
  updatedAt: string;
}

/** Minimal identity for a unit's creator / last editor. */
export interface UnitActor {
  id: string;
  name: string;
  email: string;
}

/** One configuration present on a project's units, with its status breakdown. */
export interface ProjectConfigurationRollup {
  label: string;
  total: number;
  available: number;
  booked: number;
  held: number;
  sold: number;
}

export interface ProjectDetail extends Project {
  unitTypes: UnitType[];
  /** Distinct configurations actually on the project's units (superset of unitTypes names). */
  configurations: ProjectConfigurationRollup[];
  rollup: {
    totalUnitsPlanned: number;
    unitsCreated: number;
    unitsAvailable: number;
    unitsBooked: number;
    unitsHeld: number;
    unitsSold: number;
  };
  /** User ids of the assigned sales agents (full objects via the dedicated endpoint). */
  salesAgentIds: string[];
}

export interface ProjectsListResponse {
  data: ProjectListRow[];
  total: number;
  page: number;
  limit: number;
}

export interface CreateProjectInput {
  name: string;
  location?: string;
  reraId?: string;
  possession?: string;
  managerId?: string;
  status?: ProjectStatus;
  priceMin?: number;
  priceMax?: number;
  baseRate?: number;
  projectType?: string;
  projectFieldTemplate?: unknown[];
  unitFieldTemplate?: unknown[];
  customFields?: Record<string, unknown>;
  tagline?: string;
  launchDate?: string;
  constructionStage?: string;
  highlights?: string;
  salesTeam?: string;
  amenities?: Amenity[];
  // Onboarding-wizard fields (Steps 3-8) — all optional; wired progressively
  // by Pieces B-E. `null` is accepted on update to clear a field.
  bookingAmount?: number;
  /** Any code from lib/countries.ts's CURRENCY_OPTIONS, not just INR/AED/USD. */
  currency?: string;
  /** Required on create. "sqft" | "acre" for now. */
  areaUnit?: string;
  priceIncludes?: string[];
  paymentPlan?: string;
  offers?: string;
  addressLine?: string;
  city?: string;
  locality?: string;
  pincode?: string;
  latitude?: number;
  longitude?: number;
  connectivity?: string[];
  landmarks?: string;
  specifications?: Record<string, unknown>;
  marketing?: Record<string, unknown>;
  requireBookingApproval?: boolean;
  visibleToTelecallers?: boolean;
  publishedToWebsite?: boolean;
  coverImageUrl?: string;
  galleryUrls?: string[];
  brochureUrl?: string;
  reraCertificateUrl?: string;
  floorPlanUrls?: string[];
}

// Every field optional. Nullable columns also accept an explicit `null` to
// clear them (mirrors the backend UpdateProjectDto). Arrays clear with `[]`,
// the JSON blobs with `{}`.
export interface UpdateProjectInput {
  name?: string;
  location?: string | null;
  reraId?: string | null;
  possession?: string | null;
  managerId?: string | null;
  status?: ProjectStatus;
  priceMin?: number | null;
  priceMax?: number | null;
  baseRate?: number | null;
  projectType?: string | null;
  projectFieldTemplate?: unknown[];
  unitFieldTemplate?: unknown[];
  customFields?: Record<string, unknown>;
  areaUnit?: string;
  tagline?: string | null;
  launchDate?: string | null;
  constructionStage?: string | null;
  highlights?: string | null;
  salesTeam?: string | null;
  amenities?: Amenity[];
  bookingAmount?: number | null;
  /** Any code from lib/countries.ts's CURRENCY_OPTIONS, not just INR/AED/USD. */
  currency?: string;
  priceIncludes?: string[];
  paymentPlan?: string | null;
  offers?: string | null;
  addressLine?: string | null;
  city?: string | null;
  locality?: string | null;
  pincode?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  connectivity?: string[];
  landmarks?: string | null;
  specifications?: Record<string, unknown>;
  marketing?: Record<string, unknown>;
  requireBookingApproval?: boolean;
  visibleToTelecallers?: boolean;
  publishedToWebsite?: boolean;
  coverImageUrl?: string | null;
  galleryUrls?: string[];
  brochureUrl?: string | null;
  reraCertificateUrl?: string | null;
  floorPlanUrls?: string[];
}

// --- Org custom catalogs (project onboarding wizard option lists) ---
// Org-managed, pre-created option lists the project wizard picks from — one
// generic row shape keyed by `category`. Picked values are copied onto a
// project's own fields at creation time; nothing references these rows, so
// editing or deleting one never affects an existing project.
export type OrgCatalogCategory =
  | "project_type"
  | "unit_type"
  | "connectivity"
  | "amenity"
  | "price_includes"
  | "payment_plan"
  | "facing"
  | "parking"
  | "unit_variant"
  // Lead-only lists (Settings → CRM & Leads). Configuration, Facing and
  // Parking have no lead-specific twin — they reuse "unit_type" / "facing" /
  // "parking" above. "lead_tag" backs the lead Tags multi-select.
  | "lead_purpose"
  | "lead_financing"
  | "lead_loan_status"
  | "lead_timeline_to_buy"
  | "lead_preferred_floor"
  | "lead_tag";

export interface OrgCatalogOption {
  id: string;
  orgId: string;
  category: OrgCatalogCategory;
  label: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateOrgCatalogOptionInput {
  category: OrgCatalogCategory;
  label: string;
  sortOrder?: number;
}

export interface UpdateOrgCatalogOptionInput {
  label?: string;
  sortOrder?: number;
}

export interface CreateUnitTypeInput {
  name: string;
  /** Default values to prefill onto a new unit of this configuration, keyed
   *  by the project's current unit-template field keys. */
  fieldDefaults?: Record<string, unknown>;
  totalUnits?: number;
  floorPlanUrl?: string | null;
  brochureUrl?: string | null;
  videoUrl?: string | null;
  galleryUrls?: string[];
}

export type UpdateUnitTypeInput = Partial<CreateUnitTypeInput>;

export interface CreateUnitInput {
  /** Required when the project's unit template has a `configuration`-role
   *  field; for a standalone unit, an org `unit_type` catalog label. */
  configuration?: string;
  /** The unit's single area figure — set when the unit template has an
   *  `area`-role field (or for a standalone unit). */
  area?: number;
  /** Typed values for the project's unit field template. */
  customFields?: Record<string, unknown>;
  /** Optional free-text variant label. */
  variantLabel?: string;
  unitNo: string;
  tower?: string;
  floor?: number;
  facing?: string;
  parking?: string;
  price?: number;
  status?: UnitStatus;
  /** Standalone-listing fields. */
  addressLine?: string;
  ownerName?: string;
  notes?: string;
  /** Standalone-listing assignment (ignored for a project-bound unit, which
   *  inherits access from its project's manager / sales team instead). */
  managerId?: string;
  salesAgentIds?: string[];
  /** Media — public R2 URLs. */
  floorPlanUrl?: string;
  galleryUrls?: string[];
}

export type UpdateUnitInput = Partial<
  Omit<
    CreateUnitInput,
    | "tower"
    | "parking"
    | "variantLabel"
    | "floor"
    | "area"
    | "facing"
    | "price"
    | "addressLine"
    | "ownerName"
    | "notes"
    | "floorPlanUrl"
    | "managerId"
  >
> & {
  /** value to set, or explicit null to clear. */
  tower?: string | null;
  parking?: string | null;
  variantLabel?: string | null;
  floor?: number | null;
  area?: number | null;
  facing?: string | null;
  price?: number | null;
  addressLine?: string | null;
  ownerName?: string | null;
  notes?: string | null;
  floorPlanUrl?: string | null;
  galleryUrls?: string[];
  /** null clears the manager. */
  managerId?: string | null;
  /** Full-set replace — omit to leave the current agents untouched, `[]` to clear all. */
  salesAgentIds?: string[];
};

/** One row of the cross-project "All Units" list (GET /org/units). */
export interface OrgUnitRow {
  id: string;
  unitNo: string;
  configuration: string | null;
  variantLabel: string | null;
  tower: string | null;
  floor: number | null;
  facing: string | null;
  parking: string | null;
  price: number | null;
  pricePerArea: number | null;
  area: number | null;
  customFields: Record<string, string | number | boolean | null>;
  status: UnitStatus;
  createdById: string | null;
  updatedById: string | null;
  createdBy: UnitActor | null;
  updatedBy: UnitActor | null;
  createdAt: string;
  updatedAt: string;
  /** Null for a standalone unit. */
  project: { id: string; name: string; currency: string; areaUnit: string } | null;
}

export interface OrgUnitsListResponse {
  data: OrgUnitRow[];
  total: number;
  page: number;
  limit: number;
  /** Status breakdown for the current filter set, ignoring pagination. */
  counts: { available: number; booked: number; held: number; sold: number };
}

export interface LeadSubmission {
  /** Landing page id the form belongs to (used server-side to attribute the org). */
  landingPageId?: string;
  /** Slug of the landing page or path the form was filled on. */
  slug?: string;
  /** Project this enquiry is about — lead will be linked to it. */
  projectId?: string;
  /** Specific available unit selected in the project enquiry form. */
  unitId?: string;
  /** Human name of the form (Form Builder "name" field). */
  formName?: string;
  /** Where the submission came from. */
  source?: string;
  /** Captured field values, keyed by field label. */
  fields: Record<string, string>;
}

// --- CRM leads (org-scoped inbox, role-aware) ---
export type CrmLeadStatus =
  | "new"
  | "contacted"
  | "follow_up"
  | "site_visit"
  | "negotiation"
  | "won"
  | "lost";

export interface CrmAssignee {
  id: string;
  name: string;
}

/** Actor on an activity / call timeline row. `null` renders as "System". */
export interface CrmActor {
  id: string;
  name: string;
}

/**
 * Structured CRM edit-form fields. Persisted as real columns on `Lead` and
 * edited on the lead edit page (`/org/leads/[id]/edit`). All optional — a lead
 * captured from a public form has none of them set until an agent fills them in.
 */
export interface CrmLeadEditFields {
  altName: string | null;
  altPhone: string | null;
  whatsapp: string | null;
  city: string | null;
  budgetMin: number | null;
  budgetMax: number | null;
  configurations: string[];
  purpose: string | null;
  financing: string | null;
  loanStatus: string | null;
  timelineToBuy: string | null;
  preferredFloor: string | null;
  facing: string | null;
  parking: string | null;
  requirementNotes: string | null;
  campaign: string | null;
  medium: string | null;
  campaignId: string | null;
  adSet: string | null;
  adSetId: string | null;
  ad: string | null;
  adId: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmTerm: string | null;
  utmContent: string | null;
  landingPageUrl: string | null;
  landingPage: string | null;
  platform: string | null;
  referrer: string | null;
  firstTouchSource: string | null;
  lastTouchSource: string | null;
  fbclid: string | null;
  gclid: string | null;
  temperature: string | null;
  tags: string[];
  consentWhatsapp: boolean;
  consentCall: boolean;
  consentEmail: boolean;
}

/** Result of POST /org/leads/import — `errors` lists each skipped CSV row. */
export interface LeadImportResult {
  total: number;
  created: number;
  failed: number;
  errors: { row: number; reason: string }[];
}

export interface CrmLead extends Partial<CrmLeadEditFields> {
  id: string;
  orgId?: string;
  landingPageId: string | null;
  projectId: string | null;
  project: { id: string; name: string } | null;
  formName: string | null;
  source: string | null;
  platform?: string | null;
  data: Record<string, unknown>;
  status: CrmLeadStatus;
  assignedTo: CrmAssignee | null;
  /**
   * Derived (never stored): when the lead has no individual `assignedTo` but
   * its project has sales agents, those agents can all see it — nobody owns it.
   * Null when the lead has an owner or its project has no agents.
   */
  projectTeam?: { count: number; names: string[] } | null;
  /**
   * List endpoint only: who this lead can be assigned to — its project's sales
   * agents, or a standalone unit's team. Null when there's no restriction (no
   * project, or a standalone unit with nobody on its team): any assignable user.
   */
  assignableAgents?: CrmAssignee[] | null;
  createdAt: string;
  activities?: Array<{
    id: string;
    type: string;
    text: string;
    createdAt: string;
    actor?: CrmActor | null;
  }>;
  callLogs?: Array<{
    id: string;
    direction: string;
    outcome: string;
    durationSeconds: number;
    createdAt: string;
    actor?: CrmActor | null;
  }>;
  nextAction?: {
    type: string;
    scheduledAt: string | null;
    note: string | null;
    reminderAt: string | null;
  } | null;
}

export interface CrmLeadActivity {
  id: string;
  type: string;
  text: string;
  createdAt: string;
  actor?: CrmActor | null;
}

/** Body for `PATCH /org/leads/:id` (lead edit page). Every field optional. */
export interface UpdateLeadInput extends Partial<CrmLeadEditFields> {
  contact?: { fullName?: string; phone?: string; email?: string };
  projectId?: string | null;
  source?: string | null;
  assignedToId?: string | null;
}

export interface CrmLeadListResponse {
  data: CrmLead[];
  total: number;
  page?: number;
  limit?: number;
  stats?: {
    total: number;
    unassigned: number;
    new: number;
    followUp: number;
    siteVisit: number;
    won: number;
  };
}

export interface GetCrmLeadsParams {
  projectId?: string;
  status?: CrmLeadStatus;
  source?: string;
  assignedToId?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface CrmAssignableUser {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  name: string;
  role: { key: string; name: string } | null;
}

export interface CrmAssignableResponse {
  data: CrmAssignableUser[];
  total: number;
}

export interface ProjectAssigneeCandidate {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  name: string;
  role: { key: string; name: string } | null;
  projects: Array<{ id: string; name: string; role: string }>;
}

export interface ProjectAssigneeCandidatesResponse {
  data: ProjectAssigneeCandidate[];
  total: number;
}

export interface AssignLeadInput {
  assignedToId?: string | null;
  status?: CrmLeadStatus;
  note?: string;
}

// --- Lead pipeline stage DISPLAY overrides (label + colour only) ---
// The seven CrmLeadStatus stages are fixed; an org can rename each one and
// recolour its badge. `customized` is false when the stage still matches its
// built-in default.
export interface OrgLeadStageDisplay {
  status: CrmLeadStatus;
  label: string;
  color: string;
  customized: boolean;
}

export interface UpdateLeadStageDisplayInput {
  label: string;
  color: string;
}

// --- Sales agents (org CRM team dashboard) ---

export interface SalesAgentPipelineStage {
  status: CrmLeadStatus;
  count: number;
}

export interface SalesAgentSource {
  source: string | null;
  count: number;
}

export interface SalesAgentStats {
  leadsAssigned: number;
  activeLeads: number;
  closures: number;
  lost: number;
  conversion: number;
  revenueBooked: number;
  pipeline: SalesAgentPipelineStage[];
  sources: SalesAgentSource[];
}

export interface SalesAgent {
  id: string;
  name: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  phoneNumber: string | null;
  role: { key: string; name: string } | null;
  status: "active" | "disabled";
  online: boolean;
  bridgeMissing: boolean;
  joinedAt: string;
  rank: number;
  stats: SalesAgentStats;
}

export interface SalesAgentsSnapshot {
  agents: number;
  online: number;
  missingPhone: number;
}

export interface SalesAgentsListResponse {
  total: number;
  snapshot: SalesAgentsSnapshot;
  data: SalesAgent[];
}

export interface SalesAgentRecentLead {
  id: string;
  formName: string | null;
  source: string | null;
  status: CrmLeadStatus;
  data: Record<string, unknown>;
  budget: number;
  createdAt: string;
}

export type SalesAgentCallDirection = "outgoing" | "incoming";

export interface SalesAgentComms {
  callsMade: number;
  connected: number;
  connectRate: number;
  talkSeconds: number;
  avgCallSeconds: number;
  whatsappSent: number;
  whatsappRead: number;
  whatsappReadPct: number;
}

export interface SalesAgentCall {
  id: string;
  leadId: string | null;
  leadName: string | null;
  direction: SalesAgentCallDirection;
  outcome:
    "connected" | "booked_visit" | "callback" | "no_answer" | "missed" | "busy";
  durationSeconds: number;
  createdAt: string;
}

export type SalesAgentActivityType =
  | "closed_deal"
  | "site_visit_booked"
  | "call_logged"
  | "whatsapp_sent"
  | "whatsapp_read"
  | "note_added"
  | "status_updated"
  | "logged_in";

export interface SalesAgentActivity {
  id: string;
  type: SalesAgentActivityType;
  text: string;
  createdAt: string;
}

export interface SalesAgentTargets {
  revenueCr: number;
  revenueTargetCr: number;
  closures: number;
  targetClosures: number;
  siteVisits: number;
  siteVisitTarget: number;
  leadsWorked: number;
  leadsWorkedTarget: number;
}

export interface SalesAgentDayBar {
  day: string;
  leads: number;
  calls: number;
}

export interface SalesAgentDetailResponse {
  agent: SalesAgent;
  totalAgents: number;
  recentLeads: SalesAgentRecentLead[];
  comms: SalesAgentComms;
  calls: SalesAgentCall[];
  activity: SalesAgentActivity[];
  targets: SalesAgentTargets;
  activity14: SalesAgentDayBar[];
}

// Per-user performance dashboard (Users module). Identical in shape to the
// sales-agent dashboard so the same view renders it, but returned for any org
// member regardless of role.
export type OrgUserDashboardResponse = SalesAgentDetailResponse;

// --- Organisation domain identity (custom domain) ---

export type OrgDomainKind = "custom_domain";
export type OrgDomainRequestStatus =
  | "pending"
  | "changes_requested"
  | "approved"
  | "rejected"
  | "connected"
  | "suspended";

export interface OrgDomainRequest {
  id: string;
  kind: OrgDomainKind;
  customDomain: string | null;
  domainType?: string | null;
  projectId?: string | null;
  project?: { id: string; name: string } | null;
  landingPageId: string | null;
  landingPage?: { id: string; name: string; slug: string; status?: string } | null;
  status: OrgDomainRequestStatus;
  dnsStatus?: "pending" | "verified" | "failed";
  sslStatus?: "pending" | "provisioning" | "active" | "failed";
  verificationToken?: string | null;
  verificationDetails?: any | null;
  sslDetails?: any | null;
  isPrimary?: boolean;
  redirectWww?: boolean;
  preferredHostname?: string | null;
  notes?: string | null;
  adminFeedback?: string | null;
  isSuspended?: boolean;
  suspendedReason?: string | null;
  requestedBy?: string | null;
  requestedAt: string;
  reviewedAt: string | null;
  reviewedBy?: string | null;
  publishedAt?: string | null;
  rejectionReason: string | null;
  dnsInstructions?: DnsRecordSpec[] | null;
}

/** A landing page the org can target with its primary custom domain. */
export interface OrgDomainLandingPage {
  id: string;
  name: string;
  slug: string;
  status: string;
  pageType?: string;
  projectId?: string | null;
  sourceTemplate?: { name: string } | null;
  assignedDomain?: {
    id: string;
    customDomain: string;
    status: string;
    dnsStatus?: string;
    sslStatus?: string;
  } | null;
}

export interface ApprovedDomainOption {
  id: string;
  domain: string;
  status: string;
  dnsStatus?: string;
  sslStatus?: string;
  landingPageId: string | null;
  landingPageName: string | null;
  projectId?: string | null;
  projectName?: string | null;
}

/** GET /org/domain — the organisation's own custom-domain identity. */
export interface OrgDomainInfo {
  metrics?: {
    totalDomains: number;
    pendingApprovals: number;
    dnsPending: number;
    sslIssues: number;
    liveDomains: number;
  };
  customDomain: string | null;
  customDomainStatus: string;
  customDomainLandingPageId: string | null;
  platformOrigin?: string | null;
  dnsMode?: string;
  projects?: Array<{ id: string; name: string; location?: string }>;
  landingPages: OrgDomainLandingPage[];
  requests: OrgDomainRequest[];
  approvedDomains?: ApprovedDomainOption[];
}

export interface RequestCustomDomainInput {
  domain: string;
  projectId?: string;
  landingPageId?: string;
  preferredHostname?: string;
  domainType?: string;
  isPrimary?: boolean;
  redirectWww?: boolean;
  ownershipConfirmed?: boolean;
  notes?: string;
}

export interface AssignCustomDomainInput {
  domainRequestId: string;
  landingPageId?: string | null;
  projectId?: string | null;
}

/** A DNS record pair shown to the Super Admin (e.g. A record or CNAME). */
export interface DnsRecordSpec {
  type: string;
  host: string;
  value: string;
  ttl: string;
  purpose: string;
}

/** GET /admin/org-domain-requests row (custom-domain request). */
export interface AdminOrgDomainRequest extends OrgDomainRequest {
  dnsInstructions?: DnsRecordSpec[] | null;
  organisation: {
    id: string;
    name: string;
    slug: string;
    customDomain: string | null;
  };
}

export interface AdminOrgDomainRequestListResponse {
  data?: AdminOrgDomainRequest[];
  rows?: AdminOrgDomainRequest[];
  total: number;
  page: number;
  limit: number;
  pages?: number;
  stats?: {
    total: number;
    pending: number;
    approved: number;
    live: number;
    suspended: number;
  };
  baseDomain?: string;
  dnsInstructions?: DnsRecordSpec[];
  dnsMode?: string;
}

export interface ReviewOrgDomainRequestInput {
  action: "approve" | "reject" | "request_changes" | "suspend" | "reactivate";
  reason?: string;
  feedback?: string;
}

// --- Super Admin: Audit logs ---

/** GET /admin/audit-logs detail view — the person who performed the action. */
export interface AdminAuditLogActor {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
}

/** GET /admin/audit-logs detail view — the organisation the event belongs to. */
export interface AdminAuditLogOrganisation {
  id: string;
  name: string;
}

/** GET /admin/audit-logs row. */
export interface AdminAuditLogEntry {
  id: string;
  orgId: string | null;
  actorId: string | null;
  moduleKey: string | null;
  action: string;
  actionLabel: string;
  entity: string | null;
  entityId: string | null;
  metadata: unknown;
  createdAt: string;
  actor: AdminAuditLogActor | null;
  organisation: AdminAuditLogOrganisation | null;
}

export interface AdminAuditLogsListResponse {
  data: AdminAuditLogEntry[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/** GET /admin/audit-logs/meta — values that populate the filter dropdowns. */
export interface AdminAuditLogsMeta {
  actions: { value: string; label: string; count: number }[];
  actors: { id: string; name: string; email: string }[];
  organisations: { id: string; name: string }[];
  modules: { key: string; moduleKey: string }[];
}

/** Query params shared by GET /admin/audit-logs list and export. */
export interface AdminAuditLogsParams {
  page?: number;
  limit?: number;
  search?: string;
  actorId?: string;
  orgId?: string;
  action?: string;
  moduleKey?: string;
  dateFrom?: string;
  dateTo?: string;
}

/** GET /admin/audit-logs/export — JSON payload the frontend converts to CSV. */
export interface AdminAuditLogsExportResponse {
  filename: string;
  data: AdminAuditLogEntry[];
}

/** Platform-wide lead row for Super Admin All Leads. */
export interface AdminLeadOrganisation {
  id: string;
  name: string;
  slug: string;
}

export interface AdminLead {
  id: string;
  orgId: string;
  organisation: AdminLeadOrganisation | null;
  landingPageId: string | null;
  projectId: string | null;
  project: { id: string; name: string } | null;
  formName: string | null;
  source: string | null;
  data: Record<string, unknown>;
  status: CrmLeadStatus;
  assignedTo: CrmAssignee | null;
  createdAt: string;
}

export interface AdminLeadsListResponse {
  data: AdminLead[];
  total: number;
  page: number;
  limit: number;
  stats: {
    total: number;
    unassigned: number;
    new: number;
    followUp: number;
    siteVisit: number;
    won: number;
    contacted: number;
    negotiation: number;
    lost: number;
  };
}

export interface AdminLeadsMeta {
  organisations: AdminLeadOrganisation[];
  sources: string[];
  statuses: CrmLeadStatus[];
}

export interface AdminLeadsParams {
  page?: number;
  limit?: number;
  orgId?: string;
  projectId?: string;
  status?: CrmLeadStatus;
  source?: string;
  search?: string;
}

/** GET /admin/platform-config — Super Admin platform subdomain / DNS + billing policy. */
export interface PlatformConfig {
  id: string | null;
  subdomainMode: string; // localhost | production
  subdomainBase: string | null; // e.g. "ipixxel.ae"
  dnsMode: string; // a | cname | ns
  infraIp: string | null; // AWS origin IPv4 (for the wildcard A record)
  infraIpv6: string | null;
  infraCname: string | null;
  infraNs1: string | null;
  infraNs2: string | null;
  // Subscription expiry & grace-period policy (Super Admin configurable —
  // read by the expiry sweep that drains subscriptions into past_due/expired).
  billingExpiryNotifyDays: number; // days before renewsAt the "expiring soon" popup fires
  billingGracePeriodDays: number; // days a past_due subscription stays usable
  billingExpiryBehavior: "restrict" | "cancel"; // what happens after the grace window
  billingExpiryMessage: string; // popup body for expiring / past-due events
  primaryColor?: string; // global primary brand color (HEX)
  secondaryColor?: string; // global secondary accent color (HEX)
  updatedAt: string | null;
}

export interface UpdatePlatformConfigInput {
  subdomainMode?: "localhost" | "production";
  subdomainBase?: string;
  dnsMode?: "a" | "cname" | "ns";
  infraIp?: string;
  infraIpv6?: string;
  infraCname?: string;
  infraNs1?: string;
  infraNs2?: string;
  billingExpiryNotifyDays?: number;
  billingGracePeriodDays?: number;
  billingExpiryBehavior?: "restrict" | "cancel";
  billingExpiryMessage?: string;
  primaryColor?: string;
  secondaryColor?: string;
}

export interface PlatformTheme {
  primaryColor: string;
  secondaryColor: string;
}

/** GET /admin/org-domain-requests/:id/verify — live DNS + site check for an org custom domain. */
export interface DomainVerifyResult {
  id: string;
  customDomain: string;
  host: string;
  dnsMode: string;
  expectedIp: string | null;
  organisation: {
    id: string;
    name: string;
    slug: string;
    status: string;
  };
  dns: {
    status: "ok" | "mismatch" | "unresolved";
    hostIps: string[];
    expectedIp: string | null;
  };
  landingPage: {
    id: string;
    slug: string;
    name: string;
    status: string;
  } | null;
  live: boolean;
}

// --- In-app notifications (Super Admin bell) ---

export type NotificationType =
  | "organisation_registration"
  | "custom_domain_request"
  | "organisation_approved"
  | "organisation_rejected"
  | "support_ticket_created"
  | "support_ticket_message"
  | "support_ticket_status_changed"
  | "support_ticket_assigned"
  | "subscription_expiring"
  | "subscription_past_due"
  | "subscription_expired"
  | "team_chat_mention";

/** True when the notification is a subscription-lifecycle popup. */
export function isSubscriptionNotification(type: NotificationType): boolean {
  return (
    type === "subscription_expiring" ||
    type === "subscription_past_due" ||
    type === "subscription_expired"
  );
}

export interface AppNotification {
  id: string;
  orgId: string | null;
  recipientId: string | null;
  type: NotificationType;
  title: string;
  body: string | null;
  entity: string | null;
  entityId: string | null;
  readAt: string | null;
  createdAt: string;
  organisation: {
    id: string;
    name: string;
    slug: string;
    subdomain: string | null;
  } | null;
}

export interface NotificationsListResponse {
  data: AppNotification[];
  total: number;
  page: number;
  limit: number;
}

export interface UnreadNotificationsResponse {
  count: number;
}

/** An org member's own bell notification (GET /org/notifications). Same
 *  shape as the Super Admin's AppNotification, minus the org-summary field
 *  (every row already belongs to the viewer's own org). */
export interface OrgNotification {
  id: string;
  orgId: string | null;
  recipientId: string | null;
  type: NotificationType;
  title: string;
  body: string | null;
  entity: string | null;
  entityId: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface OrgNotificationsListResponse {
  data: OrgNotification[];
  total: number;
  page: number;
  limit: number;
}

// --- Support tickets ---------------------------------------------------

export type SupportTicketStatus = "open" | "ongoing" | "on_hold" | "resolved";
export type SupportTicketPriority = "normal" | "high" | "urgent";
export type SupportTicketCategory =
  | "Billing"
  | "Calling"
  | "WhatsApp"
  | "Leads"
  | "Projects"
  | "Other";

export interface SupportTicketActor {
  id: string;
  name: string;
  email: string;
}

/** One row of the tickets list — org's own (GET /org/support) or every org's
 *  (GET /admin/support). `organisation` is present only from the admin
 *  endpoint. */
export interface SupportTicketSummary {
  id: string;
  number: number;
  /** Display code, e.g. "SR-14". */
  code: string;
  subject: string;
  category: string;
  priority: SupportTicketPriority;
  status: SupportTicketStatus;
  raisedBy: SupportTicketActor;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  /** True while an unread notification for this ticket still exists for the
   *  viewer — drives the list's "new activity" dot. Clears once the ticket
   *  is opened (or its bell notification is marked read). */
  hasUnread: boolean;
  /** Only meaningful while status is "on_hold" — the reason a Super Admin
   *  gave when pausing it, shown behind the list's info tooltip. */
  holdReason: string | null;
  organisation?: { id: string; name: string };
  /** Support Management (admin) only — the Platform Team member this ticket
   *  is assigned to, if any. A non-super-admin viewer's list is already
   *  server-scoped to their own assigned tickets (see getAdminSupportTickets). */
  assignedTo?: SupportTicketActor | null;
}

export interface SupportTicketsListResponse {
  data: SupportTicketSummary[];
  total: number;
  page: number;
  limit: number;
  /** Counts over every ticket matching the filters (all pages). */
  stats?: { open: number; ongoing: number; highPriority: number };
}

export interface SupportMessage {
  id: string;
  ticketId: string;
  body: string;
  attachmentUrls: string[];
  createdAt: string;
  sender: SupportTicketActor;
  /** "org" = the ticket's own organisation, "platform" = the iPixxel team —
   *  derived server-side from the sender's own org membership. */
  side: "org" | "platform";
}

export interface SupportTicketDetail {
  id: string;
  number: number;
  code: string;
  orgId: string;
  organisation: { id: string; name: string };
  subject: string;
  category: string;
  priority: SupportTicketPriority;
  status: SupportTicketStatus;
  raisedBy: SupportTicketActor;
  closedBy: SupportTicketActor | null;
  closedAt: string | null;
  /** Only meaningful while status is "on_hold" — see SupportTicketSummary. */
  holdReason: string | null;
  heldBy: SupportTicketActor | null;
  heldAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** Support Management (admin) only — see SupportTicketSummary. */
  assignedTo?: SupportTicketActor | null;
}

export interface SupportTicketDetailResponse {
  ticket: SupportTicketDetail;
  messages: SupportMessage[];
}

export interface CreateSupportTicketInput {
  subject: string;
  category: SupportTicketCategory;
  priority?: SupportTicketPriority;
  message: string;
  attachmentUrls?: string[];
}

export interface CreateSupportMessageInput {
  body: string;
  attachmentUrls?: string[];
}

export interface HoldSupportTicketInput {
  reason: string;
}

/** null unassigns the ticket. */
export interface AssignSupportTicketInput {
  assigneeId: string | null;
}

export interface ListSupportTicketsParams {
  page?: number;
  limit?: number;
  status?: SupportTicketStatus;
  search?: string;
  /** Support Management (admin) only. */
  orgId?: string;
}

// --- Super Admin SMTP Email Configuration & Logs ---

export interface SmtpConfig {
  id: string | null;
  orgId?: string | null;
  usingPlatformFallback?: boolean;
  platformConfigured?: boolean;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password?: string;
  hasPassword?: boolean;
  fromEmail: string;
  fromName: string;
  replyTo?: string | null;
  isActive: boolean;
  inviteSubject?: string | null;
  inviteBody?: string | null;
  resetSubject?: string | null;
  resetBody?: string | null;
  accountActivatedSubject?: string | null;
  accountActivatedBody?: string | null;
  accountDeactivatedSubject?: string | null;
  accountDeactivatedBody?: string | null;
  updatedAt?: string;
}

export interface UpdateSmtpConfigInput {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  password?: string;
  fromEmail: string;
  fromName: string;
  replyTo?: string;
  isActive?: boolean;
  inviteSubject?: string;
  inviteBody?: string;
  resetSubject?: string;
  resetBody?: string;
  accountActivatedSubject?: string;
  accountActivatedBody?: string;
  accountDeactivatedSubject?: string;
  accountDeactivatedBody?: string;
}

export interface SendTestEmailInput {
  to: string;
  subject?: string;
}

export interface EmailLogEntry {
  id: string;
  to: string;
  subject: string;
  template: string | null;
  status: "sent" | "failed";
  error: string | null;
  metadata?: any;
  sentAt: string;
}

export interface EmailLogsResponse {
  data: EmailLogEntry[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface EmailStatsResponse {
  totalSent: number;
  totalFailed: number;
  totalDispatched: number;
  lastDispatchedAt: string | null;
}

// --- Super Admin Dashboard Data Types ---

export interface AdminDashboardStats {
  totalOrgs: number;
  activeOrgs: number;
  newOrgsThisMonth: number;
  newOrgsLastMonth: number;
  activeSubscriptions: number;
  paidPercentage: number;
  platformMrr: number;
  platformMrrLakhs: number;
  templatesLive: number;
  templatesTotal: number;
  pendingTemplatesCount: number;
}

export interface AdminDashboardRevenueMonth {
  m: string;
  mrr: number;
  total: number;
  h: string;
  g: string;
}

export interface AdminDashboardOrgRow {
  id: string;
  name: string;
  sm: string;
  av: string;
  tone: string;
  plan: string;
  planTxt: string;
  users: number;
  status: string;
  statusTxt: string;
  joined: string;
}

export interface AdminDashboardPendingRequest {
  id: string;
  name: string;
  amt: string;
  desc: string;
  orgId: string;
  status: string;
}

export interface AdminDashboardResponse {
  stats: AdminDashboardStats;
  revenueTimeline: AdminDashboardRevenueMonth[];
  recentOrganisations: AdminDashboardOrgRow[];
  pendingRequests: AdminDashboardPendingRequest[];
}

// --- Teams (org/teams) -------------------------------------------------
// Per-member seniority label — its own namespace, unrelated to the org-wide
// Role/RBAC system (see OrgUserRole). "telecaller" exists independently in
// both by coincidence only.
export type TeamMemberRoleValue =
  | "team_lead"
  | "sr_agent"
  | "sales_agent"
  | "telecaller"
  | "viewer";

export interface TeamLeadSummary {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  name: string;
}

export interface TeamMemberPreview {
  id: string;
  name: string;
}

export type TeamStatus = "active" | "inactive";

export interface Team {
  id: string;
  orgId: string;
  name: string;
  status: TeamStatus;
  region: string | null;
  workingHours: string | null;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  teamLead: TeamLeadSummary | null;
  memberCount: number;
  projectCount: number;
  memberPreviews: TeamMemberPreview[];
  /** Real, derived from Lead.assignedToId + status — not yet won/lost. */
  activeLeads: number;
  /** Real: won ÷ (won + lost) among this team's members' leads, rounded. */
  conversionPct: number;
}

export interface TeamMemberRow {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  name: string;
  role: TeamMemberRoleValue;
  joinedAt: string;
  activeLeads: number;
  conversionPct: number;
}

export interface TeamProjectRow {
  id: string;
  name: string;
  assignedAt: string;
}

export interface TeamDetail extends Team {
  members: TeamMemberRow[];
  projects: TeamProjectRow[];
}

export interface CreateTeamInput {
  name: string;
  teamLeadId?: string;
  region?: string;
  workingHours?: string;
  description?: string;
}

export interface UpdateTeamInput {
  name?: string;
  status?: TeamStatus;
  teamLeadId?: string | null;
  region?: string | null;
  workingHours?: string | null;
  description?: string | null;
}

export interface SetTeamMembersInput {
  userId: string;
  role: TeamMemberRoleValue;
}

// Team Chat types live in lib/team-chat/types.ts.

export interface AvailableTemplateSummary extends OrgTemplateSummary {
  isAssigned: boolean;
  isLocked?: boolean;
  lockReason?: string | null;
  /** Ids of the active subscription plans that unlock this template. */
  planIds?: string[];
}

export interface AvailableTemplatesResponse {
  data: AvailableTemplateSummary[];
  assignedCount: number;
  maxAllowed: number | null;
  remainingQuota: number | null;
  planName: string;
  /** Active subscription plans, cheapest first — the plan filter options. */
  plans?: { id: string; name: string }[];
  /** Every template category the super admin has created, A–Z. */
  categories?: string[];
}

// --- Media Library --------------------------------------------------------

export interface MediaFileItem {
  id: string;
  orgId: string | null;
  uploadedById: string | null;
  name: string;
  filename: string;
  storedKey: string;
  publicUrl: string;
  mimeType: string;
  size: number;
  category: 'image' | 'video' | 'document' | 'icon' | 'logo' | 'audio' | string;
  folder: string;
  alt?: string | null;
  tags: string[];
  metadata: Record<string, any> | null;
  createdAt: string;
  updatedAt: string;
  organisation?: {
    id: string;
    name: string;
    slug: string;
    logoUrl: string | null;
  } | null;
  uploadedBy?: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
  } | null;
}

export interface MediaListResponse {
  items: MediaFileItem[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface MediaStatsResponse {
  totalFiles: number;
  totalBytes: number;
  totalFormatted: string;
  categoryBreakdown: Record<string, { count: number; bytes: number }>;
  folders: string[];
  totalOrgs?: number;
  topOrgs?: {
    id: string;
    name: string;
    slug: string;
    logoUrl: string | null;
    bytes: number;
    formatted: string;
  }[];
}

export interface CreateMediaUploadUrlInput {
  field?: string;
  filename: string;
  contentType: string;
  size: number;
  folder?: string;
  category?: string;
}

export interface CreateMediaUploadUrlResult {
  uploadUrl: string;
  publicUrl: string;
  key: string;
  expiresIn: number;
  category: string;
  suggestedFolder: string;
}

export interface RegisterMediaInput {
  name: string;
  filename: string;
  storedKey: string;
  publicUrl: string;
  mimeType: string;
  size: number;
  category?: string;
  folder?: string;
  alt?: string;
  tags?: string[];
  metadata?: Record<string, any>;
}

export interface UpdateMediaInput {
  name?: string;
  folder?: string;
  alt?: string;
  tags?: string[];
  metadata?: Record<string, any>;
}

// --- Reports & Analytics --------------------------------------------------

export interface ReportsFilterInput {
  preset?: string;
  startDate?: string;
  endDate?: string;
  projectId?: string;
  agentId?: string;
  source?: string;
  orgId?: string;
}

export interface ReportsSummary {
  totalLeads: number;
  wonCount: number;
  winRate: number;
  totalWonRevenue: number;
  activePipelineCount: number;
  totalCalls: number;
  totalTalkTimeMins: number;
  totalUnits: number;
  bookedUnits: number;
  totalOrgs?: number;
  totalLandingPages?: number;
  totalSupportTickets?: number;
}

export interface LeadSourceStat {
  source: string;
  count: number;
  percentage: number;
}

export interface FunnelStageStat {
  stage: string;
  label: string;
  count: number;
}

export interface AgentPerformanceStat {
  agentId: string;
  name: string;
  email: string;
  assignedLeads: number;
  callsMade: number;
  wonCount: number;
  totalRevenue: number;
  conversionRate: number;
}

export interface ProjectAnalyticsStat {
  projectId: string;
  name: string;
  city: string | null;
  totalUnits: number;
  availableUnits: number;
  bookedUnits: number;
  soldUnits: number;
  totalLeads: number;
  wonLeadsCount: number;
  revenueBooked: number;
}



/**
 * An org's project type: a name and two typed field templates. There is no
 * fixed layout — which inventory controls a project has is derived from
 * which role fields `unitFields` carries.
 */
export interface OrgProjectType {
  id: string;
  orgId: string;
  name: string;
  projectFields: FieldDef[];
  unitFields: FieldDef[];
  sortOrder: number;
  /** Projects already using this type. */
  inUse: number;
}

export interface OrgProjectTypeInput {
  name?: string;
  projectFields?: unknown[];
  unitFields?: unknown[];
  sortOrder?: number;
}

/** Platform Organisation Labels for lead attribution (Super Admin catalog). */
export interface AttributionLabel {
  id: string;
  key: string;
  label: string;
  sortOrder: number;
  enabled?: boolean;
}

export interface MetaPublicConfig {
  configured: boolean;
  appId: string | null;
  webhookCallbackUrl: string;
  oauthRedirectUri: string;
}

export interface MarketingCredentials {
  metaAppId: string;
  metaAppSecret: string;
  metaWebhookVerifyToken: string;
  googleClientId?: string;
  googleClientSecret?: string;
  googleAdsClientId: string;
  googleAdsClientSecret: string;
  googleAdsDeveloperToken: string;
  metaConfigured: boolean;
  googleAuthConfigured?: boolean;
  googleAdsConfigured: boolean;
}

export interface MetaPageConnection {
  id: string;
  orgId: string;
  pageId: string;
  pageName: string;
  projectId: string | null;
  connectedAt: string;
  updatedAt: string;
  project?: { id: string; name: string } | null;
}

export interface MarketingConnection {
  id: string;
  orgId: string;
  platformKey: string;
  status: string;
  externalAccountId: string;
  externalAccountName: string;
  projectId: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
  connectedAt: string;
  updatedAt: string;
  metadata?: Record<string, any> | null;
  project?: { id: string; name: string } | null;
}

export interface MarketingPlatformCard {
  key: string;
  name: string;
  description: string | null;
  supportsOAuth: boolean;
  supportsWebhook: boolean;
  ready: boolean;
  category?: string;
  configured?: boolean;
  connections: MarketingConnection[];
  connectionCount: number;
  lastSyncAt: string | null;
  status: string;
  metrics?: {
    leadsCount: number;
    spend: number;
    clicks: number;
    impressions: number;
    conversionRate: number;
    sessions?: number;
  };
}

export interface MarketingAppsOverview {
  kpis: {
    connectedApps: number;
    newConnectionsThisMonth: number;
    totalLeads: number;
    spend: number;
    clicks: number;
    impressions: number;
    conversionRate: number;
  };
  platforms: MarketingPlatformCard[];
  webhookUrl?: string;
}

export interface MarketingDashboard {
  kpis: {
    totalLeads: number;
    convertedLeads: number;
    spend: number;
    clicks: number;
    impressions: number;
    cpl: number;
    conversionRate: number;
    revenue: number;
    totalLeadsChange?: number;
    convertedChange?: number;
    spendChange?: number;
    clicksChange?: number;
    impressionsChange?: number;
    cplChange?: number;
    conversionChange?: number;
  };
  leadsByPlatform: Array<{ key: string; label: string; count: number }>;
  leadsBySource: Array<{ key: string; label: string; count: number }>;
  leadsByCampaign: Array<{ key: string; label: string; count: number }>;
  leadsByAd: Array<{ key: string; label: string; count: number }>;
  leadTrend?: Array<{ date: string; count: number }>;
  connectedApps?: Array<{
    key: string;
    name: string;
    status: string;
    ready: boolean;
    connectionCount: number;
    lastSyncAt: string | null;
  }>;
  campaignPerformance: Array<{
    id: string;
    name: string;
    platformKey: string;
    status: string | null;
    spend: number;
    impressions: number;
    clicks: number;
    leadsCount: number;
    cpl: number;
    conversion?: number;
  }>;
  topCampaigns?: Array<{
    id: string;
    name: string;
    platformKey: string;
    leadsCount: number;
    cpl: number;
    conversion: number;
  }>;
}

export interface MarketingPlatformAdmin {
  id: string;
  key: string;
  name: string;
  description: string | null;
  sortOrder: number;
  enabled: boolean;
  supportsOAuth: boolean;
  supportsWebhook: boolean;
}

export interface MarketingSyncLog {
  id: string;
  orgId: string | null;
  connectionId: string | null;
  platformKey: string;
  direction: string;
  status: string;
  message: string | null;
  createdAt: string;
}

export interface GoogleAuthConfig {
  enabled: boolean;
  clientId: string | null;
}

export interface GoogleAuthInput {
  credential?: string;
  code?: string;
  redirectUri?: string;
  mode?: "login" | "register";
  portal?: "organisation" | "platform";
  country?: string;
  phoneNumber?: string;
  firstName?: string;
  lastName?: string;
  host?: string;
}

export type GoogleAuthResponse =
  | {
      status: "authenticated";
      user: SafeUser;
      roles: string[];
      access_token: string;
      refresh_token: string;
      token_type?: string;
      expires_in?: number;
      onboarding_incomplete: false;
      googleUser?: {
        email: string;
        firstName: string;
        lastName: string;
        picture?: string;
      };
    }
  | {
      status: "exists_incomplete";
      user: SafeUser;
      roles: string[];
      access_token: string;
      refresh_token: string;
      token_type?: string;
      expires_in?: number;
      onboarding_incomplete: true;
      onboardingStep: OnboardingStep;
      existingUserId?: string;
      firstName?: string;
      lastName?: string;
    }
  | {
      status: "created";
      user: SafeUser;
      access_token: string;
      refresh_token: string;
      token_type?: string;
      expires_in?: number;
      onboardingStep: OnboardingStep;
      nextStep?: OnboardingStep;
      email_verification_required: boolean;
      googleUser?: {
        email: string;
        firstName: string;
        lastName: string;
        picture?: string;
      };
    }
  | {
      status: "exists_completed";
      email: string;
      message: string;
    }
  | {
      status: "not_found";
      email: string;
      firstName: string;
      lastName: string;
      picture?: string;
      message: string;
    }
  | {
      status: "needs_profile";
      email: string;
      firstName: string;
      lastName: string;
      picture?: string;
      googleVerified: true;
      googleToken?: string;
    };

