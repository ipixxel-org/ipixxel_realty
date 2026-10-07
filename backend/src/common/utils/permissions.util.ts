import { ForbiddenException } from '@nestjs/common';
import type { RoleScope } from '@prisma/client';
import type { PrismaService } from '../../database/prisma.service';

// ---------------------------------------------------------------------------
// The org permission catalog — the single source of truth both for the
// org-admin UI's "page x action" matrix (GET /org/permissions/modules) and
// for the PermissionGuard's runtime checks. Keep the set small and aligned
// with the real org pages so the matrix on the frontend matches enforcement
// exactly.
// ---------------------------------------------------------------------------

export const PERMISSION_ACTIONS = [
  'view',
  'add',
  'edit',
  'delete',
  'approve',
  'activate',
  'deactivate',
  // Projects: create a lead from a project page (see PROJECT_LEAD_ACTION).
  'add_lead',
] as const;
export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];

/** Actions a module supports when its definition doesn't list its own. */
export const DEFAULT_MODULE_ACTIONS: readonly PermissionAction[] = [
  'view',
  'add',
  'edit',
  'delete',
  'approve',
];

export interface ModuleDefinition {
  key: string;
  label: string;
  description: string;
  /** Actions this module actually supports. Omitted = DEFAULT_MODULE_ACTIONS. */
  actions?: readonly PermissionAction[];
  /**
   * Pill text per action when it differs from the action name — matches the
   * button it unlocks so admins can see exactly what they are granting
   * (e.g. Landing Pages 'activate' is the "Publish" button).
   */
  actionLabels?: Partial<Record<PermissionAction, string>>;
}

