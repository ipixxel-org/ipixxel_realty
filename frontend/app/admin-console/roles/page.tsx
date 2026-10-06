"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { apiFetch } from "@/lib/api";
import { Reveal } from "@/components/superadmin/reveal";
import { Icon } from "@/components/icons";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import type { DynamicRole } from "@/lib/types";
import { useFlash } from "@/lib/flash";
import { applyPermissionToggle } from "@/lib/permissions";
import { ListPager, usePagedRows } from "@/components/ui/list-pager";
import { ROLES_FLASH_KEY, ROLES_PATH, roleInUseMessage } from "./role-shared";

const PERMISSION_COLUMNS = [
  "canView",
  "canAdd",
  "canEdit",
  "canDelete",
  "canApprove",
  "canActivate",
  "canDeactivate",
  "canAddLead",
] as const;
type PermissionColumn = (typeof PERMISSION_COLUMNS)[number];

/** The API action for a column — camelCase columns map to snake_case actions
 *  (canAddLead -> add_lead). */
function columnAction(column: PermissionColumn): string {
  return column
    .slice(3)
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .toLowerCase();
}
// Actions offered when the API doesn't list a module's own set.
const DEFAULT_ACTIONS = ["view", "add", "edit", "delete", "approve"];

// A module only offers the actions the API lists for it (e.g. Dashboard is
// view-only, Users has Activate/Deactivate instead of Approve).
function supportsAction(row: { actions?: string[] }, column: PermissionColumn) {
  const actions = row.actions?.length ? row.actions : DEFAULT_ACTIONS;
  return actions.includes(columnAction(column));
}

/** Every column set to `enabled` where the module supports it, else false. */
function setColumns(row: { actions?: string[] }, enabled: (col: PermissionColumn) => boolean) {
  const out = {} as Record<PermissionColumn, boolean>;
  for (const col of PERMISSION_COLUMNS) out[col] = supportsAction(row, col) && enabled(col);
  return out;
}

function StatCardWithSparkline({
  icon,
  iconBg,
  iconColor,
  label,
  value,
  sparkColor,
}: {
  icon: string;
  iconBg: string;
  iconColor: string;
  label: string;
  value: number | string;
  sparkColor: string;
}) {
  return (
    <div
      style={{
        background: "#ffffff",
        border: "1px solid #eef2f6",
        borderRadius: 16,
        padding: "18px 20px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.02)",
        position: "relative",
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        minHeight: 100,
      }}
    >
      <div>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            background: iconBg,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: iconColor,
            marginBottom: 12,
          }}
        >
          <Icon name={icon as any} size={20} />
        </div>
        <div style={{ fontSize: 13, fontWeight: 500, color: "#64748b", marginBottom: 4 }}>
          {label}
        </div>
        <div style={{ fontSize: 24, fontWeight: 800, color: "#0f172a", letterSpacing: "-0.02em" }}>
          {value}
        </div>
      </div>
      <div style={{ width: 90, height: 44, opacity: 0.85, alignSelf: "flex-end", marginBottom: 4 }}>
        <svg viewBox="0 0 100 40" width="100%" height="100%" preserveAspectRatio="none">
          <defs>
            <linearGradient id={`spark-${sparkColor.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={sparkColor} stopOpacity="0.25" />
              <stop offset="100%" stopColor={sparkColor} stopOpacity="0.0" />
            </linearGradient>
          </defs>
          <path
            d="M 0 30 Q 25 12, 50 22 T 100 8"
            fill="none"
            stroke={sparkColor}
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <path
            d="M 0 30 Q 25 12, 50 22 T 100 8 L 100 40 L 0 40 Z"
            fill={`url(#spark-${sparkColor.replace('#', '')})`}
          />
        </svg>
      </div>
    </div>
  );
}

