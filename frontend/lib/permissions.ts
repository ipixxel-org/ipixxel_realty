import type { PermissionAction, Permissions, UserRole } from "./types";

export const MODULES = {
  dashboard: "dashboard",
  organisations: "organisations",
  users: "users",
  sales_agents: "sales_agents",
  crm: "crm",
  forms: "forms",
  projects: "projects",
  websites: "websites",
  domains: "domains",
  calling: "calling",
  whatsapp: "whatsapp",
  teams: "teams",
  reports: "reports",
  billing: "billing",
  integrations: "integrations",
  settings: "settings",
  modules: "modules",
  templates: "templates",
  properties: "properties",
  notifications: "notifications",
  organisation: "organisation",
  team: "team",
  landing: "landing",
  profile: "profile",
} as const;

export type ModuleKey = keyof typeof MODULES;

// Pills stored in a spare action column — mirrors PROJECT_UNIT_ACTIONS /
// SETTINGS_ACTIONS / SUPPORT_ACTIONS in the backend's permissions.util.ts, so
// call sites read as the button they gate.
export const PROJECT_UNIT_ACTIONS = {
  add: "approve",
  edit: "activate",
  delete: "deactivate",
} as const satisfies Record<string, PermissionAction>;

/** Projects > Add lead — mirrors PROJECT_LEAD_ACTION in the backend. */
export const PROJECT_LEAD_ACTION = "add_lead" satisfies PermissionAction;

export const SETTINGS_ACTIONS = {
  editProfile: "edit",
  editEmail: "approve",
  editPipeline: "activate",
  // The member's own profile (Settings > My profile), not the organisation's.
  viewMyProfile: "add",
  editMyProfile: "deactivate",
} as const satisfies Record<string, PermissionAction>;

/**
 * Role-matrix pill rules, shared by Super Admin > Organisation roles and the
 * org's Roles & Permissions. Every action normally needs the module's View:
 * granting one grants View, and removing View removes them all. The Settings
 * "My profile" pills are the exception — they gate the member's own profile
 * page, not the Settings page, so they neither need nor clear Settings View.
 * "My profile: Edit" still needs "My profile: View".
 */
const VIEW_INDEPENDENT_COLUMNS: Record<string, readonly string[]> = {
  settings: ["canAdd", "canDeactivate"], // My profile: View / Edit
};
const REQUIRED_COLUMN: Record<string, Record<string, string>> = {
  settings: { canDeactivate: "canAdd" }, // My profile: Edit needs My profile: View
};

export function applyPermissionToggle<T extends object>(
  moduleKey: string,
  row: T,
  column: string,
  enabled: boolean,
  allColumns: readonly string[],
): T {
  const independent = VIEW_INDEPENDENT_COLUMNS[moduleKey] ?? [];
  const required = REQUIRED_COLUMN[moduleKey] ?? {};
  const next: Record<string, unknown> = { ...row, [column]: enabled };
  if (enabled) {
    if (column !== "canView" && !independent.includes(column)) next.canView = true;
    if (required[column]) next[required[column]] = true;
  } else {
    if (column === "canView") {
      for (const col of allColumns) if (!independent.includes(col)) next[col] = false;
    }
    for (const [dependent, needs] of Object.entries(required)) {
      if (needs === column) next[dependent] = false;
    }
  }
  return next as T;
}

export const SUPPORT_ACTIONS = {
  raiseTicket: "add",
  reply: "edit",
} as const satisfies Record<string, PermissionAction>;

export function allPermissions(): Permissions {
  const perms: Permissions = {};
  for (const mod of Object.values(MODULES)) {
    perms[mod] = { view: true, add: true, edit: true, delete: true };
  }
  return perms;
}

export function can(
  permissions: Permissions | undefined,
  module: string,
  action: PermissionAction = "view",
) {
  if (!permissions) return false;
  return permissions[module]?.[action] === true;
}

export function hasAny(permissions: Permissions | undefined, module: string) {
  if (!permissions) return false;
  const perms = permissions[module];
  if (!perms) return false;
  return (
    perms.view === true ||
    perms.add === true ||
    perms.edit === true ||
    perms.delete === true
  );
}

export function roleForScope(scope: "platform" | "organisation" | "team"): UserRole {
  if (scope === "platform") return "super_admin";
  if (scope === "organisation") return "organisation_admin";
  return "team_member";
}