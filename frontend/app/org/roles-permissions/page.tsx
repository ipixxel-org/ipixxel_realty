"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { apiFetch } from "@/lib/api";
import { Reveal } from "@/components/superadmin/reveal";
import { Icon } from "@/components/icons";
import { Seg } from "@/components/superadmin/seg";
import { useFlash } from "@/lib/flash";
import { applyPermissionToggle } from "@/lib/permissions";
import { ORG_ROLES_FLASH_KEY, ORG_ROLES_PATH } from "./roles-shared";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import type { OrgUsersListResponse, OrgUser } from "@/lib/types";

interface ModuleDef {
  key: string;
  label: string;
  description: string;
  actions: string[];
  // Pill text per action when it names a specific button (e.g. Publish).
  actionLabels?: Record<string, string>;
}

interface RoleDef {
  key: string;
  name: string;
  scope: string;
  locked: boolean;
  custom?: boolean;
  id?: string;
  /** Members holding this org-created role (custom roles only). */
  userCount?: number;
}

interface PermissionsCatalogResponse {
  actions: string[];
  modules: ModuleDef[];
  roles: RoleDef[];
}

type PermissionColumn =
  | "canView"
  | "canAdd"
  | "canEdit"
  | "canDelete"
  | "canApprove"
  | "canActivate"
  | "canDeactivate"
  | "canAddLead";

type ModulePermissionRow = { moduleKey: string } & Record<PermissionColumn, boolean>;

interface RolePermissionState {
  roleKey: string;
  roleName: string;
  locked: boolean;
  permissions: Record<string, ModulePermissionRow>;
}

interface UserPermissionState {
  userId: string;
  userName: string;
  role: string | null;
  // Effective access per module (role + overrides), for the "Inherit" label.
  permissions: Record<string, ModulePermissionRow>;
  userOverrides: Record<string, Partial<Record<string, boolean | null>>>;
}

const TABS = ["Role Permissions Matrix", "User Permission Overrides"] as const;
const ACTIONS = ["view", "add", "edit", "delete", "approve", "activate", "deactivate", "add_lead"] as const;
// Actions offered when the catalog doesn't list a module's own set.
const DEFAULT_ACTIONS = ["view", "add", "edit", "delete", "approve"];
const ACTION_COLUMNS: Record<(typeof ACTIONS)[number], PermissionColumn> = {
  view: "canView",
  add: "canAdd",
  edit: "canEdit",
  delete: "canDelete",
  approve: "canApprove",
  activate: "canActivate",
  deactivate: "canDeactivate",
  add_lead: "canAddLead",
};
const COLUMN_ACTIONS = Object.fromEntries(
  Object.entries(ACTION_COLUMNS).map(([action, column]) => [column, action]),
) as Record<PermissionColumn, (typeof ACTIONS)[number]>;
const ACTION_LABELS: Record<PermissionColumn, string> = {
  canView: "View",
  canAdd: "Add",
  canEdit: "Edit",
  canDelete: "Delete",
  canApprove: "Approve",
  canActivate: "Activate",
  canDeactivate: "Deactivate",
  canAddLead: "Add lead",
};

function emptyRow(moduleKey: string): ModulePermissionRow {
  return {
    moduleKey,
    canView: false,
    canAdd: false,
    canEdit: false,
    canDelete: false,
    canApprove: false,
    canActivate: false,
    canDeactivate: false,
    canAddLead: false,
  };
}

/** Copies the permission columns of an API row (missing ones = false). */
function toRow(moduleKey: string, source: Partial<Record<PermissionColumn, boolean | null>> | undefined) {
  const row = emptyRow(moduleKey);
  for (const col of Object.values(ACTION_COLUMNS)) row[col] = source?.[col] === true;
  return row;
}

// A module only offers the actions the backend catalog lists for it (e.g.
// Dashboard is view-only); a module without a list offers every action.
function supportsAction(mod: ModuleDef | undefined, action: string) {
  return (mod?.actions?.length ? mod.actions : DEFAULT_ACTIONS).includes(action);
}