function getRoleBadgeInfo(key: string, name: string) {
  const k = (key || "").toLowerCase();
  const n = (name || "").toLowerCase();
  if (k.includes("admin") || n.includes("admin")) {
    return { icon: "crown", bg: "#f3e8ff", color: "#9333ea" };
  }
  if (k.includes("telecaller") || n.includes("telecaller")) {
    return { icon: "phone", bg: "#e0f2fe", color: "#0284c7" };
  }
  if (k.includes("sales") || n.includes("sales")) {
    return { icon: "reports", bg: "#fff7ed", color: "#ea580c" };
  }
  if (k.includes("test") || n.includes("test")) {
    return { icon: "document", bg: "#fdf2f8", color: "#db2777" };
  }
  if (k.includes("manager") || n.includes("manager")) {
    return { icon: "users", bg: "#e0e7ff", color: "#4f46e5" };
  }
  return { icon: "puzzle", bg: "#eff6ff", color: "#2563eb" };
}

export default function SuperAdminRolesPage() {
  const router = useRouter();
  const { accessToken, isLoading: authLoading } = useAuth();

  const [roles, setRoles] = useState<DynamicRole[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [search, setSearch] = useState("");

  const [confirmDeleteState, setConfirmDeleteState] = useState<DynamicRole | null>(null);
  // Shown instead of the delete confirmation when the role still has users.
  const [roleInUse, setRoleInUse] = useState<{ role: DynamicRole; action: string } | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  // Default permissions configuration modal state
  const [permissionsModalRole, setPermissionsModalRole] = useState<DynamicRole | null>(null);
  const [permissionsData, setPermissionsData] = useState<{
    moduleKey: string;
    label: string;
    description: string;
    // Actions the module supports (e.g. Dashboard is view-only). Missing = all.
    actions?: string[];
    // Pill text per action when it names a specific button (e.g. Publish).
    actionLabels?: Record<string, string>;
    canView: boolean;
    canAdd: boolean;
    canEdit: boolean;
    canDelete: boolean;
    canApprove: boolean;
    canActivate?: boolean;
    canDeactivate?: boolean;
    canAddLead?: boolean;
  }[]>([]);
  const [permLoading, setPermLoading] = useState(false);
  const [permSaving, setPermSaving] = useState(false);
  const [savingPermission, setSavingPermission] = useState<string | null>(null);
  const [permError, setPermError] = useState<string | null>(null);
  // The permissions panel renders above the role catalogue; the Permissions
  // buttons sit in the catalogue further down, so bring the panel into view
  // when it opens (otherwise it opens off-screen and the click looks dead).
  const permPanelRef = useRef<HTMLDivElement>(null);
  const permPanelRoleId = permissionsModalRole?.id ?? null;
  useEffect(() => {
    if (!permPanelRoleId) return;
    permPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [permPanelRoleId]);

  const notify = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  useFlash(ROLES_FLASH_KEY, (flash) => notify(flash.message));

  useEffect(() => {
    if (!authLoading && !accessToken) {
      router.replace("/login");
    }
  }, [authLoading, accessToken, router]);

  const fetchRoles = useCallback(() => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    apiFetch<DynamicRole[]>("/admin/roles", {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then(setRoles)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load roles"))
      .finally(() => setLoading(false));
  }, [accessToken]);

  useEffect(() => {
    fetchRoles();
  }, [fetchRoles]);

  const SYSTEM_KEYS = ["super_admin", "admin", "manager", "sales", "telecaller"];
  const isSystemRole = (key: string) => SYSTEM_KEYS.includes(key);

  const stats = useMemo(() => {
    let system = 0;
    let custom = 0;
    let assigned = 0;
    for (const r of roles) {
      if (isSystemRole(r.key)) system++;
      else custom++;
      assigned += r._count?.userRoles ?? 0;
    }
    return { total: roles.length, system, custom, assigned };
  }, [roles]);

  const visible = useMemo(
    () =>
      roles.filter(
        (r) =>
        (!search.trim() ||
          r.name.toLowerCase().includes(search.trim().toLowerCase()) ||
          r.key.toLowerCase().includes(search.trim().toLowerCase()) ||
          (r.description ?? "").toLowerCase().includes(search.trim().toLowerCase())),
      ),
    [roles, search],
  );
  // 10 per page; stats above still count every role.
  const paged = usePagedRows(visible, search);

  const handleDeleteConfirm = async () => {
    if (!accessToken || !confirmDeleteState) return;
    setDeleteBusy(true);
    try {
      await apiFetch(`/admin/roles/${confirmDeleteState.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      notify("Role deleted successfully");
      setConfirmDeleteState(null);
      fetchRoles();
    } catch (err: any) {
      notify(err.message || "Failed to delete role");
    } finally {
      setDeleteBusy(false);
    }
  };

  const openPermissionsModal = async (role: DynamicRole) => {
    if (!accessToken) return;
    setPermissionsModalRole(role);
    setPermLoading(true);
    setPermError(null);
    try {
      const res = await apiFetch<{
        permissions: {
          moduleKey: string;
          label: string;
          description: string;
          actions?: string[];
          actionLabels?: Record<string, string>;
          canView: boolean;
          canAdd: boolean;
          canEdit: boolean;
          canDelete: boolean;
          canApprove: boolean;
          canActivate?: boolean;
          canDeactivate?: boolean;
          canAddLead?: boolean;
        }[];
      }>(`/admin/roles/${role.id}/permissions`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      setPermissionsData(res.permissions || []);
    } catch (err: any) {
      setPermError(err.message || "Failed to load default permissions for role");
    } finally {
      setPermLoading(false);
    }
  };

  const savePermissionRows = async (nextRows: typeof permissionsData, key: string, message: string) => {
    if (!accessToken || !permissionsModalRole || permissionsModalRole.key === "super_admin") return;
    const previousRows = permissionsData;
    setPermissionsData(nextRows);
    setPermSaving(true);
    setSavingPermission(key);
    setPermError(null);
    try {
      await apiFetch(`/admin/roles/${permissionsModalRole.id}/permissions`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          permissions: nextRows.map((p) => ({
            moduleKey: p.moduleKey,
            canView: p.canView,
            canAdd: p.canAdd,
            canEdit: p.canEdit,
            canDelete: p.canDelete,
            canApprove: p.canApprove,
            canActivate: p.canActivate ?? false,
            canDeactivate: p.canDeactivate ?? false,
            canAddLead: p.canAddLead ?? false,
          })),
        }),
      });
      notify(message);
    } catch (err: any) {
      setPermissionsData(previousRows);
      notify(err.message || "Failed to save permissions");
    } finally {
      setPermSaving(false);
      setSavingPermission(null);
    }
  };

  const togglePerm = (moduleKey: string, action: PermissionColumn) => {
    const nextRows = permissionsData.map((item) => {
      if (item.moduleKey !== moduleKey) return item;
      // Granting an action grants View; removing View removes the rest —
      // except the Settings "My profile" pills (see applyPermissionToggle).
      return applyPermissionToggle(moduleKey, item, action, !item[action], PERMISSION_COLUMNS);
    });
    const moduleRow = permissionsData.find((item) => item.moduleKey === moduleKey);
    const moduleLabel = moduleRow?.label ?? "module";
    const pillLabel = moduleRow?.actionLabels?.[columnAction(action)] ?? action.replace("can", "");
    const nextValue = nextRows.find((item) => item.moduleKey === moduleKey)?.[action] ?? false;
    void savePermissionRows(nextRows, `${moduleKey}:${action}`, `${pillLabel} permission ${nextValue ? "enabled" : "removed"} for ${moduleLabel}`);
  };

  const setAllPerms = (grantAll: boolean, viewOnly: boolean = false) => {
    const nextRows = permissionsData.map((item) => ({
      ...item,
      ...setColumns(item, (col) => (col === "canView" ? grantAll || viewOnly : grantAll && !viewOnly)),
    }));
    void savePermissionRows(nextRows, "all-modules", grantAll ? "All permissions enabled" : viewOnly ? "View-only permissions enabled" : "All permissions removed");
  };

  const setModulePerms = (moduleKey: string, enabled: boolean) => {
    const item = permissionsData.find((row) => row.moduleKey === moduleKey);
    const nextRows = permissionsData.map((row) =>
      row.moduleKey === moduleKey
        ? { ...row, ...setColumns(row, () => enabled) }
        : row,
    );
    void savePermissionRows(nextRows, `${moduleKey}:all`, `${item?.label ?? "Module"} permissions ${enabled ? "enabled" : "removed"}`);
  };

  if (authLoading || !accessToken) return null;

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
        <Icon name="home" size={14} />
        <span>Platform</span>
        <span style={{ color: "#94a3b8" }}>›</span>
        <span style={{ color: "#0f172a", fontWeight: 600 }}>Organisation roles</span>
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
              width: 52,
              height: 52,
              borderRadius: 14,
              background: "linear-gradient(135deg, #e0e7ff 0%, #ede9fe 100%)",
              border: "1px solid #c7d2fe",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#4f46e5",
              flexShrink: 0,
            }}
          >
            <Icon name="settings" size={26} />
          </div>
          <div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: "#2563eb",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                marginBottom: 2,
              }}
            >
              SECURITY & ACCESS
            </div>
            <h1
              style={{
                fontSize: 22,
                fontWeight: 800,
                color: "#0f172a",
                margin: 0,
                letterSpacing: "-0.02em",
              }}
            >
              Organisation roles
            </h1>
            <p
              style={{
                margin: "4px 0 0",
                color: "#64748b",
                fontSize: 13.5,
                maxWidth: 700,
                lineHeight: 1.45,
              }}
            >
              Default roles and module permissions for organisation members. Super Admin console users and roles are managed under Platform Team.
            </p>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <button
            type="button"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              background: "#ffffff",
              border: "1px solid #e2e8f0",
              borderRadius: 10,
              padding: "9px 16px",
              fontSize: 13.5,
              fontWeight: 600,
              color: "#334155",
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
            onClick={() => void fetchRoles()}
            disabled={loading}
          >
            <Icon name="refresh" size={15} />
            <span>Refresh</span>
          </button>
          <button
            type="button"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              background: "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)",
              border: "none",
              borderRadius: 10,
              padding: "10px 18px",
              fontSize: 13.5,
              fontWeight: 600,
              color: "#fff",
              boxShadow: "0 2px 6px rgba(37,99,235,0.25)",
              cursor: "pointer",
            }}
            onClick={() => router.push(`${ROLES_PATH}/new`)}
          >
            <Icon name="plus" size={16} />
            <span>Create Role</span>
          </button>
        </div>
      </div>

      {permissionsModalRole ? (
        <div ref={permPanelRef} style={{ scrollMarginTop: 96 }}>
        <Reveal delay={1}>
          <div className="card" style={{ marginBottom: 24 }}>
            <div className="card-h" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setPermissionsModalRole(null)}
                  disabled={permSaving}
                  style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
                >
                  ← Back to Role
                </button>
                <div style={{ height: 18, width: 1, background: "var(--line, #e2e8f0)" }} />
                <span className="t" style={{ fontSize: 16 }}>
                  Default Permissions: <strong>{permissionsModalRole.name}</strong>
                </span>
                <span className="badge b-indigo" style={{ textTransform: "capitalize" }}>
                  {permissionsModalRole.scope}
                </span>
              </div>

              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button
                  className="btn btn-ghost btn-sm"
                  type="button"
                  onClick={() => setPermissionsModalRole(null)}
                  disabled={savingPermission !== null}
                >
                  Cancel
                </button>
              </div>
            </div>

            <div className="card-b" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {permError ? <div className="form-alert">{permError}</div> : null}

              {permissionsModalRole.key === "super_admin" || permissionsModalRole.key === "admin" ? (
                <div
                  style={{
                    padding: "10px 14px",
                    borderRadius: 8,
                    background: "rgba(99, 102, 241, 0.08)",
                    border: "1px solid rgba(99, 102, 241, 0.2)",
                    fontSize: 13,
                    color: "var(--fg)",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <Icon name="shield" size={16} />
                  <span>
                    <strong>System Note:</strong> The <code>{permissionsModalRole.name}</code> role starts with full access by default. Super Admin can customize these defaults.
                  </span>
                </div>
              ) : null}

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                <div style={{ fontSize: 13, color: "var(--muted, #64748b)" }}>
                  Configure module access and action capabilities granted by default for this role:
                </div>
              </div>

              <div className="platform-permissions-list org-permissions-list">
                {permLoading ? (
                  <div style={{ padding: 36, textAlign: "center", color: "var(--muted)" }}>
                    Loading module permissions…
                  </div>
                ) : (
                  <div>
                    <div className="platform-permissions-heading">
                      <span>Module</span>
                      <span>Permissions</span>
                    </div>
                    {permissionsData.map((item) => (
                      <div className="platform-permission-row" key={item.moduleKey}>
                        <div className="platform-permission-module">
                          <div style={{ fontWeight: 700, fontSize: 13.5 }}>{item.label}</div>
                          <div className="muted" style={{ fontSize: 12 }}>{item.description}</div>
                        </div>
                        <div className="platform-permission-actions">
                          {PERMISSION_COLUMNS.filter((action) => supportsAction(item, action)).map((action) => {
                            const enabled = permissionsModalRole.key === "super_admin" || item[action];
                            const actionKey = columnAction(action);
                            const label = item.actionLabels?.[actionKey] ?? action.replace("can", "");
                            return (
                              <button
                                className={`platform-permission-pill${enabled ? " is-enabled" : ""}`}
                                key={action}
                                type="button"
                                disabled={savingPermission !== null || permissionsModalRole.key === "super_admin"}
                                onClick={() => togglePerm(item.moduleKey, action)}
                                aria-pressed={enabled}
                                aria-label={`${label} permission for ${item.label}`}
                              >
                                <span className="platform-permission-dot" aria-hidden="true" />
                                {label}
                              </button>
                            );
                          })}
                          <span className="platform-permission-separator" aria-hidden="true" />
                          <button
                            className="platform-permission-bulk"
                            type="button"
                            disabled={savingPermission !== null || permissionsModalRole.key === "super_admin"}
                            onClick={() => setModulePerms(item.moduleKey, true)}
                          >
                            All
                          </button>
                          <button
                            className="platform-permission-bulk"
                            type="button"
                            disabled={savingPermission !== null || permissionsModalRole.key === "super_admin"}
                            onClick={() => setModulePerms(item.moduleKey, false)}
                          >
                            None
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 4 }}>
                <button
                  className="btn btn-ghost"
                  type="button"
                  onClick={() => setPermissionsModalRole(null)}
                  disabled={savingPermission !== null}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
          {toast ? (
            <div className="platform-permission-toast" role="status">
              <span className="platform-permission-toast-icon" aria-hidden="true">✓</span>
              <span>{toast}</span>
              <button type="button" onClick={() => setToast(null)} aria-label="Dismiss notification">×</button>
            </div>
          ) : null}
        </Reveal>
        </div>
      ) : null}

      {/* Summary strip */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 16,
          marginBottom: 20,
        }}
      >
        <StatCardWithSparkline
          icon="modules"
          iconBg="#eff6ff"
          iconColor="#2563eb"
          label="Total roles"
          value={stats.total}
          sparkColor="#3b82f6"
        />
        <StatCardWithSparkline
          icon="settings"
          iconBg="#f0fdf4"
          iconColor="#16a34a"
          label="System roles"
          value={stats.system}
          sparkColor="#10b981"
        />
        <StatCardWithSparkline
          icon="users"
          iconBg="#fff7ed"
          iconColor="#ea580c"
          label="Custom roles"
          value={stats.custom}
          sparkColor="#f97316"
        />
        <StatCardWithSparkline
          icon="team"
          iconBg="#faf5ff"
          iconColor="#9333ea"
          label="Assigned users"
          value={stats.assigned}
          sparkColor="#a855f7"
        />
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 16,
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ position: "relative", minWidth: 260, maxWidth: 360 }}>
          <input
            className="inp"
            placeholder="Search roles..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              paddingLeft: 36,
              paddingRight: 14,
              height: 38,
              fontSize: 13,
              borderRadius: 10,
              border: "1px solid #e2e8f0",
              background: "#ffffff",
              width: "100%",
            }}
          />
          <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#94a3b8" }}>
            <Icon name="search" size={15} />
          </span>
        </div>
        <div style={{ fontSize: 13, color: "#64748b", fontWeight: 500 }}>
          {loading ? "Loading…" : `${visible.length} of ${roles.length} roles`}
        </div>
      </div>

      <Reveal delay={1}>
        <div style={{ background: "#ffffff", border: "1px solid #eef2f6", borderRadius: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.02)", overflow: "hidden" }}>
          <div style={{ padding: "18px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #f1f5f9" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: "#e0e7ff", display: "flex", alignItems: "center", justifyContent: "center", color: "#4f46e5" }}>
                <Icon name="shield" size={16} />
              </div>
              <span style={{ fontSize: 16, fontWeight: 700, color: "#0f172a" }}>Role Catalogue</span>
            </div>
            <span style={{ fontSize: 12.5, color: "#64748b" }}>
              {visible.length} of {roles.length} roles
            </span>
          </div>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>ROLE NAME</th>
                  <th>KEY / SLUG</th>
                  <th>DESCRIPTION</th>
                  <th>ASSIGNED USERS</th>
                  <th>STATUS</th>
                  <th style={{ textAlign: "right", paddingRight: 24 }}>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {error ? (
                  <tr>
                    <td colSpan={6} className="muted">{error}</td>
                  </tr>
                ) : loading ? (
                  <tr>
                    <td colSpan={6} className="muted">Loading roles…</td>
                  </tr>
                ) : visible.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="muted">No organisation roles yet.</td>
                  </tr>
                ) : (
                  paged.pageRows.map((r) => {
                    const roleInfo = getRoleBadgeInfo(r.key, r.name);
                    return (
                      <tr key={r.id}>
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                            <div
                              style={{
                                width: 38,
                                height: 38,
                                borderRadius: 10,
                                background: roleInfo.bg,
                                color: roleInfo.color,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                flexShrink: 0,
                              }}
                            >
                              <Icon name={roleInfo.icon as any} size={18} />
                            </div>
                            <div>
                              <div style={{ fontWeight: 700, fontSize: 13.5, color: "#0f172a" }}>{r.name}</div>
                              <span
                                style={{
                                  display: "inline-block",
                                  marginTop: 3,
                                  padding: "2px 8px",
                                  borderRadius: 6,
                                  fontSize: 11,
                                  fontWeight: 600,
                                  background: isSystemRole(r.key) ? "#f1f5f9" : "#ecfdf5",
                                  color: isSystemRole(r.key) ? "#475569" : "#059669",
                                  border: isSystemRole(r.key) ? "1px solid #e2e8f0" : "1px solid #a7f3d0",
                                }}
                              >
                                {isSystemRole(r.key) ? "System Role" : "Custom Role"}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td>
                          <code style={{ fontSize: 12.5, color: "#475569", background: "none", padding: 0 }}>
                            {r.key}
                          </code>
                        </td>
                        <td style={{ maxWidth: 280, fontSize: 13, color: "#64748b" }}>
                          {r.description || "—"}
                        </td>
                        <td>
                          <span style={{ fontSize: 13, color: "#334155", fontWeight: 500 }}>
                            {r._count?.userRoles ?? 0} users
                          </span>
                        </td>
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span
                              style={{
                                width: 7,
                                height: 7,
                                borderRadius: "50%",
                                background: r.status === "active" ? "#10b981" : "#ef4444",
                              }}
                            />
                            <span
                              style={{
                                fontSize: 12.5,
                                fontWeight: 600,
                                color: r.status === "active" ? "#10b981" : "#ef4444",
                                textTransform: "capitalize",
                              }}
                            >
                              {r.status === "active" ? "Active" : "Inactive"}
                            </span>
                          </div>
                        </td>
                        <td style={{ textAlign: "right", paddingRight: 24 }}>
                          <div style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                            {r.key === "super_admin" ? (
                              <button
                                type="button"
                                disabled
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 5,
                                  padding: "6px 12px",
                                  borderRadius: 8,
                                  border: "1px solid #e2e8f0",
                                  background: "#f8fafc",
                                  color: "#94a3b8",
                                  fontSize: 12,
                                  fontWeight: 600,
                                  cursor: "not-allowed",
                                }}
                              >
                                <Icon name="lock" size={13} /> Full Access (Locked)
                              </button>
                            ) : (
                              <button
                                type="button"
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 5,
                                  padding: "6px 12px",
                                  borderRadius: 8,
                                  border: "1px solid #e2e8f0",
                                  background: "#ffffff",
                                  color: "#334155",
                                  fontSize: 12,
                                  fontWeight: 600,
                                  cursor: "pointer",
                                  transition: "all 0.15s ease",
                                }}
                                onClick={() => openPermissionsModal(r)}
                              >
                                <Icon name="shield" size={13} style={{ color: "#4f46e5" }} /> Permissions
                              </button>
                            )}

                            <button
                              type="button"
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 5,
                                padding: "6px 12px",
                                borderRadius: 8,
                                border: "1px solid #e2e8f0",
                                background: "#ffffff",
                                color: "#334155",
                                fontSize: 12,
                                fontWeight: 600,
                                cursor: "pointer",
                                transition: "all 0.15s ease",
                              }}
                              onClick={() => router.push(`${ROLES_PATH}/${encodeURIComponent(r.id)}/edit`)}
                            >
                              <Icon name="edit" size={13} style={{ color: "#64748b" }} /> Edit
                            </button>

                            {!isSystemRole(r.key) ? (
                              <button
                                type="button"
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 5,
                                  padding: "6px 12px",
                                  borderRadius: 8,
                                  border: "1px solid #fee2e2",
                                  background: "#ffffff",
                                  color: "#ef4444",
                                  fontSize: 12,
                                  fontWeight: 600,
                                  cursor: "pointer",
                                }}
                                onClick={() =>
                                  (r._count?.userRoles ?? 0) > 0
                                    ? setRoleInUse({ role: r, action: "delete it" })
                                    : setConfirmDeleteState(r)
                                }
                              >
                                <Icon name="trash" size={13} style={{ color: "#ef4444" }} /> Delete
                              </button>
                            ) : (
                              <button
                                type="button"
                                disabled
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 5,
                                  padding: "6px 12px",
                                  borderRadius: 8,
                                  border: "1px solid #f1f5f9",
                                  background: "#f8fafc",
                                  color: "#cbd5e1",
                                  fontSize: 12,
                                  fontWeight: 600,
                                  cursor: "not-allowed",
                                }}
                                title="System roles cannot be deleted"
                              >
                                <Icon name="trash" size={13} /> Delete
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <ListPager page={paged.page} total={paged.total} onPageChange={paged.setPage} noun="roles" />
        </div>
      </Reveal>

      {/* Role still has users — explain instead of deleting */}
      <ConfirmModal
        open={roleInUse !== null}
        title={`Can't delete role '${roleInUse?.role.name ?? ""}' yet`}
        message={
          roleInUse
            ? roleInUseMessage(roleInUse.role.name, roleInUse.role._count?.userRoles ?? 0, roleInUse.action)
            : ""
        }
        confirmLabel="OK"
        cancelLabel="Close"
        onConfirm={() => setRoleInUse(null)}
        onClose={() => setRoleInUse(null)}
      />

      {/* Delete Confirmation */}
      <ConfirmModal
        open={confirmDeleteState !== null}
        title={`Delete role '${confirmDeleteState?.name}'?`}
        message="This will permanently delete the custom role definition."
        confirmLabel="Delete Role"
        destructive
        busy={deleteBusy}
        onConfirm={handleDeleteConfirm}
        onClose={() => setConfirmDeleteState(null)}
      />

      {toast ? (
        <div style={{ position: "fixed", right: 20, bottom: 20, zIndex: 500 }}>
          <div className="card" style={{ padding: "12px 16px", boxShadow: "var(--sh-lg)" }}>
            {toast}
          </div>
        </div>
      ) : null}
    </>
  );
}
