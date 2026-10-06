import type {
  AgentPerformanceStat,
  FunnelStageStat,
  LeadSourceStat,
  ProjectAnalyticsStat,
  ReportsFilterInput,
  ReportsSummary,
  CreateMediaUploadUrlInput,
  CreateMediaUploadUrlResult,
  MediaFileItem,
  MediaListResponse,
  MediaStatsResponse,
  RegisterMediaInput,
  UpdateMediaInput,
  AdminAuditLogsExportResponse,
  AdminAuditLogsListResponse,
  AdminAuditLogsMeta,
  AdminAuditLogsParams,
  AdminOrgDomainRequestListResponse,
  ApiErrorBody,
  AssignLeadInput,
  AuthTokens,
  ChangePasswordInput,
  ChangePlanInput,
  ChangePlanResult,
  BillingRenewResult,
  CreateOrgCatalogOptionInput,
  CrmAssignee,
  CrmAssignableResponse,
  ProjectAssigneeCandidatesResponse,
  CrmLead,
  CrmLeadListResponse,
  InvoiceRow,
  LeadSubmission,
  LogoUploadUrlResult,
  NotificationsListResponse,
  OrgNotificationsListResponse,
  CreateSupportTicketInput,
  CreateSupportMessageInput,
  HoldSupportTicketInput,
  AssignSupportTicketInput,
  ListSupportTicketsParams,
  SupportMessage,
  SupportTicketDetailResponse,
  SupportTicketsListResponse,
  OrgCatalogCategory,
  LandingPageRow,
  OrgCatalogOption,
  OrgProjectType,
  OrgProjectTypeInput,
  OrgLeadStageDisplay,
  UpdateLeadStageDisplayInput,
  CrmLeadStatus,
  OrgLandingPagesListResponse,
  OrgBillingSummary,
  PackageChangeRequestRow,
  PackageChangeRequestsListResponse,
  OrgUnitsListResponse,
  Unit,
  CreateUnitInput,
  UpdateUnitInput,
  UnitStatus,
  ProjectSalesAgent,
  GoogleAuthConfig,
  GoogleAuthInput,
  GoogleAuthResponse,
  OnboardingAccountInput,
  OnboardingOrganisationInput,
  OrgDomainInfo,
  OrganisationStepResponse,
  Plan,
  PlanCapability,
  RequestCustomDomainInput,
  AssignCustomDomainInput,
  ResolveDraftInput,
  ResumeSignupResponse,
  ReviewOrgDomainRequestInput,
  SalesAgentDetailResponse,
  OrgUserDashboardResponse,
  SalesAgentsListResponse,
  SignupStep1Response,
  UnreadNotificationsResponse,
  UpdateOrgCatalogOptionInput,
  UserProfile,
  SmtpConfig,
  UpdateSmtpConfigInput,
  SendTestEmailInput,
  EmailLogsResponse,
  EmailStatsResponse,
  AdminDashboardResponse,
  PlatformConfig,
  UpdatePlatformConfigInput,
  PlatformTheme,
  DomainVerifyResult,
  PlatformTeamMember,
  PlatformTeamRole,
  DynamicRole,
  Permissions,
  Team,
  TeamDetail,
  CreateTeamInput,
  UpdateTeamInput,
  SetTeamMembersInput,
  TeamMemberRow,
  TeamProjectRow,
  CreateOrgUserInput,
  OrgUser,
  TeamChatOverview,
  TeamChatDetail,
  TeamChatChannelSummary,
  TeamChatMessage,
  CreateTeamChannelInput,
  CreateTeamMessageInput,
  LeadFormRecord,
  CreateFormInput,
  UpdateFormInput,
  LeadImportResult,
} from "./types";
import type { LeadImportRow } from "./lead-import";
import { getStoredAttribution } from "./openpage/form-runtime";

const API_BASE = "/api";

const ACCESS_TOKEN_KEY = "be.access_token";
const REFRESH_TOKEN_KEY = "be.refresh_token";
const USER_KEY = "be.user";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: ApiErrorBody,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function errorMessage(body: ApiErrorBody | null, status: number): string {
  if (body?.message) {
    return Array.isArray(body.message) ? body.message.join(", ") : body.message;
  }
  if (body?.error) {
    return body.error;
  }
  return `Request failed with status ${status}`;
}

function readTokens(): {
  accessToken: string | null;
  refreshToken: string | null;
} {
  if (typeof window === "undefined") {
    return { accessToken: null, refreshToken: null };
  }
  return {
    accessToken: localStorage.getItem(ACCESS_TOKEN_KEY),
    refreshToken: localStorage.getItem(REFRESH_TOKEN_KEY),
  };
}

let refreshPromise: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const { refreshToken } = readTokens();
    if (!refreshToken || refreshToken.startsWith("mock-")) return false;

    try {
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
      if (!res.ok) return false;
      const tokens = (await res.json()) as AuthTokens;
      localStorage.setItem(ACCESS_TOKEN_KEY, tokens.access_token);
      localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refresh_token);
      return true;
    } catch {
      return false;
    }
  })();

  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

function clearSession() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

// Backend guards on /org/* and /admin/* dashboard routes re-check status from
// the DB on every request:
//   - ORG_INACTIVE  — a Super Admin deactivated the whole organisation.
//   - USER_INACTIVE — this member was disapproved/deactivated, or their
//     access token predates an admin password reset / session invalidation.
//     Raised for organisation members (OrgApprovedGuard) AND Platform Team
//     members (SuperAdminGuard) alike.
// Either way the member's very next action gets a tagged 403 — end the
// session and bounce to the right login straight away rather than leaving a
// half-dead portal open.
let forcedLogoutInFlight = false;
function forceSessionEnd(reason: "org_inactive" | "account_revoked") {
  if (typeof window === "undefined" || forcedLogoutInFlight) return;

  let isOrganisationSession = false;
  try {
    const user = JSON.parse(localStorage.getItem(USER_KEY) ?? "null") as {
      org_id?: string | null;
    } | null;
    isOrganisationSession = Boolean(user?.org_id);
  } catch {
    isOrganisationSession = false;
  }

  // A Platform Team / Super Admin session has no org_id and signs in on a
  // separate route. ORG_INACTIVE is an organisation-only concept, so ignore
  // it for a platform session; account_revoked (USER_INACTIVE) applies to
  // both and sends the platform session back to /admin-login.
  if (!isOrganisationSession && reason === "org_inactive") return;
  const loginPath = isOrganisationSession ? "/login" : "/admin-login";

  const path = window.location.pathname;
  if (
    path === "/login" ||
    path.startsWith("/admin-login") ||
    path.startsWith("/register") ||
    path.startsWith("/verify-email") ||
    path.startsWith("/forgot-password") ||
    path.startsWith("/reset-password") ||
    path.startsWith("/change-password") ||
    path.startsWith("/onboarding")
  ) {
    return;
  }
  clearSession();
  forcedLogoutInFlight = true;
  // Hard replace (not router.push): a full reload resets every bit of
  // in-memory auth/React state, and replace() keeps the dead portal page
  // out of history.
  window.location.replace(`${loginPath}?reason=${reason}`);
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  retried = false,
): Promise<T> {
  const { accessToken } = readTokens();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  const skipRefresh =
    path === "/auth/login" ||
    path === "/auth/google" ||
    path === "/auth/signup/step1" ||
    path.startsWith("/auth/signup/step1/") ||
    path.startsWith("/auth/forgot-password") ||
    path.startsWith("/auth/reset-password") ||
    path.startsWith("/auth/verify-email") ||
    path.startsWith("/auth/resend-verification") ||
    path.startsWith("/auth/resume-signup");
  if (res.status === 401 && !retried && !skipRefresh) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      return apiFetch<T>(path, options, true);
    }
    clearSession();
  }

  const contentType = res.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json")
    ? await res.json()
    : null;

  if (res.status === 403 && !path.startsWith("/auth/")) {
    const tag = (body as ApiErrorBody | null)?.error;
    if (tag === "ORG_INACTIVE") {
      forceSessionEnd("org_inactive");
    } else if (tag === "USER_INACTIVE") {
      forceSessionEnd("account_revoked");
    }
  }

  if (!res.ok) {
    throw new ApiError(errorMessage(body, res.status), res.status, body);
  }

  return body as T;
}

export async function getProfile(): Promise<UserProfile> {
  return apiFetch<UserProfile>("/auth/me");
}