// Label/description map for every gated page. `label` is shown in the admin
// UI; `description` explains what granting it unlocks.
export const PERMISSION_MODULES: ModuleDefinition[] = [
  // Read-only page — the only meaningful permission is whether it is visible.
  { key: 'dashboard', label: 'Dashboard', description: 'Org overview & analytics', actions: ['view'] },
  // Activate / Deactivate gate approving and disabling a member's login.
  { key: 'users', label: 'Users', description: 'Invite, manage and assign org members', actions: ['view', 'add', 'edit', 'delete', 'activate', 'deactivate'] },
  { key: 'crm', label: 'Leads / CRM', description: 'Lead inbox, notes, stages and assignment' },
  {
    key: 'forms',
    label: 'Lead Forms',
    description: 'Lead capture forms and the form builder',
    actions: ['view', 'add', 'edit', 'delete'],
    actionLabels: { add: 'Create / Duplicate' },
  },
  // Units get their own pills (see PROJECT_UNIT_ACTIONS) so a role can book /
  // hold units without being able to edit the project itself.
  {
    key: 'projects',
    label: 'Projects',
    description: 'Projects, unit types and unit inventory',
    actions: ['view', 'add', 'edit', 'delete', 'approve', 'activate', 'deactivate', 'add_lead'],
    actionLabels: {
      add: 'New project',
      add_lead: 'Add lead',
      approve: 'Add unit',
      activate: 'Edit unit',
      deactivate: 'Delete unit',
    },
  },
  // Landing pages the org builds. Publish / Pause reuse the activate /
  // deactivate columns: putting a page live or taking it down.
  {
    key: 'landing_pages',
    label: 'Landing Pages',
    description: "Build, publish and pause the organisation's landing pages",
    actions: ['view', 'add', 'edit', 'delete', 'activate', 'deactivate'],
    actionLabels: {
      add: 'Create / Duplicate',
      activate: 'Publish',
      deactivate: 'Pause / Unpublish',
    },
  },
  // Templates the org has taken from its plan. Orgs never edit a template
  // itself — "Use" creates a landing page (Landing Pages > Create).
  {
    key: 'templates',
    label: 'Templates',
    description: 'Templates added to the workspace from the plan',
    actions: ['view', 'add', 'delete'],
    actionLabels: {
      view: 'View / Preview',
      add: 'Add Template from Plan',
      delete: 'Remove',
    },
  },
  // Historical key: once covered landing pages and templates too, which now
  // have their own modules above. Only the Media Library remains under it.
  { key: 'websites', label: 'Media Library', description: 'Central media & assets library', actions: ['view'] },
  { key: 'domains', label: 'Domains', description: 'Subdomain & custom-domain management' },
  // Hidden from Roles & Permissions while these pages are switched off.
  // Stored grant rows stay in the DB; uncomment to restore.
  // { key: 'calling', label: 'Calling', description: 'Calls, queues, numbers and automation' }, // [DISABLED-CALLING]
  // { key: 'whatsapp', label: 'WhatsApp', description: 'WhatsApp inbox and broadcasts' }, // [DISABLED-WHATSAPP]
  // { key: 'teams', label: 'Teams', description: 'Organising members into teams' }, // [DISABLED-TEAMS]
  // Team Chat. View alone is everyday chatting: read/send in your own
  // conversations, start DMs, reply, forward, pin, react. Membership is
  // always enforced on top — no action here unlocks someone else's DM.
  {
    key: 'team_chat',
    label: 'Team Chat',
    description: 'Internal chat: channels, direct messages and files',
    actions: ['view', 'add', 'edit', 'delete'],
    actionLabels: {
      view: 'Use chat',
      add: 'Create channels',
      edit: 'Manage channels & members',
      delete: "Delete channels & others' messages",
    },
  },
  { key: 'reports', label: 'Reports', description: 'Reports and analytics' },
  { key: 'integrations', label: 'Integrations', description: 'Connected apps and channels' },
  { key: 'billing', label: 'Billing', description: 'Plan, subscription and invoices' },
  // Domain, Billing, CRM option lists and Project Catalogs sections follow
  // their own modules; these pills cover the rest (see SETTINGS_ACTIONS).
  // "My profile" pills gate the member's own profile page, independently of
  // View (Settings page), so a role can be given only its own profile.
  {
    key: 'settings',
    label: 'Settings',
    description: 'Organisation profile, branding, email and pipeline',
    actions: ['view', 'edit', 'approve', 'activate', 'add', 'deactivate'],
    actionLabels: {
      edit: 'Edit settings & branding',
      approve: 'Edit email & SMTP',
      activate: 'Edit pipeline',
      add: 'My profile: View',
      deactivate: 'My profile: Edit',
    },
  },
  // Orgs can't edit, close or delete tickets — the platform team resolves them.
  {
    key: 'support',
    label: 'Support & Help',
    description: 'Raise support tickets and chat with the iPixxel team',
    actions: ['view', 'add', 'edit'],
    actionLabels: { add: 'Raise ticket', edit: 'Reply' },
  },
  // Managing roles themselves. Per-user overrides stay org-admin only.
  {
    key: 'roles_permissions',
    label: 'Roles & Permissions',
    description: 'Create roles and set what each role can do',
    actions: ['view', 'add', 'edit', 'delete'],
    actionLabels: {
      add: 'Create Role',
      edit: 'Edit role permissions',
      delete: 'Delete Role',
    },
  },
];

/**
 * Named aliases for pills stored in a spare action column, so call sites read
 * as the button they gate (e.g. `PROJECT_UNIT_ACTIONS.add` = "Add unit").
 */
export const PROJECT_UNIT_ACTIONS = {
  add: 'approve',
  edit: 'activate',
  delete: 'deactivate',
} as const satisfies Record<string, PermissionAction>;

/**
 * Projects > Add lead: creating a lead tied to a project from the project
 * pages. Leads / CRM > Add still allows any lead (see the leads controller).
 */
export const PROJECT_LEAD_ACTION = 'add_lead' satisfies PermissionAction;

export const SETTINGS_ACTIONS = {
  editProfile: 'edit',
  editEmail: 'approve',
  editPipeline: 'activate',
  // The member's own profile (Settings > My profile), not the organisation's.
  viewMyProfile: 'add',
  editMyProfile: 'deactivate',
} as const satisfies Record<string, PermissionAction>;

