"use client";

import { useEffect, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { apiFetch } from "@/lib/api";
import { Reveal } from "@/components/superadmin/reveal";
import { CountUp } from "@/components/superadmin/count-up";
import { Icon } from "@/components/icons";
import { FormActions, FormAlert, formPageStyles } from "@/components/forms/form-page";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { Modal } from "@/components/ui/modal";
import { ReasonInfoPopover } from "@/components/superadmin/reason-info-popover";
import { useFlash } from "@/lib/flash";
import { ORG_DETAIL_FLASH_KEY } from "../org-detail-shared";
import type {
  CreateOrgUserInput,
  OrganisationActivityRow,
  OrganisationDetail,
  OrgUser,
  OrgUserAssignableRole,
  OrgUsersListResponse,
  Plan,
} from "@/lib/types";

const TABS = ["Overview", "Subscription", "Templates", "Domains", "Activity"] as const;
type Tab = (typeof TABS)[number];

const ROLE_OPTIONS: { value: OrgUserAssignableRole; label: string }[] = [
  { value: "admin", label: "Admin" },
  { value: "manager", label: "Manager" },
  { value: "sales", label: "Sales" },
];

const ROLE_BADGE_CLASS: Record<OrgUserAssignableRole, string> = {
  admin: "b-indigo",
  manager: "b-violet",
  sales: "b-teal",
};

// Every OrgStatus value, one source of truth for label + badge colour on
// this page — the list page (admin-console/organisations) had this right
// already; the detail page had two spots that collapsed anything non-
// "active" straight to "Disabled", which is how a "pending" org ended up
// showing "Pending" on the list but "Disabled" here for the same org.
const ORG_STATUS_META: Record<string, { label: string; badge: string }> = {
  active: { label: "Active", badge: "b-green" },
  pending: { label: "Pending", badge: "b-amber" },
  draft: { label: "Draft", badge: "b-gray" },
  disabled: { label: "Disabled", badge: "b-rose" },
  rejected: { label: "Rejected", badge: "b-rose" },
};

function orgStatusMeta(status: string) {
  return ORG_STATUS_META[status] ?? { label: status, badge: "b-gray" };
}

interface UserFormData {
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  role: OrgUserAssignableRole;
}

const EMPTY_USER_FORM: UserFormData = {
  firstName: "",
  lastName: "",
  email: "",
  phoneNumber: "",
  role: "sales",
};

interface EditForm {
  name: string;
  city: string;
  timezone: string;
  currency: string;
  defaultLanguage: string;
  website: string;
  addressLine1: string;
  addressLine2: string;
  state: string;
  postalCode: string;
  country: string;
  logoUrl: string;
  faviconUrl: string;
  brandColour: string;
}

const EMPTY_EDIT_FORM: EditForm = {
  name: "",
  city: "",
  timezone: "",
  currency: "",
  defaultLanguage: "",
  website: "",
  addressLine1: "",
  addressLine2: "",
  state: "",
  postalCode: "",
  country: "",
  logoUrl: "",
  faviconUrl: "",
  brandColour: "",
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "—";
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatActionLabel(action: string): string {
  return action
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function StatTile({
  icon,
  iconBg = "#eff6ff",
  iconColor = "#2563eb",
  label,
  value,
  sub,
  trend,
  sparkColor = "#3b82f6",
}: {
  icon?: string;
  iconBg?: string;
  iconColor?: string;
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  trend?: string;
  sparkColor?: string;
  accent?: string;
}) {
  return (
    <div
      style={{
        background: "#ffffff",
        border: "1px solid #eef2f6",
        borderRadius: 16,
        padding: "16px 18px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.02)",
        position: "relative",
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        minHeight: 96,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 14, zIndex: 1 }}>
        {icon ? (
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: iconBg,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: iconColor,
              flexShrink: 0,
            }}
          >
            <Icon name={icon as any} size={22} />
          </div>
        ) : null}
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: "#64748b" }}>{label}</span>
            {trend ? (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  padding: "1px 6px",
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 600,
                  background: "#ecfdf5",
                  color: "#059669",
                }}
              >
                {trend}
              </span>
            ) : null}
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#0f172a", letterSpacing: "-0.02em", marginTop: 2 }}>
            {value}
          </div>
          {sub ? (
            <div style={{ fontSize: 11.5, color: "#94a3b8", marginTop: 2 }}>
              {sub}
            </div>
          ) : null}
        </div>
      </div>
      <div style={{ width: 85, height: 42, opacity: 0.85, alignSelf: "flex-end", marginBottom: 2 }}>
        <svg viewBox="0 0 100 40" width="100%" height="100%" preserveAspectRatio="none">
          <defs>
            <linearGradient id={`spark-${(sparkColor || '#3b82f6').replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={sparkColor || '#3b82f6'} stopOpacity="0.25" />
              <stop offset="100%" stopColor={sparkColor || '#3b82f6'} stopOpacity="0.0" />
            </linearGradient>
          </defs>
          <path
            d="M 0 30 Q 25 12, 50 22 T 100 8"
            fill="none"
            stroke={sparkColor || '#3b82f6'}
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <path
            d="M 0 30 Q 25 12, 50 22 T 100 8 L 100 40 L 0 40 Z"
            fill={`url(#spark-${(sparkColor || '#3b82f6').replace('#', '')})`}
          />
        </svg>
      </div>
    </div>
  );
}

function DetailRowItem({
  icon,
  iconBg,
  iconColor,
  label,
  value,
  sub,
  copyable,
  external,
}: {
  icon: string;
  iconBg: string;
  iconColor: string;
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  copyable?: string;
  external?: string;
}) {
  const [copied, setCopied] = useState(false);
  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          background: iconBg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: iconColor,
          flexShrink: 0,
          marginTop: 2,
        }}
      >
        <Icon name={icon as any} size={18} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: "#64748b" }}>{label}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
          <span style={{ fontSize: 13.5, fontWeight: 700, color: "#0f172a", wordBreak: "break-word" }}>
            {value}
          </span>
          {copyable ? (
            <button
              type="button"
              onClick={() => handleCopy(copyable)}
              style={{
                background: "none",
                border: "none",
                padding: 0,
                color: copied ? "#10b981" : "#94a3b8",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
              }}
              title={copied ? "Copied!" : "Copy"}
            >
              {copied ? <Icon name="check" size={13} /> : (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect width="14" height="14" x="8" y="8" rx="2" ry="2"/>
                  <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>
                </svg>
              )}
            </button>
          ) : null}
          {external ? (
            <a
              href={external}
              target="_blank"
              rel="noreferrer"
              style={{ color: "#94a3b8", display: "inline-flex", alignItems: "center" }}
              title="Open URL"
            >
              <Icon name="external" size={13} />
            </a>
          ) : null}
        </div>
        {sub ? <div style={{ fontSize: 12, color: "#64748b", marginTop: 1 }}>{sub}</div> : null}
      </div>
    </div>
  );
}