export async function changePassword(
  input: ChangePasswordInput,
): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>("/auth/change-password", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function getPlans(): Promise<Plan[]> {
  return apiFetch<Plan[]>("/plans");
}

/** Canonical plan capability catalog (Super Admin). Single source of truth —
 *  the plan editor and comparison matrix render from this. */
export async function getPlanCapabilities(): Promise<PlanCapability[]> {
  return apiFetch<PlanCapability[]>("/admin/plans/capabilities");
}

// --- Signup wizard (resumable, step-wise) ---

export async function signupStep1(
  input: OnboardingAccountInput,
): Promise<SignupStep1Response> {
  return apiFetch<SignupStep1Response>("/auth/signup/step1", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function resumeSignup(
  email: string,
): Promise<ResumeSignupResponse> {
  return apiFetch<ResumeSignupResponse>("/auth/resume-signup", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

// "You already started this" popup, "Continue previous setup" — read-only
// fetch of the draft as it was actually saved (not whatever was just
// retyped on the collision attempt), so Step 1 can be prefilled with it for
// review before the person re-submits.
export async function previewDraft(
  input: { existingUserId: string },
): Promise<ResumeSignupResponse> {
  return apiFetch<ResumeSignupResponse>("/auth/signup/step1/preview", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

// Step 1 re-submit for an already-resumed draft — either "Continue previous
// setup" 's downstream re-submit, or "start fresh"'s complement — both
// carrying whatever was just retyped on Step 1.
export async function resumeExistingDraft(
  input: ResolveDraftInput,
): Promise<ResumeSignupResponse> {
  return apiFetch<ResumeSignupResponse>("/auth/signup/step1/resume", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function restartExistingDraft(
  input: { existingUserId: string },
): Promise<{ status: "restarted" }> {
  return apiFetch<{ status: "restarted" }>("/auth/signup/step1/restart", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function createOrganisationStep(
  input: OnboardingOrganisationInput,
): Promise<OrganisationStepResponse> {
  return apiFetch<OrganisationStepResponse>("/auth/signup/organisation", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function verifyEmail(
  email: string,
  code: string,
): Promise<{ success: boolean; alreadyVerified?: boolean }> {
  return apiFetch("/auth/verify-email", {
    method: "POST",
    body: JSON.stringify({ email, code }),
  });
}

export async function resendVerification(
  email: string,
): Promise<{ success: boolean }> {
  return apiFetch("/auth/resend-verification", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export async function validateResetToken(
  token: string,
): Promise<{ valid: boolean }> {
  return apiFetch<{ valid: boolean }>(
    `/auth/reset-password/validate?token=${encodeURIComponent(token)}`,
  );
}

export async function getInvoices(): Promise<InvoiceRow[]> {
  return apiFetch<InvoiceRow[]>("/org/billing/invoices");
}

export async function getOrgBilling(): Promise<OrgBillingSummary> {
  return apiFetch<OrgBillingSummary>("/org/billing");
}

/** Scope mirrors the backend split: "org" hits /org/forms (JWT orgId), "admin"
 *  hits /admin/forms (Super Admin platform-owned forms). Auth separation is
 *  enforced server-side. */
export type FormScope = "org" | "admin";

function formPath(scope: FormScope): string {
  return scope === "org" ? "/org/forms" : "/admin/forms";
}

export async function listForms(scope: FormScope): Promise<LeadFormRecord[]> {
  return apiFetch<LeadFormRecord[]>(formPath(scope));
}

export async function getForm(scope: FormScope, id: string): Promise<LeadFormRecord> {
  return apiFetch<LeadFormRecord>(`${formPath(scope)}/${id}`);
}

export async function createForm(scope: FormScope, input: CreateFormInput): Promise<LeadFormRecord> {
  return apiFetch<LeadFormRecord>(formPath(scope), {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateForm(scope: FormScope, id: string, input: UpdateFormInput): Promise<LeadFormRecord> {
  return apiFetch<LeadFormRecord>(`${formPath(scope)}/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function duplicateForm(scope: FormScope, id: string): Promise<LeadFormRecord> {
  return apiFetch<LeadFormRecord>(`${formPath(scope)}/${id}/duplicate`, {
    method: "POST",
  });
}

export async function deleteForm(scope: FormScope, id: string): Promise<{ deleted: boolean }> {
  return apiFetch<{ deleted: boolean }>(`${formPath(scope)}/${id}`, {
    method: "DELETE",
  });
}

export async function changePlan(
  input: ChangePlanInput,
): Promise<ChangePlanResult> {
  return apiFetch<ChangePlanResult>("/org/billing/plan", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function renewSubscription(): Promise<BillingRenewResult> {
  return apiFetch<BillingRenewResult>("/org/billing/renew", {
    method: "POST",
  });
}

// --- Package Change Requests (Org Admin & Super Admin) ---

export async function getOrgPackageChangeRequest(): Promise<{
  pendingRequest: PackageChangeRequestRow | null;
  history: PackageChangeRequestRow[];
}> {
  return apiFetch<{
    pendingRequest: PackageChangeRequestRow | null;
    history: PackageChangeRequestRow[];
  }>(
    "/org/billing/package-change-request",
  );
}

export async function submitPackageChangeRequest(input: {
  targetPlanId: string;
  billingCycle?: "monthly" | "yearly";
}): Promise<PackageChangeRequestRow> {
  const response = await apiFetch<
    { request: PackageChangeRequestRow } | PackageChangeRequestRow
  >("/org/billing/package-change-request", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return "request" in response ? response.request : response;
}

export async function cancelPackageChangeRequest(
  id: string,
): Promise<{ success: boolean; message: string }> {
  return apiFetch<{ success: boolean; message: string }>(
    `/org/billing/package-change-request/${id}/cancel`,
    {
      method: "POST",
    },
  );
}

export async function getAdminPackageChangeRequests(params?: {
  status?: string;
  search?: string;
  page?: number;
  limit?: number;
}): Promise<PackageChangeRequestsListResponse> {
  const q = new URLSearchParams();
  if (params?.status) q.set("status", params.status);
  if (params?.search) q.set("search", params.search);
  if (params?.page) q.set("page", String(params.page));
  if (params?.limit) q.set("limit", String(params.limit));
  const s = q.toString();
  return apiFetch<PackageChangeRequestsListResponse>(
    `/admin/package-change-requests${s ? `?${s}` : ""}`,
  );
}

export async function approvePackageChangeRequest(
  id: string,
): Promise<{ success: boolean; message: string }> {
  return apiFetch<{ success: boolean; message: string }>(
    `/admin/package-change-requests/${id}/approve`,
    {
      method: "POST",
    },
  );
}

export async function rejectPackageChangeRequest(
  id: string,
  rejectionReason?: string,
): Promise<{ success: boolean; message: string }> {
  return apiFetch<{ success: boolean; message: string }>(
    `/admin/package-change-requests/${id}/reject`,
    {
      method: "POST",
      body: JSON.stringify({ rejectionReason }),
    },
  );
}

export async function submitLead(input: LeadSubmission): Promise<void> {
  const projectId =
    typeof input.projectId === "string" && input.projectId.trim()
      ? input.projectId.trim()
      : undefined;
  const unitId =
    typeof input.unitId === "string" && input.unitId.trim() ? input.unitId.trim() : undefined;

  let pathSlug = input.slug?.trim();
  if (!pathSlug && typeof window !== "undefined") {
    const rawPath = window.location.pathname
      .replace(/^\/p\//, "")
      .replace(/^\//, "")
      .replace(/\/thank-you$/, "")
      .replace(/-thank-you$/, "");
    if (rawPath && !rawPath.startsWith("org") && !rawPath.startsWith("admin")) {
      pathSlug = rawPath;
    }
  }

  await apiFetch("/org/leads", {
    method: "POST",
    body: JSON.stringify({
      landingPageId: input.landingPageId,
      ...(pathSlug ? { slug: pathSlug } : {}),
      ...(projectId ? { projectId } : {}),
      ...(unitId ? { unitId } : {}),
      formName: input.formName,
      source: input.source,
      data: {
        ...(input.fields ?? {}),
        ...(typeof window !== "undefined" ? getStoredAttribution() : {}),
      },
    }),
  });
}

// --- CRM leads (org-scoped inbox, role-aware) ---

export async function createCrmLead(input: {
  projectId?: string;
  unitId?: string;
  assignedToId?: string;
  formName?: string;
  source?: string;
  data: Record<string, unknown>;
}): Promise<CrmLead> {
  return apiFetch<CrmLead>("/org/leads/manual", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/** Bulk-create leads from parsed CSV rows; invalid rows are skipped server-side. */
/** `target` is the project or standalone unit every row is imported into. */
export async function importCrmLeads(
  target: { projectId?: string; unitId?: string },
  rows: LeadImportRow[],
): Promise<LeadImportResult> {
  return apiFetch<LeadImportResult>("/org/leads/import", {
    method: "POST",
    body: JSON.stringify({ ...target, rows }),
  });
}

export async function getCrmLeads(
  params?: import("./types").GetCrmLeadsParams,
): Promise<CrmLeadListResponse> {
  const q = new URLSearchParams();
  if (params?.projectId) q.set("projectId", params.projectId);
  if (params?.status) q.set("status", params.status);
  if (params?.source) q.set("source", params.source);
  if (params?.assignedToId) q.set("assignedToId", params.assignedToId);
  if (params?.search) q.set("search", params.search);
  if (params?.page) q.set("page", String(params.page));
  if (params?.limit) q.set("limit", String(params.limit));
  const s = q.toString();
  return apiFetch<CrmLeadListResponse>(`/org/leads${s ? `?${s}` : ""}`);
}

export async function getCrmLead(
  id: string,
): Promise<import("./types").CrmLead> {
  return apiFetch<import("./types").CrmLead>(`/org/leads/${id}`);
}

export async function addCrmLeadNote(
  id: string,
  text: string,
): Promise<import("./types").CrmLeadActivity> {
  return apiFetch<import("./types").CrmLeadActivity>(`/org/leads/${id}/notes`, {
    method: "POST",
    body: JSON.stringify({ text }),
  });
}

export async function updateCrmLeadNextAction(
  id: string,
  input: {
    actionType: "site_visit" | "follow_up";
    scheduledAt: string;
    note?: string;
    reminderAt?: string;
  },
): Promise<
  NonNullable<import("./types").CrmLead["nextAction"]> & {
    activity: import("./types").CrmLeadActivity;
  }
> {
  return apiFetch(`/org/leads/${id}/next-action`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function getCrmAssignableUsers(): Promise<CrmAssignableResponse> {
  return apiFetch<CrmAssignableResponse>("/org/leads/assignable");
}

export async function assignCrmLead(
  id: string,
  input: AssignLeadInput,
): Promise<CrmLead> {
  return apiFetch(`/org/leads/${id}/assign`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

/**
 * Full lead edit form save. Persists the structured contact / requirement /
 * source / consent fields. Pipeline status is NOT sent here — it keeps its own
 * note-required path (`assignCrmLead`).
 */
export async function updateCrmLead(
  id: string,
  input: import("./types").UpdateLeadInput,
): Promise<CrmLead> {
  return apiFetch<CrmLead>(`/org/leads/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function getSalesAgents(): Promise<SalesAgentsListResponse> {
  return apiFetch<SalesAgentsListResponse>("/org/sales-agents");
}

export function getSalesAgent(id: string): Promise<SalesAgentDetailResponse> {
  return apiFetch<SalesAgentDetailResponse>(`/org/sales-agents/${id}`);
}

// Per-user performance dashboard shown when an admin opens a member from the
// Users list. Same payload as the sales-agent dashboard. An optional
// capture-date window (from / to, both YYYY-MM-DD) scopes every metric.
export function getOrgUserDashboard(
  id: string,
  opts?: { from?: string; to?: string },
): Promise<OrgUserDashboardResponse> {
  const qs = new URLSearchParams();
  if (opts?.from) qs.set("from", opts.from);
  if (opts?.to) qs.set("to", opts.to);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return apiFetch<OrgUserDashboardResponse>(
    `/org/users/${id}/dashboard${suffix}`,
  );
}

export function deleteOrgUser(id: string): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>(`/org/users/${id}`, {
    method: "DELETE",
  });
}

// --- Organisation domain identity (subdomain + custom domain) ---

export async function getOrgDomainInfo(): Promise<OrgDomainInfo> {
  return apiFetch<OrgDomainInfo>("/org/domain");
}

export async function requestCustomDomain(
  input: RequestCustomDomainInput,
): Promise<OrgDomainInfo["requests"][number]> {
  return apiFetch<OrgDomainInfo["requests"][number]>(
    "/org/domain/custom-domain",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

export async function assignCustomDomain(
  input: AssignCustomDomainInput,
): Promise<OrgDomainInfo["requests"][number]> {
  return apiFetch<OrgDomainInfo["requests"][number]>(
    "/org/domain/assign",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

export async function deleteCustomDomain(
  domainRequestId: string,
): Promise<{ success: boolean; id: string }> {
  return apiFetch<{ success: boolean; id: string }>(
    `/org/domain/custom-domain/${encodeURIComponent(domainRequestId)}`,
    {
      method: "DELETE",
    },
  );
}

// --- Super Admin: org subdomain / custom-domain request review ---

export async function getOrgDomainRequests(params?: {
  kind?: string;
  status?: string;
  search?: string;
  page?: number;
  limit?: number;
}): Promise<AdminOrgDomainRequestListResponse> {
  const q = new URLSearchParams();
  if (params?.kind) q.set("kind", params.kind);
  if (params?.status) q.set("status", params.status);
  if (params?.search) q.set("search", params.search);
  if (params?.page) q.set("page", String(params.page));
  if (params?.limit) q.set("limit", String(params.limit));
  const s = q.toString();
  return apiFetch<AdminOrgDomainRequestListResponse>(
    `/admin/org-domain-requests${s ? `?${s}` : ""}`,
  );
}

export async function reviewOrgDomainRequest(
  id: string,
  input: ReviewOrgDomainRequestInput,
): Promise<{ id: string; status: string }> {
  return apiFetch<{ id: string; status: string }>(
    `/admin/org-domain-requests/${id}/review`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

/** Live DNS + site check for an approved org custom domain. */
export async function verifyOrgDomainRequest(
  id: string,
): Promise<DomainVerifyResult> {
  return apiFetch<DomainVerifyResult>(
    `/admin/org-domain-requests/${id}/verify`,
  );
}

// --- Super Admin: platform subdomain / DNS configuration ---

export async function getPlatformConfig(): Promise<PlatformConfig> {
  return apiFetch<PlatformConfig>("/admin/platform-config");
}

export async function updatePlatformConfig(
  input: UpdatePlatformConfigInput,
): Promise<PlatformConfig> {
  return apiFetch<PlatformConfig>("/admin/platform-config", {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

/** Public unauthenticated fetch of global primary and secondary colors. */
export async function getPlatformTheme(): Promise<PlatformTheme> {
  try {
    return await apiFetch<PlatformTheme>("/platform/theme");
  } catch {
    return { primaryColor: "#0f1424", secondaryColor: "#2a3348" };
  }
}

// --- In-app notifications (Super Admin bell) ---

export async function getNotifications(params?: {
  page?: number;
  limit?: number;
  unreadOnly?: boolean;
}): Promise<NotificationsListResponse> {
  const q = new URLSearchParams();
  if (params?.page) q.set("page", String(params.page));
  if (params?.limit) q.set("limit", String(params.limit));
  if (params?.unreadOnly) q.set("unreadOnly", "true");
  const s = q.toString();
  return apiFetch<NotificationsListResponse>(
    `/admin/notifications${s ? `?${s}` : ""}`,
  );
}

export async function getUnreadNotifications(): Promise<UnreadNotificationsResponse> {
  return apiFetch<UnreadNotificationsResponse>(
    "/admin/notifications/unread-count",
  );
}

export async function markNotificationRead(
  id: string,
): Promise<{ id: string }> {
  return apiFetch<{ id: string }>(`/admin/notifications/${id}/read`, {
    method: "PATCH",
  });
}

export async function markAllNotificationsRead(): Promise<{
  success: boolean;
}> {
  return apiFetch<{ success: boolean }>("/admin/notifications/read-all", {
    method: "POST",
  });
}

// --- Org member's own bell (mirrors the Super Admin notifications above) ---

export async function getOrgNotifications(params?: {
  page?: number;
  limit?: number;
  unreadOnly?: boolean;
}): Promise<OrgNotificationsListResponse> {
  const q = new URLSearchParams();
  if (params?.page) q.set("page", String(params.page));
  if (params?.limit) q.set("limit", String(params.limit));
  if (params?.unreadOnly) q.set("unreadOnly", "true");
  const s = q.toString();
  return apiFetch<OrgNotificationsListResponse>(
    `/org/notifications${s ? `?${s}` : ""}`,
  );
}

export async function getOrgUnreadNotifications(): Promise<UnreadNotificationsResponse> {
  return apiFetch<UnreadNotificationsResponse>("/org/notifications/unread-count");
}

export async function markOrgNotificationRead(id: string): Promise<{ id: string }> {
  return apiFetch<{ id: string }>(`/org/notifications/${id}/read`, {
    method: "PATCH",
  });
}

export async function markAllOrgNotificationsRead(): Promise<{
  success: boolean;
}> {
  return apiFetch<{ success: boolean }>("/org/notifications/read-all", {
    method: "POST",
  });
}

// --- Support & Help (org side) / Support Management (Super Admin) ----------
// Plain REST, no websockets — the ticket detail pages poll on an interval.

function supportQueryString(params?: ListSupportTicketsParams): string {
  const q = new URLSearchParams();
  if (params?.page) q.set("page", String(params.page));
  if (params?.limit) q.set("limit", String(params.limit));
  if (params?.status) q.set("status", params.status);
  if (params?.search) q.set("search", params.search);
  if (params?.orgId) q.set("orgId", params.orgId);
  const s = q.toString();
  return s ? `?${s}` : "";
}

export function createSupportUploadUrl(input: {
  filename: string;
  contentType: string;
  size: number;
}): Promise<LogoUploadUrlResult> {
  return apiFetch<LogoUploadUrlResult>("/org/support/upload-url", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function createSupportTicket(
  input: CreateSupportTicketInput,
): Promise<SupportTicketDetailResponse> {
  return apiFetch<SupportTicketDetailResponse>("/org/support", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function getSupportTickets(
  params?: ListSupportTicketsParams,
): Promise<SupportTicketsListResponse> {
  return apiFetch<SupportTicketsListResponse>(
    `/org/support${supportQueryString(params)}`,
  );
}

export function getSupportTicket(id: string): Promise<SupportTicketDetailResponse> {
  return apiFetch<SupportTicketDetailResponse>(`/org/support/${id}`);
}

export function addSupportMessage(
  id: string,
  input: CreateSupportMessageInput,
): Promise<SupportMessage> {
  return apiFetch<SupportMessage>(`/org/support/${id}/messages`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

// --- Support Management (Super Admin console) ---

export function createAdminSupportUploadUrl(input: {
  filename: string;
  contentType: string;
  size: number;
}): Promise<LogoUploadUrlResult> {
  return apiFetch<LogoUploadUrlResult>("/admin/support/upload-url", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function getAdminSupportTickets(
  params?: ListSupportTicketsParams,
): Promise<SupportTicketsListResponse> {
  return apiFetch<SupportTicketsListResponse>(
    `/admin/support${supportQueryString(params)}`,
  );
}

export function getAdminSupportTicket(
  id: string,
): Promise<SupportTicketDetailResponse> {
  return apiFetch<SupportTicketDetailResponse>(`/admin/support/${id}`);
}

export function addAdminSupportMessage(
  id: string,
  input: CreateSupportMessageInput,
): Promise<SupportMessage> {
  return apiFetch<SupportMessage>(`/admin/support/${id}/messages`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function closeAdminSupportTicket(
  id: string,
): Promise<SupportTicketDetailResponse> {
  return apiFetch<SupportTicketDetailResponse>(`/admin/support/${id}/close`, {
    method: "POST",
  });
}

export function holdAdminSupportTicket(
  id: string,
  input: HoldSupportTicketInput,
): Promise<SupportTicketDetailResponse> {
  return apiFetch<SupportTicketDetailResponse>(`/admin/support/${id}/hold`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function resumeAdminSupportTicket(
  id: string,
): Promise<SupportTicketDetailResponse> {
  return apiFetch<SupportTicketDetailResponse>(`/admin/support/${id}/resume`, {
    method: "POST",
  });
}

// Super Admin only — the backend rejects this for any other Platform Team
// member even with Support Management access (see SupportService.assignTicket).
export function assignAdminSupportTicket(
  id: string,
  input: AssignSupportTicketInput,
): Promise<SupportTicketDetailResponse> {
  return apiFetch<SupportTicketDetailResponse>(`/admin/support/${id}/assign`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

// --- Org custom catalogs (project onboarding wizard option lists) ---

export async function getOrgCatalogOptions(
  category?: OrgCatalogCategory,
): Promise<OrgCatalogOption[]> {
  const q = category ? `?category=${category}` : "";
  return apiFetch<OrgCatalogOption[]>(`/org/project-catalog${q}`);
}

export async function createOrgCatalogOption(
  input: CreateOrgCatalogOptionInput,
): Promise<OrgCatalogOption> {
  return apiFetch<OrgCatalogOption>("/org/project-catalog", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateOrgCatalogOption(
  id: string,
  input: UpdateOrgCatalogOptionInput,
): Promise<OrgCatalogOption> {
  return apiFetch<OrgCatalogOption>(`/org/project-catalog/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function deleteOrgCatalogOption(
  id: string,
): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>(`/org/project-catalog/${id}`, {
    method: "DELETE",
  });
}

// --- Lead pipeline stage display overrides (label + colour for the 7 stages) ---

export async function getOrgLeadStageDisplays(): Promise<OrgLeadStageDisplay[]> {
  return apiFetch<OrgLeadStageDisplay[]>("/org/lead-stage-displays");
}

export async function updateOrgLeadStageDisplay(
  status: CrmLeadStatus,
  input: UpdateLeadStageDisplayInput,
): Promise<OrgLeadStageDisplay> {
  return apiFetch<OrgLeadStageDisplay>(`/org/lead-stage-displays/${status}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

// --- Cross-project units ("All Units" screen) ---

/** GET /org/units — the org's whole inventory, flat and paginated. */
export async function getOrgUnits(params?: {
  page?: number;
  limit?: number;
  projectId?: string;
  standalone?: boolean;
  status?: UnitStatus;
  search?: string;
}): Promise<OrgUnitsListResponse> {
  const q = new URLSearchParams();
  if (params?.page) q.set("page", String(params.page));
  if (params?.limit) q.set("limit", String(params.limit));
  if (params?.projectId) q.set("projectId", params.projectId);
  if (params?.standalone) q.set("standalone", "1");
  if (params?.status) q.set("status", params.status);
  if (params?.search) q.set("search", params.search);
  const qs = q.toString();
  return apiFetch<OrgUnitsListResponse>(`/org/units${qs ? `?${qs}` : ""}`);
}

// --- Standalone units (resale / broker listings, no project) ---

/** POST /org/units — create a standalone unit. */
export async function createStandaloneUnit(
  input: CreateUnitInput,
): Promise<Unit> {
  return apiFetch<Unit>("/org/units", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/** GET /org/units/:id — a single standalone unit. */
export async function getStandaloneUnit(id: string): Promise<Unit> {
  return apiFetch<Unit>(`/org/units/${id}`);
}

/** PATCH /org/units/:id — update a standalone unit. */
export async function updateStandaloneUnit(
  id: string,
  input: UpdateUnitInput,
): Promise<Unit> {
  return apiFetch<Unit>(`/org/units/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

/** DELETE /org/units/:id. */
export async function deleteStandaloneUnit(
  id: string,
): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>(`/org/units/${id}`, {
    method: "DELETE",
  });
}

/** List org projects (paginated). */
export async function getOrgProjects(params?: {
  page?: number;
  limit?: number;
  search?: string;
}): Promise<{ data: import("./types").Project[]; total?: number }> {
  const q = new URLSearchParams();
  if (params?.page) q.set("page", String(params.page));
  if (params?.limit) q.set("limit", String(params.limit));
  if (params?.search) q.set("search", params.search);
  const s = q.toString();
  return apiFetch(`/org/projects${s ? `?${s}` : "?page=1&limit=100"}`);
}

// --- Project sales agents (Step 7 of the onboarding wizard) ---

export async function getProjectSalesAgents(
  projectId: string,
): Promise<ProjectSalesAgent[]> {
  return apiFetch<ProjectSalesAgent[]>(
    `/org/projects/${projectId}/sales-agents`,
  );
}

/**
 * Who a PROJECT's "Assign sales agents" picker offers: every active member
 * except Admins and Managers (a manager is picked in the Project manager
 * field instead). No CRM-permission requirement. Each row carries the
 * projects the user is already on. The PUT enforces the same rule server-side.
 */
export async function getProjectSalesAgentCandidates(): Promise<ProjectAssigneeCandidatesResponse> {
  return apiFetch<ProjectAssigneeCandidatesResponse>(
    "/org/projects/project-assignee-candidates?type=sales_agent",
  );
}

/**
 * Who the "Project manager" dropdown offers: every active user holding the
 * manager role — the same set `GET /org/users?role=manager` returns — with the
 * projects each is already on, so the picker can show who is already assigned.
 */
export async function getProjectManagerCandidates(): Promise<ProjectAssigneeCandidatesResponse> {
  return apiFetch<ProjectAssigneeCandidatesResponse>(
    "/org/projects/project-assignee-candidates?type=manager",
  );
}

/**
 * Who can be attached to a STANDALONE unit as a sales agent (and to a lead):
 * the narrower "who can hold a lead" rule — CRM access required, admins and
 * managers excluded. A project's own agents use the broader list above; keep
 * the two apart, the server enforces each rule on its own write path.
 */
export async function getSalesAgentCandidates(): Promise<CrmAssignableResponse> {
  return apiFetch<CrmAssignableResponse>("/org/projects/sales-agent-candidates");
}

/** Full-set replace — pass every assigned user id; re-submitting is idempotent. */
export async function setProjectSalesAgents(
  projectId: string,
  userIds: string[],
): Promise<ProjectSalesAgent[]> {
  return apiFetch<ProjectSalesAgent[]>(
    `/org/projects/${projectId}/sales-agents`,
    { method: "PUT", body: JSON.stringify({ userIds }) },
  );
}

/** The org's landing pages (for the project wizard/edit "Landing page" picker). */
export async function getOrgLandingPages(): Promise<LandingPageRow[]> {
  const res = await apiFetch<OrgLandingPagesListResponse>(
    "/org/landing-pages?page=1&limit=100",
  );
  return res.data;
}

/** Landing pages bound to one project (for the project Overview page's landing-page list). */
export async function getProjectLandingPages(projectId: string): Promise<LandingPageRow[]> {
  const res = await apiFetch<OrgLandingPagesListResponse>(
    `/org/landing-pages?page=1&limit=100&projectId=${encodeURIComponent(projectId)}`,
  );
  return res.data;
}

// --- Super Admin Email & SMTP Management ---

export async function getSmtpConfig(): Promise<SmtpConfig> {
  return apiFetch<SmtpConfig>("/admin/email/config");
}

export async function updateSmtpConfig(
  input: UpdateSmtpConfigInput,
): Promise<SmtpConfig> {
  return apiFetch<SmtpConfig>("/admin/email/config", {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export async function sendSmtpTestEmail(
  input: SendTestEmailInput,
): Promise<{ success: boolean; message: string; messageId?: string }> {
  return apiFetch<{ success: boolean; message: string; messageId?: string }>(
    "/admin/email/test",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

export async function getEmailLogs(params?: {
  page?: number;
  limit?: number;
  status?: string;
  search?: string;
}): Promise<EmailLogsResponse> {
  const query = new URLSearchParams();
  if (params?.page) query.set("page", String(params.page));
  if (params?.limit) query.set("limit", String(params.limit));
  if (params?.status && params.status !== "all")
    query.set("status", params.status);
  if (params?.search) query.set("search", params.search);

  const qs = query.toString();
  return apiFetch<EmailLogsResponse>(`/admin/email/logs${qs ? `?${qs}` : ""}`);
}

export async function getEmailStats(): Promise<EmailStatsResponse> {
  return apiFetch<EmailStatsResponse>("/admin/email/stats");
}

export async function getOrgSmtpConfig(): Promise<SmtpConfig> {
  return apiFetch<SmtpConfig>("/org/email/config");
}

export async function updateOrgSmtpConfig(
  input: UpdateSmtpConfigInput,
): Promise<SmtpConfig> {
  return apiFetch<SmtpConfig>("/org/email/config", {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export async function sendOrgSmtpTestEmail(
  input: SendTestEmailInput,
): Promise<{ success: boolean; message: string; messageId?: string }> {
  return apiFetch<{ success: boolean; message: string; messageId?: string }>(
    "/org/email/test",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

// --- Attribution labels (Super Admin + org Lead Center) ---

export async function getAdminAttributionLabels(): Promise<
  import("./types").AttributionLabel[]
> {
  return apiFetch("/admin/attribution-labels");
}

export async function createAdminAttributionLabel(input: {
  key: string;
  label: string;
  enabled?: boolean;
  sortOrder?: number;
}): Promise<import("./types").AttributionLabel> {
  return apiFetch("/admin/attribution-labels", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateAdminAttributionLabel(
  id: string,
  input: { enabled?: boolean; label?: string; sortOrder?: number },
): Promise<import("./types").AttributionLabel> {
  return apiFetch(`/admin/attribution-labels/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function deleteAdminAttributionLabel(
  id: string,
): Promise<{ ok: boolean }> {
  return apiFetch(`/admin/attribution-labels/${id}`, { method: "DELETE" });
}

export async function getOrgAttributionLabels(): Promise<
  import("./types").AttributionLabel[]
> {
  return apiFetch("/org/attribution-labels");
}

// --- Facebook / Meta Lead Ads ---

export async function getAdminMetaConfig(): Promise<
  import("./types").MetaPublicConfig
> {
  return apiFetch("/admin/meta/config");
}

export async function getAdminMarketingCredentials(): Promise<
  import("./types").MarketingCredentials
> {
  return apiFetch("/admin/marketing/credentials");
}

export async function updateAdminMarketingCredentials(
  data: Partial<import("./types").MarketingCredentials>,
): Promise<import("./types").MarketingCredentials> {
  return apiFetch("/admin/marketing/credentials", {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function getMarketingCredentials(): Promise<
  import("./types").MarketingCredentials
> {
  return apiFetch<import("./types").MarketingCredentials>("/org/marketing/credentials").catch(() =>
    getAdminMarketingCredentials(),
  );
}

export async function updateMarketingCredentials(
  data: Partial<import("./types").MarketingCredentials>,
): Promise<import("./types").MarketingCredentials> {
  return apiFetch<import("./types").MarketingCredentials>("/org/marketing/credentials", {
    method: "PUT",
    body: JSON.stringify(data),
  }).catch(() => updateAdminMarketingCredentials(data));
}

export async function createOrgGoogleSheet(
  title?: string,
  connectionId?: string,
  projectId?: string,
): Promise<{
  ok: boolean;
  spreadsheetId: string;
  spreadsheetUrl: string;
  sheetName: string;
  connectionId?: string;
}> {
  return apiFetch("/org/marketing/google-sheets/create-sheet", {
    method: "POST",
    body: JSON.stringify({ title, connectionId, projectId }),
  });
}

export async function linkOrgGoogleSheet(
  sheetInput: string,
  sheetName?: string,
  connectionId?: string,
  projectId?: string,
): Promise<{
  ok: boolean;
  spreadsheetId: string;
  spreadsheetUrl: string;
  sheetName: string;
  title?: string;
  connectionId?: string;
}> {
  return apiFetch("/org/marketing/google-sheets/link-sheet", {
    method: "POST",
    body: JSON.stringify({ sheetInput, sheetName, connectionId, projectId }),
  });
}

export async function syncAllOrgGoogleSheetsLeads(opts?: {
  projectId?: string;
  connectionId?: string;
}): Promise<{
  ok: boolean;
  synced: number;
  message: string;
  spreadsheetUrl?: string;
  results?: Array<{
    ok: boolean;
    connectionId: string;
    synced: number;
    message: string;
    spreadsheetUrl?: string;
  }>;
}> {
  return apiFetch("/org/marketing/google-sheets/sync-all", {
    method: "POST",
    body: JSON.stringify(opts ?? {}),
  });
}

export async function updateOrgGoogleSheetSettings(settings: {
  autoSync?: boolean;
  sheetName?: string;
  sheetPerProject?: boolean;
  createSheetPerProject?: boolean;
  projectSheetNames?: Record<string, string>;
  projectId?: string | null;
  connectionId?: string;
}): Promise<{ ok: boolean; metadata: any }> {
  return apiFetch("/org/marketing/google-sheets/settings", {
    method: "PATCH",
    body: JSON.stringify(settings),
  });
}

export async function disconnectOrgGoogleSheet(
  connectionId?: string,
): Promise<{ ok: boolean }> {
  const query = connectionId
    ? `?connectionId=${encodeURIComponent(connectionId)}`
    : "";
  return apiFetch(`/org/marketing/google-sheets${query}`, {
    method: "DELETE",
  });
}

export async function getOrgMetaConfig(): Promise<
  import("./types").MetaPublicConfig
> {
  return apiFetch("/org/meta/config");
}

export async function getMetaConnectUrl(): Promise<{
  url: string;
  state: string;
}> {
  return apiFetch("/org/meta/connect");
}

export async function getMetaConnections(): Promise<
  import("./types").MetaPageConnection[]
> {
  return apiFetch("/org/meta/connections");
}

export async function updateMetaConnection(
  id: string,
  input: { projectId?: string | null },
): Promise<import("./types").MetaPageConnection> {
  return apiFetch(`/org/meta/connections/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function disconnectMetaConnection(
  id: string,
): Promise<{ ok: boolean }> {
  return apiFetch(`/org/meta/connections/${id}`, { method: "DELETE" });
}

export async function connectMetaWithToken(input: {
  pageId: string;
  pageName: string;
  accessToken: string;
  projectId?: string | null;
}): Promise<import("./types").MetaPageConnection & { imported?: number }> {
  return apiFetch("/org/meta/connect-token", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

// --- Marketing Integration Hub ---

export async function getMarketingDashboard(): Promise<
  import("./types").MarketingDashboard
> {
  return apiFetch("/org/marketing/dashboard");
}

export async function getMarketingPlatforms(): Promise<
  import("./types").MarketingPlatformCard[]
> {
  return apiFetch("/org/marketing/platforms");
}

export async function getMarketingAppsOverview(): Promise<
  import("./types").MarketingAppsOverview
> {
  return apiFetch("/org/marketing/apps-overview");
}

export async function getMarketingPlatform(
  key: string,
): Promise<
  import("./types").MarketingPlatformCard & {
    metaConfig?: import("./types").MetaPublicConfig | null;
    oauthConfigured?: boolean;
    webhookUrl?: string | null;
  }
> {
  return apiFetch(`/org/marketing/platforms/${encodeURIComponent(key)}`);
}

export async function getMarketingConnectUrl(
  key: string,
): Promise<{ url: string; state: string; webhookUrl?: string }> {
  return apiFetch(`/org/marketing/platforms/${encodeURIComponent(key)}/connect`);
}

export async function connectMarketingCredentials(
  key: string,
  input: {
    externalAccountId: string;
    externalAccountName?: string;
    accessToken: string;
    refreshToken?: string;
    projectId?: string | null;
  },
): Promise<import("./types").MarketingConnection> {
  return apiFetch(
    `/org/marketing/platforms/${encodeURIComponent(key)}/connect-credentials`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

export async function getOrgMarketingSyncLogs(
  limit = 50,
): Promise<import("./types").MarketingSyncLog[]> {
  return apiFetch(`/org/marketing/sync-logs?limit=${limit}`);
}

export async function getMarketingConnections(
  platformKey?: string,
): Promise<import("./types").MarketingConnection[]> {
  const q = platformKey
    ? `?platformKey=${encodeURIComponent(platformKey)}`
    : "";
  return apiFetch(`/org/marketing/connections${q}`);
}

export async function updateMarketingConnection(
  id: string,
  input: { projectId?: string | null },
): Promise<import("./types").MarketingConnection> {
  return apiFetch(`/org/marketing/connections/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function disconnectMarketingConnection(
  id: string,
): Promise<{ ok: boolean }> {
  return apiFetch(`/org/marketing/connections/${id}`, { method: "DELETE" });
}

export async function syncMarketingPlatform(key: string): Promise<{
  ok: boolean;
  synced: number;
  failed: number;
  results: Array<{ ok: boolean; message: string; connectionId: string }>;
}> {
  return apiFetch(
    `/org/marketing/platforms/${encodeURIComponent(key)}/sync`,
    { method: "POST" },
  );
}

export async function syncMarketingConnection(id: string): Promise<{
  ok: boolean;
  message: string;
  connectionId: string;
  platformKey: string;
}> {
  return apiFetch(`/org/marketing/connections/${encodeURIComponent(id)}/sync`, {
    method: "POST",
  });
}

export async function getAdminMarketingPlatforms(): Promise<
  import("./types").MarketingPlatformAdmin[]
> {
  return apiFetch("/admin/marketing/platforms");
}

export async function createAdminMarketingPlatform(input: {
  key: string;
  name: string;
  description?: string | null;
  enabled?: boolean;
  supportsOAuth?: boolean;
  supportsWebhook?: boolean;
}): Promise<import("./types").MarketingPlatformAdmin> {
  return apiFetch("/admin/marketing/platforms", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateAdminMarketingPlatform(
  id: string,
  input: { enabled?: boolean; name?: string; description?: string | null },
): Promise<import("./types").MarketingPlatformAdmin> {
  return apiFetch(`/admin/marketing/platforms/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function deleteAdminMarketingPlatform(
  id: string,
): Promise<{ ok: boolean }> {
  return apiFetch(`/admin/marketing/platforms/${id}`, { method: "DELETE" });
}

export async function getAdminMarketingSyncLogs(params?: {
  status?: string;
  platformKey?: string;
  limit?: number;
}): Promise<import("./types").MarketingSyncLog[]> {
  const q = new URLSearchParams();
  if (params?.status) q.set("status", params.status);
  if (params?.platformKey) q.set("platformKey", params.platformKey);
  if (params?.limit) q.set("limit", String(params.limit));
  const s = q.toString();
  return apiFetch(`/admin/marketing/sync-logs${s ? `?${s}` : ""}`);
}

export async function getOrgEmailLogs(params?: {
  page?: number;
  limit?: number;
  status?: string;
  search?: string;
}): Promise<EmailLogsResponse> {
  const query = new URLSearchParams();
  if (params?.page) query.set("page", String(params.page));
  if (params?.limit) query.set("limit", String(params.limit));
  if (params?.status && params.status !== "all") query.set("status", params.status);
  if (params?.search) query.set("search", params.search);
  const qs = query.toString();
  return apiFetch<EmailLogsResponse>(`/org/email/logs${qs ? `?${qs}` : ""}`);
}

export async function getOrgEmailStats(): Promise<EmailStatsResponse> {
  return apiFetch<EmailStatsResponse>("/org/email/stats");
}

export async function getAdminDashboard(): Promise<AdminDashboardResponse> {
  return apiFetch<AdminDashboardResponse>("/admin/dashboard");
}

// --- Super Admin: Audit logs ---

function auditLogsQuery(params?: AdminAuditLogsParams): string {
  const q = new URLSearchParams();
  if (params?.page) q.set("page", String(params.page));
  if (params?.limit) q.set("limit", String(params.limit));
  if (params?.search?.trim()) q.set("search", params.search.trim());
  if (params?.actorId) q.set("actorId", params.actorId);
  if (params?.orgId) q.set("orgId", params.orgId);
  if (params?.action) q.set("action", params.action);
  if (params?.moduleKey) q.set("moduleKey", params.moduleKey);
  if (params?.dateFrom) q.set("dateFrom", params.dateFrom);
  if (params?.dateTo) q.set("dateTo", params.dateTo);
  const s = q.toString();
  return s ? `?${s}` : "";
}

export async function getAdminAuditLogs(
  params?: AdminAuditLogsParams,
): Promise<AdminAuditLogsListResponse> {
  return apiFetch<AdminAuditLogsListResponse>(
    `/admin/audit-logs${auditLogsQuery(params)}`,
  );
}

export async function getAdminAuditLogsMeta(): Promise<AdminAuditLogsMeta> {
  return apiFetch<AdminAuditLogsMeta>("/admin/audit-logs/meta");
}

export async function exportAdminAuditLogs(
  params?: AdminAuditLogsParams,
): Promise<AdminAuditLogsExportResponse> {
  return apiFetch<AdminAuditLogsExportResponse>(
    `/admin/audit-logs/export${auditLogsQuery(params)}`,
  );
}

function adminLeadsQuery(params?: import("./types").AdminLeadsParams): string {
  const q = new URLSearchParams();
  if (params?.page) q.set("page", String(params.page));
  if (params?.limit) q.set("limit", String(params.limit));
  if (params?.orgId) q.set("orgId", params.orgId);
  if (params?.projectId) q.set("projectId", params.projectId);
  if (params?.status) q.set("status", params.status);
  if (params?.source) q.set("source", params.source);
  if (params?.search) q.set("search", params.search);
  const s = q.toString();
  return s ? `?${s}` : "";
}

export async function getAdminLeads(
  params?: import("./types").AdminLeadsParams,
): Promise<import("./types").AdminLeadsListResponse> {
  return apiFetch<import("./types").AdminLeadsListResponse>(
    `/admin/leads${adminLeadsQuery(params)}`,
  );
}

export async function getAdminLeadsMeta(): Promise<import("./types").AdminLeadsMeta> {
  return apiFetch<import("./types").AdminLeadsMeta>("/admin/leads/meta");
}

export async function getAdminOrganisationsList(): Promise<{ id: string; name: string }[]> {
  const meta = await getAdminLeadsMeta().catch(() => ({ organisations: [] }));
  return meta.organisations || [];
}

export async function getPlatformTeam(): Promise<PlatformTeamMember[]> {
  return apiFetch<PlatformTeamMember[]>("/admin/platform-team");
}

export interface PlatformTeamPage {
  data: PlatformTeamMember[];
  total: number;
  page: number;
  limit: number;
}

/** Server-paginated member list for the Platform Team table. */
export async function getPlatformTeamPage(params: {
  page: number;
  limit?: number;
  search?: string;
}): Promise<PlatformTeamPage> {
  const qs = new URLSearchParams({ page: String(params.page), limit: String(params.limit ?? 10) });
  if (params.search?.trim()) qs.set("search", params.search.trim());
  return apiFetch<PlatformTeamPage>(`/admin/platform-team?${qs.toString()}`);
}

export async function getPlatformTeamMember(id: string): Promise<PlatformTeamMember> {
  return apiFetch<PlatformTeamMember>(`/admin/platform-team/${encodeURIComponent(id)}`);
}

export async function getPlatformTeamRoles(): Promise<PlatformTeamRole[]> {
  return apiFetch<PlatformTeamRole[]>("/admin/platform-team/roles");
}

export async function createPlatformTeamMember(input: {
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  role: string;
  password?: string;
}): Promise<PlatformTeamMember> {
  return apiFetch<PlatformTeamMember>("/admin/platform-team", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updatePlatformTeamMember(
  id: string,
  input: {
    firstName?: string;
    lastName?: string;
    email?: string;
    phoneNumber?: string;
    role?: string;
    status?: "active" | "disabled";
    password?: string;
  },
): Promise<PlatformTeamMember> {
  return apiFetch<PlatformTeamMember>(`/admin/platform-team/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function deletePlatformTeamMember(id: string): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/admin/platform-team/${id}`, {
    method: "DELETE",
  });
}

export async function getPlatformRoles(): Promise<DynamicRole[]> {
  return apiFetch<DynamicRole[]>("/admin/platform-roles");
}

export async function getMyPlatformPermissions(): Promise<{
  unrestricted: boolean;
  roles: { key: string; name: string }[];
  permissions: Permissions;
}> {
  return apiFetch("/admin/platform-roles/me");
}

// --- Teams (org/teams) ---------------------------------------------------

export function listTeams(): Promise<Team[]> {
  return apiFetch<Team[]>("/org/teams");
}

export function getTeam(id: string): Promise<TeamDetail> {
  return apiFetch<TeamDetail>(`/org/teams/${id}`);
}

export function createTeam(input: CreateTeamInput): Promise<Team> {
  return apiFetch<Team>("/org/teams", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateTeam(id: string, input: UpdateTeamInput): Promise<Team> {
  return apiFetch<Team>(`/org/teams/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function deleteTeam(id: string): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>(`/org/teams/${id}`, {
    method: "DELETE",
  });
}

export function setTeamMembers(
  id: string,
  members: SetTeamMembersInput[],
): Promise<TeamMemberRow[]> {
  return apiFetch<TeamMemberRow[]>(`/org/teams/${id}/members`, {
    method: "PUT",
    body: JSON.stringify({ members }),
  });
}

export function setTeamProjects(
  id: string,
  projectIds: string[],
): Promise<TeamProjectRow[]> {
  return apiFetch<TeamProjectRow[]>(`/org/teams/${id}/projects`, {
    method: "PUT",
    body: JSON.stringify({ projectIds }),
  });
}

// Reused by the Teams onboarding page — same real "create org user" call
// (and the same server-side invite email) the Users page already uses.
export function createOrgUser(input: CreateOrgUserInput): Promise<OrgUser> {
  return apiFetch<OrgUser>("/org/users", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

// --- Team Chat (org/team-chat) -------------------------------------------

export function getTeamChatOverview(): Promise<TeamChatOverview> {
  return apiFetch<TeamChatOverview>("/org/team-chat");
}

export function getTeamChannel(id: string): Promise<TeamChatDetail> {
  return apiFetch<TeamChatDetail>(`/org/team-chat/channels/${id}`);
}

export function createTeamChannel(
  input: CreateTeamChannelInput,
): Promise<TeamChatChannelSummary> {
  return apiFetch<TeamChatChannelSummary>("/org/team-chat/channels", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function createTeamDm(userId: string): Promise<TeamChatDetail> {
  return apiFetch<TeamChatDetail>("/org/team-chat/dms", {
    method: "POST",
    body: JSON.stringify({ userId }),
  });
}

export function sendTeamMessage(
  channelId: string,
  input: CreateTeamMessageInput,
): Promise<TeamChatMessage> {
  return apiFetch<TeamChatMessage>(
    `/org/team-chat/channels/${channelId}/messages`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

// --- Media Library (Org & Super Admin) -------------------------------------

export function getOrgMedia(params?: {
  search?: string;
  category?: string;
  folder?: string;
  page?: number;
  limit?: number;
}): Promise<MediaListResponse> {
  const query = new URLSearchParams();
  if (params?.search) query.set("search", params.search);
  if (params?.category) query.set("category", params.category);
  if (params?.folder) query.set("folder", params.folder);
  if (params?.page) query.set("page", String(params.page));
  if (params?.limit) query.set("limit", String(params.limit));

  const qs = query.toString();
  return apiFetch<MediaListResponse>(`/org/media${qs ? `?${qs}` : ""}`);
}

export function getOrgMediaStats(): Promise<MediaStatsResponse> {
  return apiFetch<MediaStatsResponse>("/org/media/stats");
}

export function createOrgMediaUploadUrl(
  input: CreateMediaUploadUrlInput,
): Promise<CreateMediaUploadUrlResult> {
  return apiFetch<CreateMediaUploadUrlResult>("/org/media/upload-url", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function registerOrgMedia(
  input: RegisterMediaInput,
): Promise<MediaFileItem> {
  return apiFetch<MediaFileItem>("/org/media/register", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateOrgMedia(
  id: string,
  input: UpdateMediaInput,
): Promise<MediaFileItem> {
  return apiFetch<MediaFileItem>(`/org/media/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function deleteOrgMedia(id: string): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>(`/org/media/${id}`, {
    method: "DELETE",
  });
}

export function bulkDeleteOrgMedia(
  ids: string[],
): Promise<{ success: boolean; count: number }> {
  return apiFetch<{ success: boolean; count: number }>("/org/media/bulk-delete", {
    method: "POST",
    body: JSON.stringify({ ids }),
  });
}

// --- Super Admin Media Library ---------------------------------------------

export function getAdminMedia(params?: {
  orgId?: string;
  search?: string;
  category?: string;
  folder?: string;
  page?: number;
  limit?: number;
}): Promise<MediaListResponse> {
  const query = new URLSearchParams();
  if (params?.orgId) query.set("orgId", params.orgId);
  if (params?.search) query.set("search", params.search);
  if (params?.category) query.set("category", params.category);
  if (params?.folder) query.set("folder", params.folder);
  if (params?.page) query.set("page", String(params.page));
  if (params?.limit) query.set("limit", String(params.limit));

  const qs = query.toString();
  return apiFetch<MediaListResponse>(`/admin/media${qs ? `?${qs}` : ""}`);
}

export function getAdminMediaStats(): Promise<MediaStatsResponse> {
  return apiFetch<MediaStatsResponse>("/admin/media/stats");
}

export function createAdminMediaUploadUrl(
  input: CreateMediaUploadUrlInput,
): Promise<CreateMediaUploadUrlResult> {
  return apiFetch<CreateMediaUploadUrlResult>("/admin/media/upload-url", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function registerAdminMedia(
  input: RegisterMediaInput,
): Promise<MediaFileItem> {
  return apiFetch<MediaFileItem>("/admin/media/register", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateAdminMedia(
  id: string,
  input: UpdateMediaInput,
): Promise<MediaFileItem> {
  return apiFetch<MediaFileItem>(`/admin/media/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function deleteAdminMedia(id: string): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>(`/admin/media/${id}`, {
    method: "DELETE",
  });
}

export function bulkDeleteAdminMedia(
  ids: string[],
): Promise<{ success: boolean; count: number }> {
  return apiFetch<{ success: boolean; count: number }>("/admin/media/bulk-delete", {
    method: "POST",
    body: JSON.stringify({ ids }),
  });
}

// --- Upload file directly helper ------------------------------------------

export async function uploadFileToMediaLibrary(
  file: File,
  folder = "general",
  onProgress?: (percent: number) => void,
): Promise<MediaFileItem> {
  // 1. Get presigned upload URL
  const { uploadUrl, publicUrl, key, category } = await createOrgMediaUploadUrl({
    filename: file.name,
    contentType: file.type || "application/octet-stream",
    size: file.size,
    folder,
  });

  // 2. Upload file directly to R2
  const res = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": file.type || "application/octet-stream",
    },
    body: file,
  });

  if (!res.ok) {
    throw new Error(`Upload failed (${res.status}): ${res.statusText}`);
  }

  // 3. Register media item in DB
  return registerOrgMedia({
    name: file.name,
    filename: file.name,
    storedKey: key,
    publicUrl,
    mimeType: file.type || "application/octet-stream",
    size: file.size,
    category,
    folder,
  });
}

// --- Reports & Analytics --------------------------------------------------

function buildReportsQuery(params?: ReportsFilterInput): string {
  const query = new URLSearchParams();
  if (params?.preset) query.set("preset", params.preset);
  if (params?.startDate) query.set("startDate", params.startDate);
  if (params?.endDate) query.set("endDate", params.endDate);
  if (params?.projectId) query.set("projectId", params.projectId);
  if (params?.agentId) query.set("agentId", params.agentId);
  if (params?.source) query.set("source", params.source);
  if (params?.orgId) query.set("orgId", params.orgId);
  const qs = query.toString();
  return qs ? `?${qs}` : "";
}

export function getOrgReportsSummary(params?: ReportsFilterInput): Promise<ReportsSummary> {
  return apiFetch<ReportsSummary>(`/org/reports/summary${buildReportsQuery(params)}`);
}

export function getOrgReportsLeadSources(params?: ReportsFilterInput): Promise<LeadSourceStat[]> {
  return apiFetch<LeadSourceStat[]>(`/org/reports/lead-sources${buildReportsQuery(params)}`);
}

export function getOrgReportsFunnel(params?: ReportsFilterInput): Promise<FunnelStageStat[]> {
  return apiFetch<FunnelStageStat[]>(`/org/reports/funnel${buildReportsQuery(params)}`);
}

export function getOrgReportsAgentPerformance(params?: ReportsFilterInput): Promise<AgentPerformanceStat[]> {
  return apiFetch<AgentPerformanceStat[]>(`/org/reports/agent-performance${buildReportsQuery(params)}`);
}

export function getOrgReportsProjectAnalytics(params?: ReportsFilterInput): Promise<ProjectAnalyticsStat[]> {
  return apiFetch<ProjectAnalyticsStat[]>(`/org/reports/projects${buildReportsQuery(params)}`);
}

export async function downloadCsvFile(url: string, filename: string): Promise<void> {
  const { accessToken } = readTokens();
  const headers: Record<string, string> = {};
  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }
  const res = await fetch(url, { headers });
  if (!res.ok) {
    if (res.status === 401 && (await tryRefresh())) {
      return downloadCsvFile(url, filename);
    }
    throw new Error(`CSV download failed with status ${res.status}`);
  }
  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(blobUrl);
}

export async function downloadOrgReportCsv(params?: ReportsFilterInput, type = "leads"): Promise<void> {
  const qs = buildReportsQuery({ ...params });
  const typeParam = `type=${type}`;
  const fullQs = qs ? `${qs}&${typeParam}` : `?${typeParam}`;
  const filename = `org-report-${type}-${Date.now()}.csv`;
  await downloadCsvFile(`${API_BASE}/org/reports/export/csv${fullQs}`, filename);
}

export function getAdminReportsSummary(params?: ReportsFilterInput): Promise<ReportsSummary> {
  return apiFetch<ReportsSummary>(`/admin/reports/summary${buildReportsQuery(params)}`);
}

export function getAdminReportsLeadSources(params?: ReportsFilterInput): Promise<LeadSourceStat[]> {
  return apiFetch<LeadSourceStat[]>(`/admin/reports/lead-sources${buildReportsQuery(params)}`);
}

export function getAdminReportsFunnel(params?: ReportsFilterInput): Promise<FunnelStageStat[]> {
  return apiFetch<FunnelStageStat[]>(`/admin/reports/funnel${buildReportsQuery(params)}`);
}

export function getAdminReportsAgentPerformance(params?: ReportsFilterInput): Promise<AgentPerformanceStat[]> {
  return apiFetch<AgentPerformanceStat[]>(`/admin/reports/agent-performance${buildReportsQuery(params)}`);
}

export function getAdminReportsProjectAnalytics(params?: ReportsFilterInput): Promise<ProjectAnalyticsStat[]> {
  return apiFetch<ProjectAnalyticsStat[]>(`/admin/reports/projects${buildReportsQuery(params)}`);
}

export async function downloadAdminReportCsv(params?: ReportsFilterInput, type = "leads"): Promise<void> {
  const qs = buildReportsQuery({ ...params });
  const typeParam = `type=${type}`;
  const fullQs = qs ? `${qs}&${typeParam}` : `?${typeParam}`;
  const filename = `admin-report-${type}-${Date.now()}.csv`;
  await downloadCsvFile(`${API_BASE}/admin/reports/export/csv${fullQs}`, filename);
}


// ─── Org project types (typed field templates, some fields carrying a role) ─

export async function getOrgProjectTypes(): Promise<OrgProjectType[]> {
  return apiFetch<OrgProjectType[]>("/org/project-types");
}

export async function createOrgProjectType(
  input: OrgProjectTypeInput & { name: string },
): Promise<OrgProjectType> {
  return apiFetch<OrgProjectType>("/org/project-types", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateOrgProjectType(
  id: string,
  input: OrgProjectTypeInput,
): Promise<OrgProjectType> {
  return apiFetch<OrgProjectType>(`/org/project-types/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function deleteOrgProjectType(id: string): Promise<void> {
  await apiFetch(`/org/project-types/${id}`, { method: "DELETE" });
}

/** Creates whichever of Apartment / Plot / Villa the org lacks. */
export async function addCommonProjectTypes(): Promise<{ created: number; types: OrgProjectType[] }> {
  return apiFetch<{ created: number; types: OrgProjectType[] }>("/org/project-types/common", {
    method: "POST",
  });
}

/** Get Google Auth configuration (whether Google OAuth client ID is set). */
export async function getGoogleAuthConfig(): Promise<GoogleAuthConfig> {
  return apiFetch<GoogleAuthConfig>("/auth/google/config");
}

/** Get Google OAuth authorization URL for redirect flow. */
export async function getGoogleAuthUrl(
  mode: "login" | "register" = "login",
  portal: "organisation" | "platform" = "organisation",
  redirectUri?: string,
  nonce?: string,
): Promise<{ url: string; state: string }> {
  const params = new URLSearchParams({ mode, portal });
  if (redirectUri) params.set("redirectUri", redirectUri);
  if (nonce) params.set("nonce", nonce);
  return apiFetch<{ url: string; state: string }>(`/auth/google/url?${params.toString()}`);
}

/** Authenticate or initiate registration with Google credential / code. */
export async function authenticateWithGoogle(
  input: GoogleAuthInput,
): Promise<GoogleAuthResponse> {
  return apiFetch<GoogleAuthResponse>("/auth/google", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