export const SUPPORT_ACTIONS = {
  raiseTicket: 'add',
  reply: 'edit',
} as const satisfies Record<string, PermissionAction>;

export type PermissionModuleKey = (typeof PERMISSION_MODULES)[number]['key'];

export const PERMISSION_MODULE_KEYS = PERMISSION_MODULES.map((m) => m.key);

/** Super Admin console catalog — never mixed with organisation modules. */
export const PLATFORM_PERMISSION_MODULES: ModuleDefinition[] = [
  { key: 'admin_dashboard', label: 'Dashboard', description: 'Platform overview and KPIs' },
  { key: 'admin_notifications', label: 'Notifications', description: 'Platform notification inbox' },
  { key: 'admin_organisations', label: 'Organisations', description: 'Onboard, approve and manage organisations' },
  // Backing storage only — the frontend's roles matrix nests this as an
  // "Upgrade subscription" pill under the Organisations row (never rendered
  // as its own row) so it stays independent of "Edit" there and of
  // admin_subscriptions' Change/Assign, while still living where a Super
  // Admin looks for it. Gates only the "Upgrade subscription" button on an
  // organisation's detail page; the plan cards it lives next to stay visible
  // regardless.
  { key: 'admin_org_upgrade_subscription', label: 'Organisation — Upgrade Subscription', description: "Shows the 'Upgrade subscription' button on an organisation's detail page" },
  { key: 'admin_org_templates_add', label: 'Organisation — Add Templates', description: "Shows the 'Add template' action on an organisation's detail page" },
  { key: 'admin_org_templates_remove', label: 'Organisation — Remove Templates', description: "Shows the 'Remove' template action on an organisation's detail page" },
  { key: 'admin_org_roles', label: 'Organisation roles', description: 'Default roles and permissions for organisations' },
  // Covers both the Members and Roles tabs of the Platform Team page — there
  // is no separate "Platform roles" console module. A dedicated module here
  // would just be a second set of pills governing screens on the same page,
  // which is confusing to configure; View/Edit/Delete/Add apply identically
  // to both tabs (see PLATFORM_ROUTE_MODULES below).
  { key: 'admin_platform_team', label: 'Platform team', description: 'Invite and manage Super Admin console users, and the platform roles assigned to them' },
  { key: 'admin_templates', label: 'Templates', description: 'Site templates, typography and landing pages' },
  { key: 'admin_forms', label: 'Forms', description: 'Platform lead forms builder and library' },
  { key: 'admin_leads', label: 'Leads', description: 'View leads captured across all organisations' },
  { key: 'admin_domains', label: 'Domains', description: 'Platform domains and organisation domain requests' },
  { key: 'admin_subscriptions', label: 'Subscriptions', description: 'Plans, organisation subscriptions and package requests' },
  { key: 'admin_email', label: 'Email & SMTP', description: 'Platform email delivery and logs' },
  { key: 'admin_audit_logs', label: 'Audit logs', description: 'Platform audit history' },
  { key: 'admin_settings', label: 'Settings', description: 'Platform configuration' },
  { key: 'admin_support', label: 'Support Management', description: "Organisations' support tickets and conversations" },
];

export const PLATFORM_PERMISSION_MODULE_KEYS = PLATFORM_PERMISSION_MODULES.map(
  (m) => m.key,
);

const MODULE_ACTIONS = new Map<string, readonly PermissionAction[]>(
  [...PERMISSION_MODULES, ...PLATFORM_PERMISSION_MODULES].map((def) => [
    def.key,
    def.actions ?? DEFAULT_MODULE_ACTIONS,
  ]),
);

/** The actions a module supports (DEFAULT_MODULE_ACTIONS unless it lists its own). */
export function moduleActions(
  moduleKey: string,
): readonly PermissionAction[] {
  return MODULE_ACTIONS.get(moduleKey) ?? DEFAULT_MODULE_ACTIONS;
}