// Image field with inline preview + upload + remove — used for both the
// org logo and favicon in the edit form. `value` is the stored public URL
// ("" when none); `onPick` runs the presigned upload, `onRemove` clears it.
function AssetUploadField({
  value,
  uploading,
  accept,
  uploadedLabel,
  onPick,
  onRemove,
}: {
  value: string;
  uploading: boolean;
  accept: string;
  uploadedLabel: string;
  onPick: (file: File) => void;
  onRemove: () => void;
}) {
  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) onPick(file);
  };
  return value ? (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 11px", border: "1px solid var(--line-2)", borderRadius: 11, background: "var(--surface)" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={value}
        alt="Preview"
        style={{ width: 40, height: 40, objectFit: "contain", borderRadius: 8, border: "1px solid var(--line-2)", background: "var(--surface)", flexShrink: 0 }}
      />
      <span className="muted" style={{ flex: 1, minWidth: 0, fontSize: 12.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {uploading ? "Uploading…" : uploadedLabel}
      </span>
      <label style={{ flexShrink: 0, cursor: "pointer", color: "var(--brand)", fontWeight: 600, fontSize: 12.5 }}>
        <input type="file" accept={accept} style={{ display: "none" }} onChange={onChange} />
        Replace
      </label>
      <button
        type="button"
        aria-label="Remove"
        title="Remove"
        onClick={onRemove}
        style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", width: 26, height: 26, borderRadius: 7, border: "1px solid var(--line-2)", background: "var(--surface)", color: "var(--muted)", cursor: "pointer", fontSize: 13, lineHeight: 1 }}
      >
        ✕
      </button>
    </div>
  ) : (
    <label style={{ display: "flex", alignItems: "center", gap: 8, padding: "11px 13px", border: "1px dashed var(--line-2)", borderRadius: 11, background: "var(--surface)", cursor: "pointer", fontSize: 13, color: "var(--muted)" }}>
      <input type="file" accept={accept} style={{ display: "none" }} onChange={onChange} />
      {uploading ? (
        "Uploading…"
      ) : (
        <>
          <Icon name="upload" size={16} /> Upload ·{" "}
          <span style={{ color: "var(--brand)", fontWeight: 600 }}>browse</span>
        </>
      )}
    </label>
  );
}

export default function SuperAdminOrganisationDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { accessToken, isLoading: authLoading, hasPermission } = useAuth();
  const canEditOrganisation = hasPermission("admin_organisations", "edit");
  const canActivateOrganisation = hasPermission("admin_organisations", "add");
  const canDeactivateOrganisation = hasPermission("admin_organisations", "approve");
  const canDeleteOrganisation = hasPermission("admin_organisations", "delete");
  // Deliberately its own module (not admin_organisations "Edit") — sharing
  // that bit meant turning this off also turned off editing org details.
  const canUpgradeSubscription = hasPermission("admin_org_upgrade_subscription", "edit");
  const canAddOrgTemplates = hasPermission("admin_org_templates_add", "add");
  const canRemoveOrgTemplates = hasPermission("admin_org_templates_remove", "delete");

  const [tab, setTab] = useState<Tab>("Overview");
  const [org, setOrg] = useState<OrganisationDetail | null>(null);
  const [users, setUsers] = useState<OrgUser[] | null>(null);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersReloadTick, setUsersReloadTick] = useState(0);
  const [activity, setActivity] = useState<OrganisationActivityRow[] | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);

  const [userFormOpen, setUserFormOpen] = useState(false);
  const [userForm, setUserForm] = useState<UserFormData>(EMPTY_USER_FORM);
  const [userFormError, setUserFormError] = useState<string | null>(null);
  const [userFormSubmitting, setUserFormSubmitting] = useState(false);
  const [userStatusBusyId, setUserStatusBusyId] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<EditForm>(EMPTY_EDIT_FORM);
  const [editError, setEditError] = useState<string | null>(null);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [faviconUploading, setFaviconUploading] = useState(false);

  const [statusSubmitting, setStatusSubmitting] = useState(false);
  const [statusModalOpen, setStatusModalOpen] = useState(false);

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Non-blocking notice — replaces window.alert (no native dialogs in this app).
  const [toast, setToast] = useState<string | null>(null);
  const notify = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 3000);
  };

  const [plans, setPlans] = useState<Plan[]>([]);
  const [assignedTemplates, setAssignedTemplates] = useState<any[]>([]);
  const [upgradePlanId, setUpgradePlanId] = useState<string>("");
  const [upgradeBillingCycle, setUpgradeBillingCycle] = useState<"monthly" | "yearly">("monthly");
  const [upgrading, setUpgrading] = useState(false);
  const [templateSaving, setTemplateSaving] = useState(false);
  const [templateRemoveTarget, setTemplateRemoveTarget] = useState<any | null>(null);
  const [templateRemoveBlocked, setTemplateRemoveBlocked] = useState<{ name: string; count: number } | null>(null);
  const [previewTpl, setPreviewTpl] = useState<any | null>(null);

  useEffect(() => {
    if (!authLoading && !accessToken) {
      router.replace("/login");
    }
  }, [authLoading, accessToken, router]);

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("tab");
    const match = TABS.find((t) => t === requested);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of the URL on mount
    if (match) setTab(match);
  }, []);

  useFlash(ORG_DETAIL_FLASH_KEY, (flash) => {
    const match = TABS.find((t) => t === flash.tab);
    if (match) setTab(match);
    if (flash.message) notify(flash.message);
  });

  useEffect(() => {
    if (!accessToken || !params.id) return;
    const headers = { Authorization: `Bearer ${accessToken}` };
    /* eslint-disable react-hooks/set-state-in-effect */
    setLoading(true);
    setNotFound(false);
    /* eslint-enable react-hooks/set-state-in-effect */

    Promise.all([
      apiFetch<OrganisationDetail>(`/admin/organisations/${params.id}`, { headers }),
      apiFetch<OrganisationActivityRow[]>(`/admin/organisations/${params.id}/activity`, { headers }),
    ])
      .then(([orgRes, activityRes]) => {
        setOrg(orgRes);
        setActivity(activityRes);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [accessToken, params.id]);

  useEffect(() => {
    if (!accessToken || !params.id) return;
    /* eslint-disable react-hooks/set-state-in-effect */
    setUsersLoading(true);
    /* eslint-enable react-hooks/set-state-in-effect */
    apiFetch<OrgUsersListResponse>(`/admin/organisations/${params.id}/users?limit=100`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then((res) => setUsers(res.data))
      .catch(() => setUsers(null))
      .finally(() => setUsersLoading(false));
  }, [accessToken, params.id, usersReloadTick]);

  useEffect(() => {
    if (!accessToken) return;
    apiFetch<Plan[]>("/admin/plans", { headers: { Authorization: `Bearer ${accessToken}` } }).then(setPlans).catch(() => { });
  }, [accessToken]);

  const [domainsData, setDomainsData] = useState<any | null>(null);
  const [domainsLoading, setDomainsLoading] = useState(false);

  useEffect(() => {
    if (!accessToken || !params.id) return;
    setDomainsLoading(true);
    apiFetch<any>(`/admin/organisations/${params.id}/domains`, { headers: { Authorization: `Bearer ${accessToken}` } })
      .then((data) => {
        setDomainsData(data);
      })
      .catch(() => setDomainsData(null))
      .finally(() => setDomainsLoading(false));
  }, [accessToken, params.id, tab]);

  useEffect(() => {
    if (!accessToken || !params.id) return;
    apiFetch<any[]>(`/admin/organisations/${params.id}/templates`, { headers: { Authorization: `Bearer ${accessToken}` } })
      .then(setAssignedTemplates).catch(() => setAssignedTemplates([]));
  }, [accessToken, params.id, tab, org?.assignedTemplates]);

  function openCreateUser() {
    setUserForm(EMPTY_USER_FORM);
    setUserFormError(null);
    setUserFormOpen(true);
  }

  async function submitCreateUser() {
    if (!accessToken || !params.id) return;
    setUserFormSubmitting(true);
    setUserFormError(null);
    try {
      const body: CreateOrgUserInput = {
        firstName: userForm.firstName,
        lastName: userForm.lastName,
        email: userForm.email,
        phoneNumber: userForm.phoneNumber || undefined,
        role: userForm.role,
      };
      await apiFetch(`/admin/organisations/${params.id}/users`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify(body),
      });
      setUserFormOpen(false);
      setUsersReloadTick((t) => t + 1);
    } catch (err) {
      setUserFormError(err instanceof Error ? err.message : "Failed to create user.");
    } finally {
      setUserFormSubmitting(false);
    }
  }

  async function toggleUserStatus(user: OrgUser) {
    if (!accessToken || !params.id) return;
    const nextStatus = user.status === "active" ? "disabled" : "active";
    setUserStatusBusyId(user.id);
    try {
      await apiFetch(`/admin/organisations/${params.id}/users/${user.id}/status`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ status: nextStatus }),
      });
      setUsersReloadTick((t) => t + 1);
    } catch (err) {
      notify(err instanceof Error ? err.message : "Failed to update user status.");
    } finally {
      setUserStatusBusyId(null);
    }
  }

  function startEdit() {
    if (!org) return;
    setEditForm({
      name: org.name,
      city: org.city,
      timezone: org.timezone,
      currency: org.currency,
      defaultLanguage: org.defaultLanguage,
      website: org.website ?? "",
      addressLine1: org.addressLine1 ?? "",
      addressLine2: org.addressLine2 ?? "",
      state: org.state ?? "",
      postalCode: org.postalCode ?? "",
      country: org.country ?? "",
      logoUrl: org.logoUrl ?? "",
      faviconUrl: org.faviconUrl ?? "",
      brandColour: org.brandColour ?? "",
    });
    setEditError(null);
    setEditing(true);
  }

  // Logo + favicon share one presigned-upload flow — same shape as the
  // signup wizard's logo upload, just pointed at the admin org-scoped
  // endpoint (key is scoped to this org id server-side).
  async function handleAssetUpload(kind: "logo" | "favicon", file: File) {
    if (!org || !accessToken) return;
    const setBusy = kind === "logo" ? setLogoUploading : setFaviconUploading;
    const formKey: "logoUrl" | "faviconUrl" = kind === "logo" ? "logoUrl" : "faviconUrl";
    setEditError(null);
    setBusy(true);
    try {
      const { uploadUrl, publicUrl } = await apiFetch<{ uploadUrl: string; publicUrl: string }>(
        `/admin/organisations/${org.id}/${kind}-upload-url`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ filename: file.name, contentType: file.type, size: file.size }),
        },
      );
      const put = await fetch(uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
      if (!put.ok) throw new Error(`Upload failed (${put.status}).`);
      setEditForm((f) => ({ ...f, [formKey]: publicUrl }));
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Upload failed — please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleEditSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!org || !accessToken) return;
    setEditError(null);
    setEditSubmitting(true);
    // brandColour is validated server-side as a strict hex — only send it
    // when it's a real value, so editing an org that never set one doesn't 400.
    const { brandColour, ...rest } = editForm;
    const payload: Partial<EditForm> = { ...rest };
    if (/^#[0-9a-fA-F]{6}$/.test(brandColour)) payload.brandColour = brandColour;
    try {
      await apiFetch(`/admin/organisations/${org.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify(payload),
      });
      setOrg((prev) => (prev ? { ...prev, ...editForm } : prev));
      setEditing(false);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Failed to save changes.");
    } finally {
      setEditSubmitting(false);
    }
  }

  async function confirmToggleStatus() {
    if (!org || !accessToken) return;
    const next = org.status === "active" ? "disabled" : "active";

    setStatusSubmitting(true);
    try {
      await apiFetch(`/admin/organisations/${org.id}/status`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ status: next }),
      });
      setOrg((prev) => (prev ? { ...prev, status: next } : prev));
      setStatusModalOpen(false);
    } catch (err) {
      notify(err instanceof Error ? err.message : "Failed to update status.");
    } finally {
      setStatusSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!org || !accessToken) return;
    setDeleteError(null);
    setDeleting(true);
    try {
      await apiFetch(`/admin/organisations/${org.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      router.push("/admin-console/organisations");
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete organisation.");
      setDeleting(false);
    }
  }

  async function confirmRemoveTemplate() {
    if (!org || !accessToken || !templateRemoveTarget) return;
    const templateId = templateRemoveTarget.templateId;
    setTemplateSaving(true);
    try {
      const nextIds = assignedTemplates
        .filter((item) => item.templateId !== templateId)
        .map((item) => item.templateId);
      await apiFetch(`/admin/organisations/${org.id}/templates`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ templateIds: nextIds }),
      });
      setAssignedTemplates((prev) => prev.filter((item) => item.templateId !== templateId));
      setTemplateRemoveTarget(null);
    } catch (err) {
      notify(err instanceof Error ? err.message : "Failed to remove template.");
      setTemplateRemoveTarget(null);
    } finally {
      setTemplateSaving(false);
    }
  }

  function requestRemoveTemplate(template: any) {
    const count = template.landingPageCount ?? 0;
    if (count > 0) {
      setTemplateRemoveBlocked({ name: template.template?.name ?? "this template", count });
      return;
    }
    setTemplateRemoveTarget(template);
  }

  if (authLoading || !accessToken || loading) {
    return null;
  }

  if (notFound || !org) {
    return (
      <div className="card">
        <div className="card-b">
          <p className="muted">Organisation not found.</p>
        </div>
      </div>
    );
  }

  // Invited users have no name until they set one themselves at first
  // login — fall back to their email rather than rendering blank.
  const adminName = org.admin
    ? [org.admin.firstName, org.admin.lastName].filter(Boolean).join(" ") || org.admin.email
    : "—";

  return (
    <>
      {/* Breadcrumb */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 7,
          fontSize: 13,
          color: "#64748b",
          marginBottom: 16,
        }}
      >
        <button
          type="button"
          onClick={() => router.push("/admin-console/organisations")}
          style={{
            background: "none",
            border: "none",
            padding: 0,
            color: "#64748b",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            fontSize: 13,
          }}
        >
          <span style={{ fontSize: 14 }}>←</span>
          <span>Organisations</span>
        </button>
        <span style={{ color: "#94a3b8" }}>›</span>
        <span style={{ color: "#0f172a", fontWeight: 600 }}>{org.name}</span>
      </div>

      {/* Hero Header Banner */}
      <div
        style={{
          background: "#ffffff",
          border: "1px solid #eef2f6",
          borderRadius: 18,
          padding: "20px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 20,
          marginBottom: 20,
          boxShadow: "0 1px 3px rgba(0,0,0,0.02)",
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 16,
              background: "linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#ffffff",
              fontWeight: 700,
              fontSize: 20,
              flexShrink: 0,
              boxShadow: "0 4px 12px rgba(59,130,246,0.25)",
            }}
          >
            {initials(org.name)}
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <h1
                style={{
                  fontSize: 22,
                  fontWeight: 800,
                  color: "#0f172a",
                  margin: 0,
                  letterSpacing: "-0.02em",
                }}
              >
                {org.name}
              </h1>
              <div style={{ display: "flex", alignItems: "center", gap: 6, background: "#ecfdf5", border: "1px solid #a7f3d0", padding: "3px 10px", borderRadius: 8 }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#10b981" }} />
                <span style={{ fontSize: 12, fontWeight: 600, color: "#059669", textTransform: "capitalize" }}>
                  {orgStatusMeta(org.status).label}
                </span>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, color: "#64748b", fontSize: 13, marginTop: 6, flexWrap: "wrap" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <Icon name="pin" size={13} style={{ color: "#94a3b8" }} />
                <span>{org.city || "Mumbai"}</span>
              </span>
              <span style={{ color: "#cbd5e1" }}>|</span>
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <Icon name="profile" size={13} style={{ color: "#94a3b8" }} />
                <span className="mono">{org.slug}</span>
              </span>
              <span style={{ color: "#cbd5e1" }}>|</span>
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <Icon name="calendar" size={13} style={{ color: "#94a3b8" }} />
                <span>Onboarded {formatDate(org.createdAt)}</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 4 Stat Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 16,
          marginBottom: 20,
        }}
      >
        <StatTile
          icon="users"
          iconBg="#eff6ff"
          iconColor="#2563eb"
          label="Users"
          value={org.userCount != null ? <CountUp value={org.userCount} /> : "—"}
          sub={`${org.teamCount || 0} teams`}
          trend="↑ 0%"
          sparkColor="#3b82f6"
        />
        <StatTile
          icon="modules"
          iconBg="#faf5ff"
          iconColor="#9333ea"
          label="Sites"
          value={domainsData?.landingPages?.length ?? 0}
          sub={domainsData?.landingPages?.length ? `${domainsData.landingPages.length} published` : "No sites published"}
          sparkColor="#a855f7"
        />
        <StatTile
          icon="filter"
          iconBg="#f0fdf4"
          iconColor="#16a34a"
          label="Leads captured"
          value={0}
          sub="No data yet"
          sparkColor="#10b981"
        />
        <StatTile
          icon="billing"
          iconBg="#fff7ed"
          iconColor="#ea580c"
          label="Plan value"
          value={org.plan?.name ?? "Starter"}
          sub={org.planValue != null ? `₹${org.planValue.toLocaleString("en-IN")}` : "₹999"}
          sparkColor="#f97316"
        />
      </div>

      {/* Tabs */}
      <div
        style={{
          display: "flex",
          gap: 12,
          borderBottom: "1px solid #e2e8f0",
          marginBottom: 20,
        }}
      >
        {TABS.map((t) => {
          const active = tab === t;
          return (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              style={{
                background: "none",
                border: "none",
                borderBottom: active ? "2.5px solid #2563eb" : "2.5px solid transparent",
                padding: "10px 14px",
                fontSize: 14,
                fontWeight: active ? 700 : 500,
                color: active ? "#2563eb" : "#64748b",
                cursor: "pointer",
                marginBottom: -1,
                transition: "all 0.15s ease",
              }}
            >
              {t}
            </button>
          );
        })}
      </div>

      <div>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {tab === "Overview" ? (
            <Reveal delay={2}>
              <div className="card" style={{ padding: 22 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 8,
                        background: "#eff6ff",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "#2563eb",
                      }}
                    >
                      <Icon name="building" size={17} />
                    </div>
                    <span style={{ fontSize: 16.5, fontWeight: 700, color: "#0f172a" }}>Organisation details</span>
                  </div>
                  {!editing && canEditOrganisation ? (
                    <button
                      type="button"
                      onClick={startEdit}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "6px 14px",
                        borderRadius: 8,
                        border: "1px solid #e2e8f0",
                        background: "#fff",
                        fontSize: 13,
                        fontWeight: 600,
                        color: "#1e293b",
                        cursor: "pointer",
                        boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                      }}
                    >
                      <Icon name="edit" size={13} style={{ color: "#64748b" }} />
                      <span>Edit</span>
                    </button>
                  ) : null}
                </div>
                <div>
                  {editing ? (
                    <form onSubmit={handleEditSubmit} className={formPageStyles.page}>
                      <div className="row2">
                        <div className="field">
                          <label>Organisation name</label>
                          <input
                            className="inp"
                            required
                            value={editForm.name}
                            onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                          />
                        </div>
                        <div className="field">
                          <label>City</label>
                          <input
                            className="inp"
                            required
                            value={editForm.city}
                            onChange={(e) => setEditForm((f) => ({ ...f, city: e.target.value }))}
                          />
                        </div>
                      </div>
                      <div className="row2">
                        <div className="field">
                          <label>Timezone</label>
                          <input
                            className="inp"
                            value={editForm.timezone}
                            onChange={(e) => setEditForm((f) => ({ ...f, timezone: e.target.value }))}
                          />
                        </div>
                        <div className="field">
                          <label>Currency</label>
                          <input
                            className="inp"
                            value={editForm.currency}
                            onChange={(e) => setEditForm((f) => ({ ...f, currency: e.target.value }))}
                          />
                        </div>
                      </div>
                      <div className="row2">
                        <div className="field">
                          <label>Default language</label>
                          <input
                            className="inp"
                            value={editForm.defaultLanguage}
                            onChange={(e) => setEditForm((f) => ({ ...f, defaultLanguage: e.target.value }))}
                          />
                        </div>
                        <div className="field">
                          <label>Website</label>
                          <input
                            className="inp"
                            placeholder="https://…"
                            value={editForm.website}
                            onChange={(e) => setEditForm((f) => ({ ...f, website: e.target.value }))}
                          />
                        </div>
                      </div>
                      <div className="row2">
                        <div className="field">
                          <label>Address line 1</label>
                          <input
                            className="inp"
                            value={editForm.addressLine1}
                            onChange={(e) => setEditForm((f) => ({ ...f, addressLine1: e.target.value }))}
                          />
                        </div>
                        <div className="field">
                          <label>Address line 2</label>
                          <input
                            className="inp"
                            value={editForm.addressLine2}
                            onChange={(e) => setEditForm((f) => ({ ...f, addressLine2: e.target.value }))}
                          />
                        </div>
                      </div>
                      <div className="row2">
                        <div className="field">
                          <label>State</label>
                          <input
                            className="inp"
                            value={editForm.state}
                            onChange={(e) => setEditForm((f) => ({ ...f, state: e.target.value }))}
                          />
                        </div>
                        <div className="field">
                          <label>Postal code</label>
                          <input
                            className="inp"
                            value={editForm.postalCode}
                            onChange={(e) => setEditForm((f) => ({ ...f, postalCode: e.target.value }))}
                          />
                        </div>
                      </div>
                      <div className="row2">
                        <div className="field">
                          <label>Country</label>
                          <input
                            className="inp"
                            value={editForm.country}
                            onChange={(e) => setEditForm((f) => ({ ...f, country: e.target.value }))}
                          />
                        </div>
                        <div className="field">
                          <label>Brand colour</label>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <input
                              type="color"
                              className="colorpick"
                              value={/^#[0-9a-f]{6}$/i.test(editForm.brandColour) ? editForm.brandColour : "#0f1424"}
                              onChange={(e) => setEditForm((f) => ({ ...f, brandColour: e.target.value }))}
                              aria-label="Pick a brand colour"
                            />
                            <span className="mono">{(editForm.brandColour || "#0f1424").toUpperCase()}</span>
                          </div>
                        </div>
                      </div>
                      <div className="row2">
                        <div className="field">
                          <label>Logo</label>
                          <AssetUploadField
                            value={editForm.logoUrl}
                            uploading={logoUploading}
                            accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
                            uploadedLabel="Logo uploaded"
                            onPick={(file) => void handleAssetUpload("logo", file)}
                            onRemove={() => setEditForm((f) => ({ ...f, logoUrl: "" }))}
                          />
                        </div>
                        <div className="field">
                          <label>Favicon</label>
                          <AssetUploadField
                            value={editForm.faviconUrl}
                            uploading={faviconUploading}
                            accept="image/png,image/svg+xml,image/x-icon,image/vnd.microsoft.icon,.ico"
                            uploadedLabel="Favicon uploaded"
                            onPick={(file) => void handleAssetUpload("favicon", file)}
                            onRemove={() => setEditForm((f) => ({ ...f, faviconUrl: "" }))}
                          />
                        </div>
                      </div>
                      <FormAlert message={editError} />
                      <FormActions
                        onCancel={() => setEditing(false)}
                        busy={editSubmitting}
                        busyLabel="Saving…"
                        submitLabel="Save changes"
                        submitIcon="check"
                      />
                    </form>
                  ) : (
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                        gap: "24px 28px",
                      }}
                    >
                      <DetailRowItem
                        icon="building"
                        iconBg="#e0f2fe"
                        iconColor="#0284c7"
                        label="Organisation name"
                        value={org.name}
                      />
                      <DetailRowItem
                        icon="tag"
                        iconBg="#ede9fe"
                        iconColor="#6366f1"
                        label="Organisation slug"
                        value={org.slug}
                        copyable={org.slug}
                      />
                      <DetailRowItem
                        icon="profile"
                        iconBg="#eff6ff"
                        iconColor="#2563eb"
                        label="Admin"
                        value={adminName}
                        sub={org.admin?.email ?? "—"}
                      />
                      <DetailRowItem
                        icon="phone"
                        iconBg="#e0f2fe"
                        iconColor="#0284c7"
                        label="Phone"
                        value={org.admin?.phoneNumber || "+91 98250 11020"}
                      />
                      <DetailRowItem
                        icon="pin"
                        iconBg="#eff6ff"
                        iconColor="#2563eb"
                        label="City"
                        value={org.city}
                      />
                      <DetailRowItem
                        icon="link"
                        iconBg="#ede9fe"
                        iconColor="#6366f1"
                        label="Organisation slug"
                        value={org.slug}
                        copyable={org.slug}
                      />
                      <DetailRowItem
                        icon="calendar"
                        iconBg="#eff6ff"
                        iconColor="#2563eb"
                        label="Timezone"
                        value={org.timezone || "Asia/Kolkata"}
                      />
                      <DetailRowItem
                        icon="billing"
                        iconBg="#eff6ff"
                        iconColor="#2563eb"
                        label="Currency"
                        value={org.currency || "INR"}
                      />
                      <DetailRowItem
                        icon="globe"
                        iconBg="#e0f2fe"
                        iconColor="#0284c7"
                        label="Default language"
                        value={org.defaultLanguage || "en-IN"}
                      />
                      <DetailRowItem
                        icon="globe"
                        iconBg="#e0f2fe"
                        iconColor="#0284c7"
                        label="Website"
                        value={org.website || "Not added"}
                        external={org.website || undefined}
                      />
                    </div>
                  )}
                </div>
              </div>
            </Reveal>
          ) : null}

          {tab === "Subscription" ? (
            <Reveal delay={2}>
              <div className="card">
                <div className="card-h">
                  <span className="t">Subscription</span>
                  {org.subscription ? <span className={`badge ${(org.subscription as any).status === "active" ? "b-green" : "b-amber"}`}>{(org.subscription as any).status}</span> : <span className="badge b-gray">No subscription</span>}
                </div>
                <div className="card-b" style={{ display: "grid", gap: 16 }}>
                  {org.subscription ? (
                    <div style={{ display: "grid", gap: 10, padding: 14, border: "1px solid var(--line)", borderRadius: 12, background: "var(--surface-2)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                        <span className={`badge ${(org as any).plan?.badge || "b-indigo"}`}>{(org as any).plan?.name ?? (org.subscription as any).plan?.name ?? "—"}</span>
                        <span className="chip">{(org.subscription as any).billingCycle}</span>
                        <span className="chip">₹{((org.subscription as any).amount ?? 0).toLocaleString("en-IN")}</span>
                        {(org.subscription as any).mrr ? <span className="chip">MRR ₹{(org.subscription as any).mrr.toLocaleString("en-IN")}</span> : null}
                      </div>
                      <div className="grid g2" style={{ gap: 10, fontSize: 13 }}>
                        <div><span className="muted" style={{ fontSize: 11 }}>Plan value</span><br /><b>₹{((org as any).planValue ?? (org.subscription as any).amount ?? 0).toLocaleString("en-IN")}</b></div>
                        <div><span className="muted" style={{ fontSize: 11 }}>Renews</span><br /><b>{(org as any).subscriptionRenewsAt || (org.subscription as any).renewsAt ? new Date((org as any).subscriptionRenewsAt || (org.subscription as any).renewsAt).toLocaleDateString("en-GB") : "—"}</b></div>
                        <div><span className="muted" style={{ fontSize: 11 }}>Templates</span><br /><b>{assignedTemplates.length} assigned</b></div>
                        <div><span className="muted" style={{ fontSize: 11 }}>Created landing pages</span><br /><b>{(org as any).plan?.limits?.landingPagesCreate ?? "Unlimited"}</b></div>
                        <div><span className="muted" style={{ fontSize: 11 }}>Published landing pages</span><br /><b>{(org as any).plan?.limits?.landingPages ?? "Unlimited"}</b></div>
                        <div><span className="muted" style={{ fontSize: 11 }}>Status</span><br /><b>{(org.subscription as any).status}</b></div>
                      </div>
                    </div>
                  ) : <div className="help">No subscription yet — approvals created one after package selection.</div>}

                  <div>
                    <div style={{ fontWeight: 700, marginBottom: 8 }}>Upgrade package</div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
                      <span style={{ fontSize: 12, fontWeight: 600 }}>Billing:</span>
                      <div style={{ display: "flex", gap: 4, background: "#eef1f6", borderRadius: 999, padding: 3 }}>
                        {(["monthly", "yearly"] as const).map(c => (
                          <button key={c} type="button" onClick={() => setUpgradeBillingCycle(c)} style={{ padding: "6px 12px", borderRadius: 999, border: "none", background: upgradeBillingCycle === c ? "#fff" : "transparent", fontWeight: 600, fontSize: 12, cursor: "pointer", textTransform: "capitalize", boxShadow: upgradeBillingCycle === c ? "0 1px 4px rgba(0,0,0,.1)" : "none" }}>{c}</button>
                        ))}
                      </div>
                    </div>
                    <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))", gap: 10 }}>
                      {plans.map(p => {
                        const isCurrent = (org as any).plan?.id === p.id || (org.subscription as any)?.planId === p.id;
                        const isSelected = upgradePlanId === p.id;
                        const price = upgradeBillingCycle === "monthly" ? p.priceMonthly : p.priceYearly;
                        return (
                          <div key={p.id} onClick={() => setUpgradePlanId(p.id)} style={{ border: "2px solid", borderColor: isSelected ? "var(--brand)" : isCurrent ? "var(--green)" : "var(--line)", borderRadius: 14, padding: 12, cursor: "pointer", background: isSelected ? "var(--brand-050)" : "#fff" }}>
                            <div className={`badge ${p.badge}`}>{p.name}</div>
                            <div style={{ fontWeight: 800, marginTop: 6 }}>₹{price.toLocaleString("en-IN")}<span style={{ fontSize: 11, color: "var(--muted)" }}>{upgradeBillingCycle === "monthly" ? "/mo" : "/yr"}</span></div>
                            <div style={{ fontSize: 11, color: "var(--muted)" }}>{(p.limits as any)?.templates} templates · {p.limits?.projects} projects</div>
                            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 3 }}>{p.limits?.users ?? "Unlimited"} users</div>
                            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 3 }}>{p.limits?.landingPagesCreate ?? "Unlimited"} created · {p.limits?.landingPages ?? "Unlimited"} published pages</div>
                            <div style={{ fontSize: 11, fontWeight: 700, color: isCurrent ? "var(--green)" : isSelected ? "var(--brand)" : "var(--muted)", marginTop: 6 }}>{isCurrent ? "Current" : isSelected ? "Selected" : "Select"}</div>
                          </div>
                        );
                      })}
                    </div>
                    {canUpgradeSubscription ? (
                      <div style={{ marginTop: 12, display: "flex", gap: 10 }}>
                        <button className="btn btn-primary btn-sm" disabled={upgrading || !upgradePlanId} onClick={async () => {
                          if (!upgradePlanId) return;
                          setUpgrading(true);
                          try {
                            if (org.subscription) {
                              await apiFetch(`/admin/subscriptions/${(org.subscription as any).id}`, { method: "PATCH", headers: { Authorization: `Bearer ${accessToken}` }, body: JSON.stringify({ planId: upgradePlanId, billingCycle: upgradeBillingCycle }) });
                            } else {
                              await apiFetch(`/admin/subscriptions`, { method: "POST", headers: { Authorization: `Bearer ${accessToken}` }, body: JSON.stringify({ orgId: org.id, planId: upgradePlanId, billingCycle: upgradeBillingCycle }) });
                            }
                            const fresh = await apiFetch<OrganisationDetail>(`/admin/organisations/${org.id}`, { headers: { Authorization: `Bearer ${accessToken}` } });
                            setOrg(fresh);
                            setUpgradePlanId("");
                            notify("Subscription upgraded");
                          } catch (e: any) { notify(e.message || "Upgrade failed"); }
                          finally { setUpgrading(false); }
                        }}>
                          {upgrading ? "Upgrading…" : "Upgrade subscription"}
                        </button>
                        <span className="muted" style={{ fontSize: 12, alignSelf: "center" }}>Upgrade increases template limit — then add more in Templates tab.</span>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </Reveal>
          ) : null}

          {tab === "Templates" ? (
            <Reveal delay={2}>
              <div className="card">
                <div className="card-h">
                  <span className="t">Assigned templates</span>
                  <span className="chip">{assignedTemplates.length} selected</span>
                  {canAddOrgTemplates ? (
                    <button className="btn btn-primary btn-sm" onClick={() => router.push(`/admin-console/organisation-detail/${encodeURIComponent(org.id)}/templates/add`)}>+ Add template</button>
                  ) : null}
                </div>
                <div className="card-b">
                  {assignedTemplates.length === 0 ? <p className="muted">No templates assigned — add from available templates (limit depends on package).</p> : (
                    <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(160px,1fr))", gap: 12 }}>
                      {assignedTemplates.map((at: any) => (
                        <div key={at.templateId} style={{ border: "1px solid var(--line)", borderRadius: 12, overflow: "hidden" }}>
                          <div style={{ height: 100, background: at.template.thumbnail ? `url(${at.template.thumbnail}) center/cover` : "#eef1f6", position: "relative" }}>
                            <button type="button" onClick={() => setPreviewTpl(at.template)} className="absolute right-2 top-2 rounded-full bg-white/90 p-1.5 shadow" title="Preview"><Icon name="eye" size={14} /></button>
                          </div>
                          <div style={{ padding: 10 }}>
                            <div style={{ fontWeight: 700, fontSize: 12 }}>{at.template.name}</div>
                            <div style={{ fontSize: 11, color: "var(--muted)" }}>{at.template.slug}</div>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 8 }}>
                              <div style={{ fontSize: 11, color: "var(--muted)" }}>
                                Built pages: <strong style={{ color: "var(--ink)" }}>{at.landingPageCount ?? 0}</strong>
                              </div>
                              {canRemoveOrgTemplates ? (
                                <button
                                  type="button"
                                  className="btn btn-ghost btn-sm"
                                  style={{ padding: "6px 8px", color: "var(--rose)" }}
                                  onClick={() => requestRemoveTemplate(at)}
                                  disabled={templateSaving}
                                  title="Remove template"
                                  aria-label={`Remove ${at.template.name}`}
                                >
                                  <Icon name="trash" size={13} />
                                </button>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>Starter allows 1 template, Pro 2, Pro Max All — upgrade subscription to increase limit, then add more here.</p>
                </div>
              </div>

              {previewTpl ? (
                <Modal
                  open
                  onClose={() => setPreviewTpl(null)}
                  title={previewTpl.name}
                  description={`${previewTpl.slug} · ${previewTpl.category}`}
                  size="lg"
                  flush
                >
                  <div style={{ height: 320, background: previewTpl.thumbnail ? `url(${previewTpl.thumbnail}) center/cover` : "#eef1f6" }} />
                </Modal>
              ) : null}
            </Reveal>
          ) : null}

          {tab === "Domains" ? (
            <Reveal delay={2}>
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                    gap: 10,
                  }}
                >
                  <StatTile
                    label="Configured custom domains"
                    value={domainsData?.customDomain ? 1 : 0}
                    sub="Custom domains connected"
                  />
                  <StatTile
                    label="Primary custom domain"
                    value={
                      <span style={{ fontSize: 14, letterSpacing: "0em" }}>
                        {domainsData?.customDomain ?? "—"}
                      </span>
                    }
                    accent="#10b981"
                    sub={
                      domainsData?.customDomain ? (
                        <span className={`badge ${domainsData.customDomainStatus === "connected" ? "b-green" : "b-gray"}`} style={{ fontSize: 10 }}>
                          {domainsData.customDomainStatus ?? "none"}
                        </span>
                      ) : undefined
                    }
                  />
                  <StatTile
                    label="Mapped landing page"
                    value={domainsData?.customDomainLandingPageId ? 1 : 0}
                    sub="Serving custom domain"
                  />
                </div>

                <div className="card">
                  <div className="card-h">
                    <span className="t">Custom Domains</span>
                    <span className="chip">
                      {domainsData?.customDomain ? 1 : 0} total
                    </span>
                  </div>
                  <div className="tbl-wrap">
                    <table className="tbl">
                      <thead>
                        <tr>
                          <th>Scope / Website</th>
                          <th>Domain / Host</th>
                          <th>Kind</th>
                          <th>Status</th>
                          <th>DNS</th>
                          <th>SSL</th>
                          <th>Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {domainsLoading ? (
                          <tr><td colSpan={7} className="muted">Loading domains…</td></tr>
                        ) : (
                          <>
                            {/* 1. Organisation Primary Custom Domain (if configured) */}
                            {domainsData?.customDomain ? (
                              <tr style={{ background: "var(--surface-2)" }}>
                                <td>
                                  <span style={{ fontWeight: 800, color: "var(--brand)" }}>Organisation Domain</span>
                                  <br /><span className="muted sm">Primary company domain</span>
                                </td>
                                <td style={{ fontFamily: "monospace", fontWeight: 800 }}>{domainsData.customDomain}</td>
                                <td><span className="badge b-indigo">Org Custom Domain</span></td>
                                <td>
                                  <span className={`badge ${domainsData.customDomainStatus === "connected" ? "b-green" : domainsData.customDomainStatus === "pending" ? "b-amber" : "b-gray"}`}>
                                    {domainsData.customDomainStatus}
                                  </span>
                                </td>
                                <td><span className="badge b-gray">Active</span></td>
                                <td><span className="badge b-gray">Active</span></td>
                                <td className="muted" style={{ fontSize: 12 }}>—</td>
                              </tr>
                            ) : null}

                            {/* 2. Landing page served by the primary custom domain */}
                            {domainsData?.customDomainLandingPageId ? (
                              <tr style={{ background: "var(--surface-2)" }}>
                                <td>
                                  <span style={{ fontWeight: 800, color: "var(--brand)" }}>Landing Page</span>
                                  <br /><span className="muted sm">Served at the custom domain</span>
                                </td>
                                <td style={{ fontFamily: "monospace", fontWeight: 800 }}>
                                  {domainsData.landingPages?.find((p: any) => p.id === domainsData.customDomainLandingPageId)?.name ??
                                    domainsData.landingPages?.[0]?.name ??
                                    "—"}
                                </td>
                                <td><span className="badge b-sky">Mapped Page</span></td>
                                <td><span className="badge b-green">Connected</span></td>
                                <td><span className="badge b-gray">Active</span></td>
                                <td><span className="badge b-gray">Active</span></td>
                                <td className="muted" style={{ fontSize: 12 }}>via org custom domain</td>
                              </tr>
                            ) : null}

                            {!domainsData?.customDomain ? (
                              <tr><td colSpan={7} className="muted">No custom domains configured for this organisation.</td></tr>
                            ) : null}
                          </>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </Reveal>
          ) : null}

          {tab === "Activity" ? (
            <Reveal delay={2}>
              <div className="card">
                <div className="card-h">
                  <span className="t">All activity</span>
                </div>
                <div className="card-b">
                  {!activity || activity.length === 0 ? (
                    <p className="muted">No activity yet.</p>
                  ) : (
                    <ul className="timeline">
                      {activity.map((entry) => (
                        <li key={entry.id}>
                          <span className="td" />
                          <b style={{ fontSize: 13 }}>{formatActionLabel(entry.action)}</b>
                          <div className="tt">
                            {entry.entity ?? "—"} · {formatDateTime(entry.createdAt)}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </Reveal>
          ) : null}
        </div>
      </div>

      <Modal
        open={!!templateRemoveBlocked}
        onClose={() => setTemplateRemoveBlocked(null)}
        title="Template In Use"
        footer={
          <button className="btn btn-primary" type="button" onClick={() => setTemplateRemoveBlocked(null)}>
            Understood
          </button>
        }
      >
        <div style={{ fontSize: 13.5, color: "var(--ink-2)", lineHeight: 1.6 }}>
          {templateRemoveBlocked
            ? `Can't remove this template — ${templateRemoveBlocked.count} landing page${templateRemoveBlocked.count === 1 ? "" : "s"} in this organisation ${templateRemoveBlocked.count === 1 ? "was" : "were"} built from it. Delete ${templateRemoveBlocked.count === 1 ? "that page" : "those pages"} first if you want to remove the template.`
            : ""}
        </div>
      </Modal>

      <ConfirmModal
        open={statusModalOpen}
        title={org.status === "active" ? "Suspend organisation?" : "Reactivate organisation?"}
        message={
          org.status === "active" ? (
            <>
              <strong>&quot;{org.name}&quot;</strong> will be marked disabled. No data is deleted — you
              can reactivate any time.
            </>
          ) : (
            <>
              <strong>&quot;{org.name}&quot;</strong> will be marked active again.
            </>
          )
        }
        confirmLabel={
          statusSubmitting
            ? "Saving…"
            : org.status === "active"
              ? "Suspend organisation"
              : "Reactivate organisation"
        }
        destructive={org.status === "active"}
        busy={statusSubmitting}
        onConfirm={() => void confirmToggleStatus()}
        onClose={() => {
          if (!statusSubmitting) setStatusModalOpen(false);
        }}
      />

      <ConfirmModal
        open={deleteModalOpen}
        title="Delete organisation?"
        message={
          <>
            <strong>&quot;{org.name}&quot;</strong> and its {org.userCount} user
            {org.userCount === 1 ? "" : "s"} will be permanently deleted.
            <span style={{ display: "block", marginTop: 8, color: "#64748b" }}>This action cannot be undone.</span>
            {deleteError ? (
              <div
                style={{
                  color: "#e11d48",
                  fontSize: 13,
                  marginTop: 12,
                  background: "#fef2f2",
                  padding: "8px 12px",
                  borderRadius: 8,
                }}
              >
                {deleteError}
              </div>
            ) : null}
          </>
        }
        confirmLabel="Delete organisation"
        destructive
        busy={deleting}
        onConfirm={() => void handleDelete()}
        onClose={() => {
          if (!deleting) setDeleteModalOpen(false);
        }}
      />

      <ConfirmModal
        open={!!templateRemoveTarget}
        title="Remove template from organisation?"
        message={
          templateRemoveTarget
            ? `Remove "${templateRemoveTarget.template?.name ?? "this template"}" from this organisation? If landing pages were created from it, the removal will be blocked.`
            : ""
        }
        confirmLabel={templateSaving ? "Removing…" : "Remove template"}
        destructive
        onConfirm={confirmRemoveTemplate}
        onClose={() => {
          if (!templateSaving) setTemplateRemoveTarget(null);
        }}
      />

      {toast ? (
        <div style={{ position: "fixed", right: 20, bottom: 20, zIndex: 500 }}>
          <div
            className="card"
            style={{ padding: "12px 16px", boxShadow: "var(--sh-lg)" }}
          >
            {toast}
          </div>
        </div>
      ) : null}
    </>
  );
}
