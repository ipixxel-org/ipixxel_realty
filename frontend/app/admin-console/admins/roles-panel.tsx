"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { apiFetch } from "@/lib/api";
import { Reveal } from "@/components/superadmin/reveal";
import { Icon } from "@/components/icons";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import type { DynamicRole } from "@/lib/types";
import { ListPager, usePagedRows } from "@/components/ui/list-pager";

type PermissionColumn = "canView" | "canAdd" | "canEdit" | "canDelete" | "canApprove";
// `moduleKey` lets a pill shown under one row read/write a *different*
// module's column — used to nest "Upgrade subscription" under Organisations
// while keeping it stored independently of Organisations' own Edit bit (see
// admin_org_upgrade_subscription below).
type PermissionPill = { key: string; moduleKey?: string; permission: PermissionColumn; label: string };

const DEFAULT_PERMISSION_PILLS: PermissionPill[] = [
  { key: "canView", permission: "canView", label: "View" },
  { key: "canAdd", permission: "canAdd", label: "Add" },
  { key: "canEdit", permission: "canEdit", label: "Edit" },
  { key: "canDelete", permission: "canDelete", label: "Delete" },
  { key: "canApprove", permission: "canApprove", label: "Approve" },
];

// Per-module pill overrides — the backend still stores the same 5 boolean
// columns for every module, but a handful of console pages don't map 1:1
// onto generic View/Add/Edit/Delete/Approve actions. Relabelling (and
// dropping) pills here keeps the matrix truthful to what each page can
// actually do, without touching the shared column schema.
const MODULE_PERMISSION_PILLS: Record<string, PermissionPill[]> = {
  // Organisations has no "Approve" action; canAdd/canApprove are repurposed
  // as the Activate/Deactivate toggle instead. "Upgrade subscription" is
  // shown here (where a Super Admin looks for it, and where "All"/"None"
  // sweep it up) but is actually stored on its own module,
  // admin_org_upgrade_subscription (hidden from the module list below) — so
  // granting/revoking it never touches "Edit" or any other Organisations bit.
  admin_organisations: [
    { key: "canView", permission: "canView", label: "View" },
    { key: "activate", permission: "canAdd", label: "Activate" },
    { key: "deactivate", permission: "canApprove", label: "Deactivate" },
    { key: "canEdit", permission: "canEdit", label: "Edit" },
    {
      key: "upgradeSubscription",
      moduleKey: "admin_org_upgrade_subscription",
      permission: "canEdit",
      label: "Upgrade subscription",
    },
    {
      key: "addTemplates",
      moduleKey: "admin_org_templates_add",
      permission: "canAdd",
      label: "Add template",
    },
    {
      key: "removeTemplates",
      moduleKey: "admin_org_templates_remove",
      permission: "canDelete",
      label: "Remove template",
    },
    { key: "canDelete", permission: "canDelete", label: "Delete" },
  ],
  // The console dashboard is a read-only overview — there's nothing to add,
  // edit, delete or approve.
  admin_dashboard: [
    { key: "canView", permission: "canView", label: "View" },
  ],
  // Covers both the Members and Roles tabs (there's no separate "Platform
  // roles" module). Members: viewed, invited (Add), edited, disabled and
  // removed. Roles: viewed, created (Add), edited/permissions-managed and
  // deleted. Neither tab has an "Approve" step, so canApprove is repurposed
  // as the member Disable/Enable toggle.
  admin_platform_team: [
    { key: "canView", permission: "canView", label: "View" },
    { key: "canAdd", permission: "canAdd", label: "Add" },
    { key: "canEdit", permission: "canEdit", label: "Edit" },
    { key: "canDelete", permission: "canDelete", label: "Delete" },
    { key: "disable", permission: "canApprove", label: "Disable" },
  ],
  admin_subscriptions: [
    { key: "canView", permission: "canView", label: "View" },
    { key: "createPlan", permission: "canAdd", label: "Create plan" },
    { key: "canEdit", permission: "canEdit", label: "Edit" },
    { key: "canDelete", permission: "canDelete", label: "Delete" },
    { key: "assignPlan", permission: "canAdd", label: "Assign plan" },
    { key: "changePlan", permission: "canEdit", label: "Change" },
    { key: "approve", permission: "canApprove", label: "Approve" },
    { key: "reject", permission: "canDelete", label: "Reject" },
  ],
};