/**
 * Forces every action a module does not support to `false`, so stale rows
 * (e.g. a Dashboard "Add" saved before the module became view-only) can never
 * grant anything and are never shown as enabled.
 */
export function clampToModuleActions<T extends ModulePermission>(row: T): T {
  const supported = moduleActions(row.moduleKey);
  const clamped: T = { ...row };
  for (const action of PERMISSION_ACTIONS) {
    if (!supported.includes(action)) {
      (clamped as ModulePermission)[actionToColumn(action)] = false;
    }
  }
  return clamped;
}

export const PLATFORM_ROUTE_MODULES: Array<{ prefix: string; module: string }> = [
  // Platform roles (the "Roles" tab) share the Platform Team module — see
  // the note on PLATFORM_PERMISSION_MODULES above.
  { prefix: '/admin/platform-roles', module: 'admin_platform_team' },
  { prefix: '/admin/platform-team', module: 'admin_platform_team' },
  { prefix: '/admin/platform-config', module: 'admin_settings' },
  { prefix: '/admin/organisations', module: 'admin_organisations' },
  { prefix: '/admin/org-domain-requests', module: 'admin_domains' },
  { prefix: '/admin/landing-pages', module: 'admin_templates' },
  { prefix: '/admin/typography-sets', module: 'admin_templates' },
  { prefix: '/admin/templates', module: 'admin_templates' },
  { prefix: '/admin/forms', module: 'admin_forms' },
  { prefix: '/admin/leads', module: 'admin_leads' },
  { prefix: '/admin/package-change-requests', module: 'admin_subscriptions' },
  { prefix: '/admin/subscriptions', module: 'admin_subscriptions' },
  { prefix: '/admin/plans', module: 'admin_subscriptions' },
  { prefix: '/admin/email', module: 'admin_email' },
  { prefix: '/admin/notifications', module: 'admin_notifications' },
  { prefix: '/admin/dashboard', module: 'admin_dashboard' },
  { prefix: '/admin/roles', module: 'admin_org_roles' },
  { prefix: '/admin/audit-logs', module: 'admin_audit_logs' },
  { prefix: '/admin/support', module: 'admin_support' },
];

export function platformModuleForPath(path: string): string | null {
  const normalized = path.split('?')[0];
  const hit = PLATFORM_ROUTE_MODULES.find((row) =>
    normalized === row.prefix || normalized.startsWith(`${row.prefix}/`),
  );
  return hit?.module ?? null;
}

export function actionFromHttpMethod(method: string): PermissionAction {
  const verb = method.toUpperCase();
  if (verb === 'GET' || verb === 'HEAD') return 'view';
  if (verb === 'POST') return 'add';
  if (verb === 'DELETE') return 'delete';
  return 'edit';
}

export type PermissionColumn =
  | 'canView'
  | 'canAdd'
  | 'canEdit'
  | 'canDelete'
  | 'canApprove'
  | 'canActivate'
  | 'canDeactivate'
  | 'canAddLead';

/** Prisma `select` for every permission column (role and user rows). */
export const PERMISSION_COLUMN_SELECT = {
  canView: true,
  canAdd: true,
  canEdit: true,
  canDelete: true,
  canApprove: true,
  canActivate: true,
  canDeactivate: true,
  canAddLead: true,
} as const satisfies Record<PermissionColumn, true>;

/** A single module's permission row as stored/returned by the API. */
export type ModulePermission = { moduleKey: string } & Record<
  PermissionColumn,
  boolean
>;

/** Map of moduleKey -> { action -> boolean }, the shape the frontend's
 *  `Permissions` type consumes. */
export type EffectivePermissions = Record<
  string,
  Partial<Record<PermissionAction, boolean>>
>;

// Platform super admin is never restricted. Organisation Admin starts with
// full defaults, but Super Admin can explicitly revoke those defaults.
const UNRESTRICTED_ROLES: ReadonlySet<string> = new Set([
  'super_admin',
]);

/** Defaults applied when an org has not yet customised a role for a module. */
const DEFAULT_BY_KEY: Record<
  string,
  Record<string, Partial<Record<PermissionAction, boolean>>>