/** Pill text for an action — the button it unlocks when the module names one. */
function actionLabel(mod: ModuleDef | undefined, action: (typeof ACTIONS)[number]) {
  return mod?.actionLabels?.[action] ?? ACTION_LABELS[ACTION_COLUMNS[action]];
}

function supportedColumns(mod: ModuleDef | undefined) {
  return ACTIONS.filter((act) => supportsAction(mod, act)).map((act) => ACTION_COLUMNS[act]);
}

export default function OrgRolesPermissionsPage() {
  const { accessToken, hasPermission, user } = useAuth();
  const isAdmin = (user?.roleKeys ?? []).includes("admin");
  // Roles & Permissions pills — for the org admin too (set by Super Admin).
  const canView = hasPermission("roles_permissions", "view");
  const canCreateRole = hasPermission("roles_permissions", "add");
  const canEditRoles = hasPermission("roles_permissions", "edit");
  const canDeleteRole = hasPermission("roles_permissions", "delete");
  // Per-user overrides stay org-admin only.
  const visibleTabs = isAdmin ? [...TABS] : [TABS[0]];

  /**
   * Whether the current user may change this role's pills. Mirrors the
   * server rules for members: no changes to a role they hold themselves.
   */
  const roleIsReadOnly = (role: { roleKey: string; locked: boolean } | undefined) =>
    !role ||
    role.locked ||
    !canEditRoles ||
    (!isAdmin && (user?.roleKeys ?? []).includes(role.roleKey));

  /** Members can only switch ON actions they hold themselves. */
  const canGrant = (moduleKey: string, column: PermissionColumn) =>
    isAdmin || hasPermission(moduleKey, COLUMN_ACTIONS[column]);
  const router = useRouter();

  useEffect(() => {
    if (accessToken && !canView) {
      router.replace("/org");
    }
  }, [accessToken, canView, router]);

  const [tabIndex, setTabIndex] = useState(0);
  const [catalog, setCatalog] = useState<PermissionsCatalogResponse | null>(null);
  const [rolePermissions, setRolePermissions] = useState<RolePermissionState[]>([]);
  const [selectedRoleKey, setSelectedRoleKey] = useState<string>("manager");

  const [users, setUsers] = useState<OrgUser[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [userPermissionState, setUserPermissionState] = useState<UserPermissionState | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Top-right flash after each save — same look as Super Admin >
  // Organisation roles. A new message replaces the current one.
  const [flash, setFlash] = useState<{ message: string; variant: "success" | "error" } | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
    },
    [],
  );
  const [saving, setSaving] = useState(false);
  // "<moduleKey>" while a role matrix change is being saved — pills are
  // disabled until it lands so rapid clicks can't race each other.
  const [savingModule, setSavingModule] = useState<string | null>(null);

  const [confirmDeleteRole, setConfirmDeleteRole] = useState<RoleDef | null>(null);
  // Shown instead of the delete confirmation when the role still has members.
  const [roleInUse, setRoleInUse] = useState<RoleDef | null>(null);
  const [deletingRole, setDeletingRole] = useState(false);

  const notify = (msg: string, variant: "success" | "error" = "success") => {
    if (flashTimer.current) clearTimeout(flashTimer.current);
    setFlash({ message: msg, variant });
    // Errors stay a little longer so they can be read.
    flashTimer.current = setTimeout(() => setFlash(null), variant === "error" ? 5000 : 3000);
  };

  useFlash(ORG_ROLES_FLASH_KEY, (flash) => notify(flash.message));

  const loadCatalogAndRoles = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const [catRes, rolesRes] = await Promise.all([
        apiFetch<PermissionsCatalogResponse>("/org/permissions/modules", {
          headers: { Authorization: `Bearer ${accessToken}` },
        }),
        apiFetch<any[]>("/org/permissions", {
          headers: { Authorization: `Bearer ${accessToken}` },
        }),
      ]);

      setCatalog(catRes);

      const parsedRoles: RolePermissionState[] = catRes.roles.map((r) => {
        const found = rolesRes.find((item) => item.roleKey === r.key);
        const permMap: Record<string, ModulePermissionRow> = {};
        for (const m of catRes.modules) {
          const modRow = found?.permissions?.find((p: any) => p.moduleKey === m.key);
          permMap[m.key] = toRow(m.key, modRow);
        }
        return {
          roleKey: r.key,
          roleName: r.name,
          locked: r.locked,
          permissions: permMap,
        };
      });

      setRolePermissions(parsedRoles);

      const firstNonAdminRole = catRes.roles.find((r) => !r.locked)?.key ?? catRes.roles[0]?.key ?? "manager";
      setSelectedRoleKey(firstNonAdminRole);
    } catch (err: any) {
      setError(err.message || "Failed to load permissions catalog.");
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  const loadUsers = useCallback(async () => {
    if (!accessToken) return;
    try {
      const res = await apiFetch<OrgUsersListResponse>("/org/users?limit=100", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      setUsers(res.data);
      if (res.data.length > 0) {
        setSelectedUserId(res.data[0].id);
      }
    } catch {
      // Ignore
    }
  }, [accessToken]);

  const loadUserPermissions = useCallback(async (userId: string) => {
    if (!accessToken || !userId) return;
    try {
      const res = await apiFetch<any>(`/org/permissions/users/${userId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const selectedUserObj = users.find((u) => u.id === userId);
      const name = selectedUserObj
        ? [selectedUserObj.firstName, selectedUserObj.lastName].filter(Boolean).join(" ") || selectedUserObj.email
        : userId;

      const permMap: Record<string, ModulePermissionRow> = {};
      const overrideMap: Record<string, Partial<Record<string, boolean | null>>> = {};

      for (const [modKey, row] of Object.entries((res.effective ?? {}) as Record<string, any>)) {
        permMap[modKey] = toRow(modKey, row);
      }

      // Only explicit (non-null) override values are kept; null = inherit.
      for (const item of (res.overrides ?? []) as any[]) {
        const actions: Partial<Record<string, boolean | null>> = {};
        for (const act of ACTIONS) {
          const value = item[ACTION_COLUMNS[act]];
          if (typeof value === "boolean") actions[act] = value;
        }
        if (Object.keys(actions).length > 0) overrideMap[item.moduleKey] = actions;
      }

      setUserPermissionState({
        userId,
        userName: name,
        role: res.role?.key ?? selectedUserObj?.role?.key ?? null,
        permissions: permMap,
        userOverrides: overrideMap,
      });
    } catch (err: any) {
      notify(err.message || "Failed to load user permissions.", "error");
    }
  }, [accessToken, users]);

  useEffect(() => {
    loadCatalogAndRoles();
    // Only the overrides tab (org admin only) needs the member list.
    if (isAdmin) loadUsers();
  }, [loadCatalogAndRoles, loadUsers, isAdmin]);

  useEffect(() => {
    if (tabIndex === 1 && selectedUserId) {
      loadUserPermissions(selectedUserId);
    }
  }, [tabIndex, selectedUserId, loadUserPermissions]);

  /**
   * Saves one module's new row for the selected role right away (optimistic),
   * then confirms with a toast — or rolls back and shows the error. Mirrors
   * Super Admin > Organisation roles, which also saves on every click.
   */
  const saveModuleRow = async (moduleKey: string, nextRow: ModulePermissionRow, message: string) => {
    if (!accessToken || savingModule) return;
    const roleState = rolePermissions.find((r) => r.roleKey === selectedRoleKey);
    if (!roleState) return;
    if (roleState.locked) {
      notify("Organisation Admin access is managed by the platform and cannot be changed here.", "error");
      return;
    }
    if (roleIsReadOnly(roleState)) {
      notify("You can't change the permissions of this role.", "error");
      return;
    }

    const previous = roleState.permissions;
    const nextPermissions = { ...previous, [moduleKey]: nextRow };
    const applyToRole = (permissions: Record<string, ModulePermissionRow>) =>
      setRolePermissions((prev) =>
        prev.map((rp) => (rp.roleKey === roleState.roleKey ? { ...rp, permissions } : rp)),
      );

    applyToRole(nextPermissions);
    setSavingModule(moduleKey);
    try {
      // The API replaces the role's whole set, so send every module — each
      // limited to the actions that module supports.
      const payload = Object.values(nextPermissions).map((p) => {
        const mod = catalog?.modules.find((m) => m.key === p.moduleKey);
        const item = emptyRow(p.moduleKey);
        for (const col of supportedColumns(mod)) item[col] = p[col];
        return item;
      });
      await apiFetch(`/org/permissions/roles/${roleState.roleKey}`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ permissions: payload }),
      });
      notify(message);
    } catch (err) {
      applyToRole(previous);
      notify(err instanceof Error ? err.message : "Failed to save role permissions.", "error");
    } finally {
      setSavingModule(null);
    }
  };

  const handleToggleRolePerm = (moduleKey: string, column: PermissionColumn) => {
    const roleState = rolePermissions.find((r) => r.roleKey === selectedRoleKey);
    if (!roleState) return;
    const mod = catalog?.modules.find((m) => m.key === moduleKey);
    const current = roleState.permissions[moduleKey] ?? emptyRow(moduleKey);
    const enabled = !current[column];
    const label = actionLabel(mod, COLUMN_ACTIONS[column]);
    // Same rule as Super Admin > Organisation roles: every action needs View,
    // so granting one also grants View, and removing View removes them all —
    // except the Settings "My profile" pills (see applyPermissionToggle).
    const next = applyPermissionToggle(moduleKey, current, column, enabled, Object.values(ACTION_COLUMNS));
    void saveModuleRow(
      moduleKey,
      next,
      `${label} permission ${enabled ? "enabled" : "removed"} for ${mod?.label ?? moduleKey} (${roleState.roleName})`,
    );
  };

  // "All" / "None" on a module row — every action the module supports.
  const handleSetModulePerms = (moduleKey: string, enabled: boolean) => {
    const roleState = rolePermissions.find((r) => r.roleKey === selectedRoleKey);
    if (!roleState) return;
    const mod = catalog?.modules.find((m) => m.key === moduleKey);
    const current = roleState.permissions[moduleKey] ?? emptyRow(moduleKey);
    const next = emptyRow(moduleKey);
    for (const col of supportedColumns(mod)) {
      next[col] = enabled ? current[col] || canGrant(moduleKey, col) : false;
    }
    void saveModuleRow(
      moduleKey,
      next,
      `All permissions ${enabled ? "enabled" : "removed"} for ${mod?.label ?? moduleKey} (${roleState.roleName})`,
    );
  };

  const handleDeleteOrgRole = async () => {
    if (!accessToken || !confirmDeleteRole?.id) return;
    setDeletingRole(true);
    try {
      await apiFetch(`/org/permissions/org-roles/${confirmDeleteRole.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      notify(`Role '${confirmDeleteRole.name}' deleted`);
      if (selectedRoleKey === confirmDeleteRole.key) {
        setSelectedRoleKey(catalog?.roles.find((r) => r.key !== confirmDeleteRole.key)?.key ?? "manager");
      }
      setConfirmDeleteRole(null);
      await loadCatalogAndRoles();
    } catch (err: any) {
      notify(err.message || "Failed to delete role.", "error");
    } finally {
      setDeletingRole(false);
    }
  };

  const handleUserOverrideChange = (moduleKey: string, action: string, value: boolean | null) => {
    if (!userPermissionState) return;
    const currentOverrides = { ...userPermissionState.userOverrides };
    const modOverride = { ...(currentOverrides[moduleKey] ?? {}) };

    if (value === null) {
      delete modOverride[action];
    } else {
      modOverride[action] = value;
    }

    if (Object.keys(modOverride).length === 0) {
      delete currentOverrides[moduleKey];
    } else {
      currentOverrides[moduleKey] = modOverride;
    }

    setUserPermissionState({
      ...userPermissionState,
      userOverrides: currentOverrides,
    });
  };

  const handleSaveUserOverrides = async () => {
    if (!accessToken || !selectedUserId || !userPermissionState) return;
    setSaving(true);
    try {
      const payload: ({ moduleKey: string } & Partial<Record<PermissionColumn, boolean | null>>)[] = [];

      for (const [modKey, actions] of Object.entries(userPermissionState.userOverrides)) {
        if (Object.keys(actions).length > 0) {
          const mod = catalog?.modules.find((m) => m.key === modKey);
          const item: { moduleKey: string } & Partial<Record<PermissionColumn, boolean | null>> = {
            moduleKey: modKey,
          };
          for (const act of ACTIONS) {
            item[ACTION_COLUMNS[act]] = supportsAction(mod, act) ? actions[act] ?? null : null;
          }
          payload.push(item);
        }
      }

      await apiFetch(`/org/permissions/users/${selectedUserId}`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ permissions: payload }),
      });

      notify(`User permission overrides saved for '${userPermissionState.userName}'`);
      loadUserPermissions(selectedUserId);
    } catch (err: any) {
      notify(err.message || "Failed to save user overrides.", "error");
    } finally {
      setSaving(false);
    }
  };

  const currentRoleState = rolePermissions.find((r) => r.roleKey === selectedRoleKey);

  return (
    <>
      <div className="page-head reveal in">
        <div>
          <div className="eyebrow"><Icon name="lock" size={14} /> Security</div>
          <h1>Roles &amp; Permissions</h1>
          <div className="sub">
            Control page and action access per role and configure individual member overrides across your organisation.
          </div>
        </div>
      </div>

      <Reveal delay={1}>
        <div style={{ marginBottom: 18 }}>
          <Seg
            options={visibleTabs}
            value={tabIndex}
            onChange={(i) => setTabIndex(i)}
          />
        </div>
      </Reveal>

      {error ? (
        <div className="card" style={{ padding: 16, color: "var(--rose, #e11d48)", marginBottom: 16 }}>{error}</div>
      ) : null}

      {/* Tab 0: Role Matrix */}
      {tabIndex === 0 && catalog ? (
        <Reveal delay={2}>
          <div className="card">
            <div className="card-h" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <span className="muted" style={{ fontSize: 13 }}>Select Role:</span>
                {catalog.roles.map((r) => (
                  <span key={r.key} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                    <button
                      type="button"
                      className={`btn btn-sm ${selectedRoleKey === r.key ? "btn-primary" : "btn-ghost"}`}
                      onClick={() => setSelectedRoleKey(r.key)}
                    >
                      {r.name} {r.locked ? "(Admin)" : ""}
                    </button>
                    {r.custom && canDeleteRole ? (
                      <button
                        type="button"
                        title={`Delete '${r.name}'`}
                        className="btn btn-ghost btn-sm"
                        style={{ padding: "2px 6px", color: "var(--rose, #e11d48)" }}
                        onClick={() =>
                          (r.userCount ?? 0) > 0 ? setRoleInUse(r) : setConfirmDeleteRole(r)
                        }
                      >
                        <Icon name="trash" size={13} />
                      </button>
                    ) : null}
                  </span>
                ))}
                {canCreateRole ? (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => router.push(`${ORG_ROLES_PATH}/new`)}
                  >
                    <Icon name="plus" size={13} /> Create Role
                  </button>
                ) : null}
              </div>
              {!roleIsReadOnly(currentRoleState) ? (
                <span className="muted" style={{ fontSize: 12.5 }}>
                  {savingModule ? "Saving…" : "Changes save automatically"}
                </span>
              ) : null}
            </div>

            {currentRoleState && !currentRoleState.locked && roleIsReadOnly(currentRoleState) ? (
              <div style={{ padding: "12px 18px", background: "var(--amber-light, #fffbeb)", color: "var(--amber-dark, #92400e)", borderBottom: "1px solid var(--border)", fontSize: 13 }}>
                🔒 {canEditRoles
                  ? <>You can&apos;t change the permissions of <strong>{currentRoleState.roleName}</strong> because it is your own role.</>
                  : <>You can view role permissions but not change them.</>}
              </div>
            ) : null}

            {currentRoleState?.locked ? (
              <div style={{ padding: "12px 18px", background: "var(--amber-light, #fffbeb)", color: "var(--amber-dark, #92400e)", borderBottom: "1px solid var(--border)", fontSize: 13 }}>
                🔒 The <strong>{currentRoleState.roleName}</strong> role&apos;s access is managed by the platform and cannot be changed here.
              </div>
            ) : null}

            <div className="platform-permissions-list">
              <div className="platform-permissions-heading">
                <span>Module</span>
                <span>Permissions</span>
              </div>
              {catalog.modules.map((m) => {
                const permRow = currentRoleState?.permissions[m.key] ?? emptyRow(m.key);

                const isLocked = roleIsReadOnly(currentRoleState);

                return (
                  <div className="platform-permission-row" key={m.key}>
                    <div className="platform-permission-module">
                      <div style={{ fontWeight: 700, fontSize: 13.5 }}>{m.label}</div>
                      <div className="muted" style={{ fontSize: 12 }}>{m.description}</div>
                    </div>
                    <div className="platform-permission-actions">
                      {supportedColumns(m).map((act) => {
                        // Locked roles (Admin) show exactly what Super Admin
                        // granted — disabled actions stay white.
                        const enabled = permRow[act];
                        const label = actionLabel(m, COLUMN_ACTIONS[act]);
                        // Members can't switch on what they don't hold.
                        const cannotGrant = !enabled && !canGrant(m.key, act);
                        return (
                          <button
                            className={`platform-permission-pill${enabled ? " is-enabled" : ""}`}
                            key={act}
                            type="button"
                            disabled={isLocked || cannotGrant || savingModule !== null}
                            title={cannotGrant && !isLocked ? "You can only grant permissions you have yourself" : undefined}
                            onClick={() => handleToggleRolePerm(m.key, act)}
                            aria-pressed={enabled}
                            aria-label={`${label} permission for ${m.label}`}
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
                        disabled={isLocked || savingModule !== null}
                        onClick={() => handleSetModulePerms(m.key, true)}
                      >
                        All
                      </button>
                      <button
                        className="platform-permission-bulk"
                        type="button"
                        disabled={isLocked || savingModule !== null}
                        onClick={() => handleSetModulePerms(m.key, false)}
                      >
                        None
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </Reveal>
      ) : null}

      {/* Tab 1: User Overrides */}
      {tabIndex === 1 && catalog ? (
        <Reveal delay={2}>
          <div className="card">
            <div className="card-h" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
              <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                <span className="muted" style={{ fontSize: 13 }}>Target Member:</span>
                <select
                  style={{ minWidth: 240 }}
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                >
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {[u.firstName, u.lastName].filter(Boolean).join(" ") || u.email} ({u.role?.name ?? "No Role"})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <button
                  className="btn btn-primary"
                  type="button"
                  disabled={saving || !userPermissionState || userPermissionState.role === "admin"}
                  onClick={handleSaveUserOverrides}
                >
                  {saving ? "Saving…" : "Save User Overrides"}
                </button>
              </div>
            </div>

            {userPermissionState?.role === "admin" ? (
              <div style={{ padding: "12px 18px", background: "var(--amber-light, #fffbeb)", color: "var(--amber-dark, #92400e)", borderBottom: "1px solid var(--border)", fontSize: 13 }}>
                🔒 Organisation Admins always have unrestricted full access. Overrides cannot be set for this user.
              </div>
            ) : null}

            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Module</th>
                    {ACTIONS.map((act) => (
                      <th key={act} style={{ textAlign: "center", width: 120, textTransform: "capitalize" }}>
                        {act}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {catalog.modules.map((m) => {
                    const modOverrides = userPermissionState?.userOverrides[m.key] ?? {};
                    const effectiveMod = userPermissionState?.permissions[m.key] ?? emptyRow(m.key);
                    const isAdminUser = userPermissionState?.role === "admin";

                    return (
                      <tr key={m.key}>
                        <td>
                          <div style={{ fontWeight: 600 }}>{m.label}</div>
                          <div style={{ fontSize: 12, color: "var(--fg-subtle)" }}>{m.description}</div>
                        </td>
                        {ACTIONS.map((act) => {
                          if (!supportsAction(m, act)) {
                            return (
                              <td key={act} style={{ textAlign: "center", color: "var(--fg-subtle)" }} title="Not applicable to this module">
                                —
                              </td>
                            );
                          }
                          const overrideVal = modOverrides[act];
                          const isEffective = effectiveMod[ACTION_COLUMNS[act]];

                          let selectVal = "inherit";
                          if (overrideVal === true) selectVal = "grant";
                          if (overrideVal === false) selectVal = "deny";

                          return (
                            <td key={act} style={{ textAlign: "center" }}>
                              <select
                                disabled={isAdminUser}
                                value={selectVal}
                                style={{
                                  fontSize: 12,
                                  padding: "3px 6px",
                                  fontWeight: selectVal !== "inherit" ? 600 : 400,
                                  borderColor: selectVal === "grant" ? "#10b981" : selectVal === "deny" ? "#f43f5e" : undefined,
                                }}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  if (val === "grant") handleUserOverrideChange(m.key, act, true);
                                  else if (val === "deny") handleUserOverrideChange(m.key, act, false);
                                  else handleUserOverrideChange(m.key, act, null);
                                }}
                              >
                                <option value="inherit">Inherit ({isEffective ? "Allowed" : "Denied"})</option>
                                <option value="grant">Explicit Grant</option>
                                <option value="deny">Explicit Deny</option>
                              </select>
                              {m.actionLabels?.[act] ? (
                                <div style={{ fontSize: 11, color: "var(--fg-subtle)", marginTop: 3 }}>
                                  {m.actionLabels[act]}
                                </div>
                              ) : null}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </Reveal>
      ) : null}


      {flash ? (
        <div
          className={`platform-permission-toast${flash.variant === "error" ? " is-error" : ""}`}
          role={flash.variant === "error" ? "alert" : "status"}
        >
          <span className="platform-permission-toast-icon" aria-hidden="true">
            {flash.variant === "error" ? "!" : "✓"}
          </span>
          <span>{flash.message}</span>
          <button type="button" onClick={() => setFlash(null)} aria-label="Dismiss notification">
            ×
          </button>
        </div>
      ) : null}

      <ConfirmModal
        open={roleInUse !== null}
        title={`Can't delete role '${roleInUse?.name ?? ""}' yet`}
        message={
          roleInUse
            ? `This role is assigned to ${roleInUse.userCount === 1 ? "1 user" : `${roleInUse.userCount} users`}. Remove those users or change their role from the Users page first, then you can delete this role.`
            : ""
        }
        confirmLabel="OK"
        cancelLabel="Close"
        onConfirm={() => setRoleInUse(null)}
        onClose={() => setRoleInUse(null)}
      />

      <ConfirmModal
        open={confirmDeleteRole !== null}
        title={`Delete role '${confirmDeleteRole?.name}'?`}
        message="This will permanently delete this custom role definition. Users currently assigned to it must be reassigned first."
        confirmLabel="Delete Role"
        destructive
        busy={deletingRole}
        onConfirm={handleDeleteOrgRole}
        onClose={() => setConfirmDeleteRole(null)}
      />
    </>
  );
}