function permissionPillsFor(moduleKey: string): PermissionPill[] {
  return MODULE_PERMISSION_PILLS[moduleKey] ?? DEFAULT_PERMISSION_PILLS;
}

// Modules that exist purely as backing storage for a pill nested under a
// different row (see the `moduleKey` override on that pill) — never rendered
// as a console-module row of their own.
const HIDDEN_MODULE_KEYS = new Set<string>([
  "admin_org_upgrade_subscription",
  "admin_org_templates_add",
  "admin_org_templates_remove",
]);

export function PlatformRolesPanel({
  onRolesChanged,
  onPermissionEditing,
  canEdit: canEditRoles,
  canDelete: canDeleteRoles,
}: {
  onRolesChanged?: () => void;
  onPermissionEditing?: (active: boolean) => void;
  // Roles is a tab of the Platform Team module, not its own permission
  // module — the caller passes down the single admin_platform_team grant
  // that governs both the Members and Roles tabs identically.
  canEdit: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const { accessToken } = useAuth();
  const [roles, setRoles] = useState<DynamicRole[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const [confirmDelete, setConfirmDelete] = useState<DynamicRole | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const [permRole, setPermRole] = useState<DynamicRole | null>(null);
  const [permRows, setPermRows] = useState<{
    moduleKey: string;
    label: string;
    description: string;
    canView: boolean;
    canAdd: boolean;
    canEdit: boolean;
    canDelete: boolean;
    canApprove: boolean;
  }[]>([]);
  const [permLoading, setPermLoading] = useState(false);
  const [savingPermission, setSavingPermission] = useState<string | null>(null);
  const [permError, setPermError] = useState<string | null>(null);

  const notify = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const load = useCallback(() => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    apiFetch<DynamicRole[]>("/admin/platform-roles")
      .then(setRoles)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load platform roles"))
      .finally(() => setLoading(false));
  }, [accessToken]);

  useEffect(() => {
    load();
  }, [load]);

  const visible = useMemo(
    () =>
      roles.filter(
        (r) =>
          !search.trim() ||
          r.name.toLowerCase().includes(search.trim().toLowerCase()) ||
          r.key.toLowerCase().includes(search.trim().toLowerCase()),
      ),
    [roles, search],
  );
  const paged = usePagedRows(visible, search);

  async function openPerms(role: DynamicRole) {
    setPermRole(role);
    onPermissionEditing?.(true);
    setPermLoading(true);
    setPermError(null);
    try {
      const res = await apiFetch<{ permissions: typeof permRows }>(
        `/admin/platform-roles/${role.id}/permissions`,
      );
      setPermRows(res.permissions || []);
    } catch (err) {
      setPermError(err instanceof Error ? err.message : "Failed to load permissions");
    } finally {
      setPermLoading(false);
    }
  }

  async function togglePerm(
    moduleKey: string,
    action: "canView" | "canAdd" | "canEdit" | "canDelete" | "canApprove",
  ) {
    if (!permRole || permRole.key === "super_admin") return;
    const permissionKey = `${moduleKey}:${action}`;
    const nextRows = permRows.map((item) => {
      if (item.moduleKey !== moduleKey) return item;
      const nextVal = !item[action];
      const updated = { ...item, [action]: nextVal };
      if (nextVal && action !== "canView") updated.canView = true;
      if (!nextVal && action === "canView") {
        updated.canAdd = false;
        updated.canEdit = false;
        updated.canDelete = false;
        updated.canApprove = false;
      }
      return updated;
    });
    const nextValue = nextRows.find((item) => item.moduleKey === moduleKey)?.[action] ?? false;
    const moduleLabel = nextRows.find((item) => item.moduleKey === moduleKey)?.label ?? "module";

    await savePermissionRows(nextRows, permissionKey, `${action.replace("can", "")} permission ${nextValue ? "enabled" : "removed"} for ${moduleLabel}`);
  }

  async function setModulePermissions(moduleKey: string, enabled: boolean) {
    if (!permRole || permRole.key === "super_admin") return;
    const item = permRows.find((row) => row.moduleKey === moduleKey);
    if (!item) return;
    // Only the columns this module's pills actually expose — never write a
    // hidden/unused action column (e.g. the unused canApprove on modules with
    // no approve-like action) just because "All"/"None" was clicked. A pill
    // can target a different module than the one it's displayed under (e.g.
    // "Upgrade subscription" nested under Organisations but stored on its own
    // module), so group columns by their real target module first — this is
    // what keeps "All"/"None" on Organisations from missing it.
    const columnsByModule = new Map<string, PermissionColumn[]>();
    for (const pill of permissionPillsFor(moduleKey)) {
      const target = pill.moduleKey ?? moduleKey;
      const cols = columnsByModule.get(target) ?? [];
      cols.push(pill.permission);
      columnsByModule.set(target, cols);
    }
    const nextRows = permRows.map((row) => {
      const cols = columnsByModule.get(row.moduleKey);
      if (!cols) return row;
      const patch: Partial<typeof row> = {};
      for (const col of cols) patch[col] = enabled;
      return { ...row, ...patch };
    });
    await savePermissionRows(
      nextRows,
      `${moduleKey}:all`,
      `${item.label} permissions ${enabled ? "enabled" : "removed"}`,
    );
  }

  async function savePermissionRows(
    nextRows: typeof permRows,
    permissionKey: string,
    successMessage: string,
  ) {
    if (!permRole) return;
    const previousRows = permRows;
    setPermRows(nextRows);
    setSavingPermission(permissionKey);
    setPermError(null);
    try {
      await apiFetch(`/admin/platform-roles/${permRole.id}/permissions`, {
        method: "PUT",
        body: JSON.stringify({
          permissions: nextRows.map((p) => ({
            moduleKey: p.moduleKey,
            canView: p.canView,
            canAdd: p.canAdd,
            canEdit: p.canEdit,
            canDelete: p.canDelete,
            canApprove: p.canApprove,
          })),
        }),
      });
      notify(successMessage);
    } catch (err) {
      setPermRows(previousRows);
      notify(err instanceof Error ? err.message : "Failed to update permission");
    } finally {
      setSavingPermission(null);
    }
  }

  async function removeRole() {
    if (!confirmDelete) return;
    setDeleteBusy(true);
    try {
      await apiFetch(`/admin/platform-roles/${confirmDelete.id}`, { method: "DELETE" });
      notify("Platform role deleted");
      setConfirmDelete(null);
      load();
      onRolesChanged?.();
    } catch (err) {
      notify(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeleteBusy(false);
    }
  }

  if (!accessToken) return null;

  if (permRole) {
    const locked = permRole.key === "super_admin";
    return (
      <>
        <div className="page-head reveal in">
          <div>
            <div className="eyebrow"><Icon name="lock" size={14} /> Platform console</div>
            <h1>Permissions: {permRole.name}</h1>
            <div className="sub">Super Admin console modules only — these are not organisation CRM/project permissions.</div>
          </div>
          <div className="actions">
            <button className="btn btn-ghost" type="button" onClick={() => { setPermRole(null); onPermissionEditing?.(false); }} disabled={savingPermission !== null}>
              ← Back
            </button>
          </div>
        </div>
        {permError ? <div className="form-alert">{permError}</div> : null}
        {locked ? (
          <div className="help" style={{ marginBottom: 16 }}>
            Super Admin always has full console access. This matrix cannot be reduced.
          </div>
        ) : null}
        <div className="card">
          <div className="platform-permissions-list">
            {permLoading ? (
              <div style={{ padding: 32, textAlign: "center", color: "var(--muted)" }}>Loading…</div>
            ) : (
              <div>
                <div className="platform-permissions-heading">
                  <span>Console module</span>
                  <span>Permissions</span>
                </div>
                {permRows.filter((item) => !HIDDEN_MODULE_KEYS.has(item.moduleKey)).map((item) => (
                  <div
                    className={`platform-permission-row${item.moduleKey === "admin_subscriptions" ? " platform-permission-row--subscriptions" : ""}`}
                    key={item.moduleKey}
                  >
                    <div className="platform-permission-module">
                      <div style={{ fontWeight: 700 }}>{item.label}</div>
                      <div className="muted" style={{ fontSize: 12 }}>{item.description}</div>
                    </div>
                    <div className="platform-permission-actions">
                      {permissionPillsFor(item.moduleKey).map(({ key, moduleKey: pillModuleKey, permission, label }) => {
                        // A pill can be stored on a different module than the
                        // row it's displayed under (see "Upgrade subscription"
                        // on Organisations) — resolve its own row for state.
                        const sourceItem = pillModuleKey ? permRows.find((r) => r.moduleKey === pillModuleKey) : item;
                        const enabled = locked || (sourceItem ? sourceItem[permission as keyof typeof sourceItem] : false);
                        return (
                          <button
                            className={`platform-permission-pill${enabled ? " is-enabled" : ""}`}
                            key={key}
                            type="button"
                            disabled={locked || savingPermission !== null}
                            onClick={() => void togglePerm(pillModuleKey ?? item.moduleKey, permission as "canView" | "canAdd" | "canEdit" | "canDelete" | "canApprove")}
                            aria-pressed={Boolean(enabled)}
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
                        disabled={locked || savingPermission !== null}
                        onClick={() => void setModulePermissions(item.moduleKey, true)}
                      >
                        All
                      </button>
                      <button
                        className="platform-permission-bulk"
                        type="button"
                        disabled={locked || savingPermission !== null}
                        onClick={() => void setModulePermissions(item.moduleKey, false)}
                      >
                        None
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        {toast ? (
          <div className="platform-permission-toast" role="status">
            <span className="platform-permission-toast-icon" aria-hidden="true">✓</span>
            <span>{toast}</span>
            <button type="button" onClick={() => setToast(null)} aria-label="Dismiss notification">×</button>
          </div>
        ) : null}
      </>
    );
  }

  return (
    <>
      {error ? <div className="form-alert">{error}</div> : null}

      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <input className="inp" placeholder="Search roles…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: 240 }} />
        <span className="muted" style={{ alignSelf: "center", fontSize: 12 }}>{loading ? "Loading…" : `${visible.length} roles`}</span>
      </div>

      <Reveal delay={1}>
        <div className="card">
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Role</th>
                  <th>Scope</th>
                  <th>Status</th>
                  <th>Assigned</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="muted" style={{ textAlign: "center", padding: 24 }}>
                      No platform roles yet.
                    </td>
                  </tr>
                ) : paged.pageRows.map((r) => {
                  // Super Admin is the built-in full-access role: its details
                  // and permissions are fixed (the backend enforces this too),
                  // so it gets no row actions.
                  const isSuperAdmin = r.key === "super_admin";
                  return (
                  <tr key={r.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{r.name}</div>
                      <div className="muted" style={{ fontSize: 12 }}>{r.key}{r.description ? ` · ${r.description}` : ""}</div>
                    </td>
                    <td><span className="badge b-indigo">Platform</span></td>
                    <td><span className={`badge ${r.status === "active" ? "b-green" : "b-rose"}`}>{r.status}</span></td>
                    <td>{r._count?.userRoles ?? 0}</td>
                    <td>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {isSuperAdmin ? (
                          <span className="muted" style={{ fontSize: 12 }} title="Built-in role with full access">
                            —
                          </span>
                        ) : null}
                        {canEditRoles && !isSuperAdmin ? (
                          <button className="btn btn-ghost btn-sm" type="button" onClick={() => void openPerms(r)}>
                            Permissions
                          </button>
                        ) : null}
                        {canEditRoles && !isSuperAdmin ? (
                          <button
                            className="btn btn-ghost btn-sm"
                            type="button"
                            onClick={() => router.push(`/admin-console/admins/roles/${encodeURIComponent(r.id)}/edit`)}
                          >
                            Edit
                          </button>
                        ) : null}
                        {canDeleteRoles && !isSuperAdmin ? (
                          <button className="btn btn-ghost btn-sm" type="button" onClick={() => setConfirmDelete(r)}>
                            Delete
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <ListPager page={paged.page} total={paged.total} onPageChange={paged.setPage} noun="roles" />
        </div>
      </Reveal>

      <ConfirmModal
        open={confirmDelete !== null}
        title={`Delete '${confirmDelete?.name}'?`}
        message="This platform role will be removed. Organisation roles are not affected."
        confirmLabel="Delete"
        destructive
        busy={deleteBusy}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => void removeRole()}
      />

      {toast ? (
        <div style={{ position: "fixed", top: 20, right: 20, zIndex: 500 }}>
          <div
            className="card"
            role="status"
            style={{
              padding: "12px 16px",
              borderLeft: "3px solid #10b981",
              boxShadow: "var(--sh-lg)",
              background: "#ffffff",
            }}
          >
            {toast}
          </div>
        </div>
      ) : null}
    </>
  );
}