> = {
  manager: {
    dashboard: { view: true },
    crm: { view: true, add: true, edit: true },
    forms: { view: true, add: true, edit: true },
    projects: { view: true, add: true, edit: true, approve: true, activate: true, add_lead: true },
    websites: { view: true },
    landing_pages: { view: true },
    templates: { view: true },
    // calling: { view: true, add: true, edit: true }, // [DISABLED-CALLING]
    // whatsapp: { view: true, add: true, edit: true }, // [DISABLED-WHATSAPP]
    reports: { view: true },
    team_chat: { view: true, add: true, edit: true },
  },
  sales: {
    dashboard: { view: true },
    crm: { view: true, add: true, edit: true },
    // calling: { view: true, add: true, edit: true }, // [DISABLED-CALLING]
    // whatsapp: { view: true, add: true, edit: true }, // [DISABLED-WHATSAPP]
    team_chat: { view: true, add: true },
  },
  telecaller: {
    dashboard: { view: true },
    crm: { view: true, add: true, edit: true },
    // calling: { view: true, add: true, edit: true }, // [DISABLED-CALLING]
    // whatsapp: { view: true, add: true, edit: true }, // [DISABLED-WHATSAPP]
    team_chat: { view: true },
  },
};

/** The baked-in defaults for a role key (empty for custom roles). */
export function roleDefaults(
  roleKey: string,
): Record<string, Partial<Record<PermissionAction, boolean>>> {
  return DEFAULT_BY_KEY[roleKey] ?? {};
}

const EMPTY: Partial<Record<PermissionAction, boolean>> = {};

/** The actions a module row supports, used to normalise input from the API. */
export function emptyModulePermission(moduleKey: string): ModulePermission {
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

/** Every action granted — clamp with clampToModuleActions for real modules. */
export function fullModulePermission(moduleKey: string): ModulePermission {
  return {
    moduleKey,
    canView: true,
    canAdd: true,
    canEdit: true,
    canDelete: true,
    canApprove: true,
    canActivate: true,
    canDeactivate: true,
    canAddLead: true,
  };
}

/** Converts a stored module row (or role default) into the flat shape. */
export function dtoToModulePermission(
  moduleKey: string,
  source:
    | Partial<Record<PermissionColumn, boolean | null>>
    | Partial<Record<PermissionAction, boolean>>,
): ModulePermission {
  const isFull = 'canView' in source;
  const get = (action: PermissionAction) =>
    (isFull
      ? source[actionToColumn(action)]
      : (source as Partial<Record<PermissionAction, boolean>>)[action]) ??
    false;
  const row = emptyModulePermission(moduleKey);
  for (const action of PERMISSION_ACTIONS) {
    row[actionToColumn(action)] = get(action);
  }
  return row;
}

export function actionToColumn(action: PermissionAction): PermissionColumn {
  // snake_case actions map to camelCase columns (add_lead -> canAddLead).
  const pascal = action
    .split('_')
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join('');
  return ('can' + pascal) as PermissionColumn;
}

/** The actions + which columns map to them, for building Prisma update data. */
export const ACTION_TO_COLUMN: Record<PermissionAction, PermissionColumn> = {
  view: 'canView',
  add: 'canAdd',
  edit: 'canEdit',
  delete: 'canDelete',
  approve: 'canApprove',
  activate: 'canActivate',
  deactivate: 'canDeactivate',
  add_lead: 'canAddLead',
};

// ---------------------------------------------------------------------------
// Effective-permission computation.
//   - super_admin => everything, always.
//   - otherwise => role's configured rows for each module, overridden by any
//     per-user override rows that set a non-null column for that module.
//   - modules with no configured row fall back to DEFAULT_ROLE_PERMISSIONS.
//   - actions a module doesn't support are always false.
// ---------------------------------------------------------------------------

export interface PermissionSource {
  roleKeys: string[];
  rolePermissions: Array<
    { role: { key: string }; moduleKey: string } & Partial<
      Record<PermissionColumn, boolean>
    >
  >;
  userOverrides: Array<
    { moduleKey: string } & Partial<Record<PermissionColumn, boolean | null>>
  >;
}

export function isUnrestrictedRole(roleKeys: string[]): boolean {
  return roleKeys.some((key) => UNRESTRICTED_ROLES.has(key));
}

/**
 * Computes the effective permissions for a user given their role rows and any
 * per-user override rows. Returns the flat `Record<moduleKey, ModulePermission>`
 * shape and a `has(page, action)` predicate for guard-style checks.
 */
export function computeEffectivePermissions(
  source: PermissionSource,
): { byModule: Record<string, ModulePermission>; has: (module: string, action: PermissionAction) => boolean } {
  const byModule: Record<string, ModulePermission> = {};

  // Unrestricted roles get every module/action.
  if (isUnrestrictedRole(source.roleKeys)) {
    for (const def of PERMISSION_MODULES) {
      byModule[def.key] = clampToModuleActions(fullModulePermission(def.key));
    }
    const has = () => true;
    return { byModule, has };
  }

  const primaryRoleKey = source.roleKeys[0];
  const defaultsForRole = primaryRoleKey ? roleDefaults(primaryRoleKey) : {};

  const roleByModule = new Map<string, ModulePermission>();
  for (const row of source.rolePermissions) {
    roleByModule.set(row.moduleKey, dtoToModulePermission(row.moduleKey, row));
  }

  const overrideByModule = new Map<string, PermissionSource['userOverrides'][number]>();
  for (const row of source.userOverrides) {
    overrideByModule.set(row.moduleKey, row);
  }

  for (const def of PERMISSION_MODULES) {
    // Org admin with no configured row keeps full access to that module.
    const roleRow =
      roleByModule.get(def.key) ??
      (primaryRoleKey === 'admin' ? fullModulePermission(def.key) : undefined);
    const overrideRow = overrideByModule.get(def.key);
    // Explicit override values (including false) win; null keeps the role
    // grant (or, with no role row, the baked-in default).
    const base =
      roleRow ?? dtoToModulePermission(def.key, defaultsForRole[def.key] ?? EMPTY);
    const merged = { ...base };
    if (overrideRow) {
      for (const action of PERMISSION_ACTIONS) {
        const column = actionToColumn(action);
        const value = overrideRow[column];
        if (typeof value === 'boolean') merged[column] = value;
        else if (!roleRow) merged[column] = false;
      }
    }
    byModule[def.key] = clampToModuleActions(merged);
  }

  const has = (module: string, action: PermissionAction): boolean =>
    byModule[module]?.[actionToColumn(action)] === true;

  return { byModule, has };
}

/** Shape for the caller when only the boolean check is needed. */
export function hasPermission(
  effective: { has: (module: string, action: PermissionAction) => boolean },
  module: string,
  action: PermissionAction,
): boolean {
  return effective.has(module, action);
}

/** Throws a 403 unless the user's effective permissions allow (module, action). */
export function assertPermission(
  effective: { has: (module: string, action: PermissionAction) => boolean },
  module: string,
  action: PermissionAction,
): void {
  if (!effective.has(module, action)) {
    throw new ForbiddenException(
      `You do not have permission to ${action} on ${module}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Persistence helpers used by the org-permissions service. These live here so
// both the service and (optionally) the seed share the same row → shape logic.
// ---------------------------------------------------------------------------

export interface RolePermissionRow {
  roleKey: string;
  roleName: string;
  roleId: string;
  scope: RoleScope;
  restricted: boolean;
  permissions: ModulePermission[];
}

export type PermissionsPrisma = Pick<
  PrismaService,
  'role' | 'roleModulePermission' | 'userModulePermission' | 'user'
>;

export const SYSTEM_ORG_ID = 'system';

export function mergeRolePermissions<T extends { orgId?: string; moduleKey: string }>(rows: T[]): T[] {
  const map = new Map<string, T>();
  for (const row of rows) {
    if (row.orgId === SYSTEM_ORG_ID) {
      map.set(row.moduleKey, row);
    }
  }
  for (const row of rows) {
    if (row.orgId !== SYSTEM_ORG_ID) {
      map.set(row.moduleKey, row);
    }
  }
  return Array.from(map.values());
}

export async function loadRolePermissions(
  prisma: PermissionsPrisma,
  orgId: string,
  roleKeys?: string[],
): Promise<RolePermissionRow[]> {
  const roles = await prisma.role.findMany({
    where: roleKeys?.length
      ? { key: { in: roleKeys } }
      : {
          status: 'active',
          scope: { in: ['organisation', 'team'] },
          OR: [{ orgId: null }, { orgId }],
        },
    orderBy: { sortOrder: 'asc' },
  });

  const [orgRows, systemRows] = await Promise.all([
    prisma.roleModulePermission.findMany({
      where: { orgId, roleId: { in: roles.map((r) => r.id) } },
      orderBy: { moduleKey: 'asc' },
    }),
    prisma.roleModulePermission.findMany({
      where: { orgId: SYSTEM_ORG_ID, roleId: { in: roles.map((r) => r.id) } },
      orderBy: { moduleKey: 'asc' },
    }),
  ]);

  const byRole = new Map<string, Map<string, ModulePermission>>();
  const systemByRole = new Map<string, Map<string, ModulePermission>>();

  for (const row of systemRows) {
    if (!systemByRole.has(row.roleId)) systemByRole.set(row.roleId, new Map());
    systemByRole.get(row.roleId)!.set(row.moduleKey, dtoToModulePermission(row.moduleKey, row));
  }

  for (const row of orgRows) {
    if (!byRole.has(row.roleId)) byRole.set(row.roleId, new Map());
    byRole.get(row.roleId)!.set(row.moduleKey, dtoToModulePermission(row.moduleKey, row));
  }

  return roles.map((role) => {
    const orgMap = byRole.get(role.id) ?? new Map<string, ModulePermission>();
    const systemMap = systemByRole.get(role.id) ?? new Map<string, ModulePermission>();
    const unrestricted = UNRESTRICTED_ROLES.has(role.key);
    const permissions = PERMISSION_MODULES.map((def) => {
      if (unrestricted) {
        return clampToModuleActions(fullModulePermission(def.key));
      }
      // 1. Org-specific customization, 2. Superadmin-configured system
      // default, 3. built-in hardcoded fallback — for the org admin that is
      // full access, matching computeEffectivePermissions.
      return clampToModuleActions(
        orgMap.get(def.key)
          ?? systemMap.get(def.key)
          ?? (role.key === 'admin'
            ? fullModulePermission(def.key)
            : dtoToModulePermission(def.key, defaultForRole(role.key, def.key))),
      );
    });

    return {
      roleKey: role.key,
      roleName: role.name,
      roleId: role.id,
      scope: role.scope,
      restricted: !unrestricted,
      permissions,
    };
  });
}

export function defaultForRole(
  roleKey: string,
  moduleKey: string,
): Partial<Record<PermissionAction, boolean>> {
  return roleDefaults(roleKey)[moduleKey] ?? EMPTY;
}

/** Builds the full row set of Prisma column updates for one module. */
export function modulePermissionUpsertData(input: ModulePermission) {
  const perm = clampToModuleActions(input);
  return {
    canView: perm.canView,
    canAdd: perm.canAdd,
    canEdit: perm.canEdit,
    canDelete: perm.canDelete,
    canApprove: perm.canApprove,
    canActivate: perm.canActivate,
    canDeactivate: perm.canDeactivate,
    canAddLead: perm.canAddLead,
  };
}

/** Shared wording for "this role still has users" refusals. */
export function roleInUseMessage(roleName: string, users: number, action: string) {
  const who = users === 1 ? '1 user' : `${users} users`;
  return `Role '${roleName}' is assigned to ${who}. Remove or reassign ${users === 1 ? 'that user' : 'those users'} first, then you can ${action}.`;
}
