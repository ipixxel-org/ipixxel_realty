import type { PrismaService } from '../../database/prisma.service';
import { SYSTEM_ORG_ID, roleDefaults } from './permissions.util';

// The single rule for "who can hold a lead" — used by both the Lead Center
// individual-assignee picker (LeadsService.listAssignableUsers) and the
// project Sales Agent picker / setter (ProjectsService). Permission-based
// rather than a role-name match, so a custom role works as long as it grants
// CRM access, and a user with several roles is judged on all of them.
//
// A user is eligible when:
//   - they are an active member of the org, AND
//   - none of their roles is `super_admin` / `admin` (org-wide) or `manager`
//     (managers get their own Project Manager field, never the agent list), AND
//   - at least one of their roles grants `crm` view — via an explicit
//     RoleModulePermission row, or the baked-in default for a system role —
//     unless a per-user override for `crm` explicitly sets it.
// Exported so the project sales-agent rule (ProjectsService — "everyone except
// Admin and Manager", no CRM-permission requirement) uses this same set rather
// than re-declaring it. The lead / standalone-unit rule above additionally
// requires crm:view; the project rule deliberately does not.
export const EXCLUDED_ROLE_KEYS: ReadonlySet<string> = new Set([
  'super_admin',
  'admin',
  'manager',
]);

export interface LeadAssignableUser {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  name: string;
  role: { key: string; name: string } | null;
}

type LeadAssigneePrisma = Pick<
  PrismaService,
  'user' | 'roleModulePermission' | 'userModulePermission'
>;

export async function listLeadAssignableUsers(
  prisma: LeadAssigneePrisma,
  orgId: string,
): Promise<LeadAssignableUser[]> {
  const users = await prisma.user.findMany({
    // Paused users (billing v2) can't sign in, so they aren't offered.
    where: { orgId, status: 'active', billingPausedAt: null },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      userRoles: {
        select: { role: { select: { key: true, name: true, status: true } } },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  const roleKeys = [
    ...new Set(
      users.flatMap((u) =>
        u.userRoles
          .filter((ur) => ur.role.status === 'active')
          .map((ur) => ur.role.key),
      ),
    ),
  ];

  const [roleCrmRows, userCrmOverrides] = await Promise.all([
    roleKeys.length
      ? prisma.roleModulePermission.findMany({
          where: {
            orgId: { in: [orgId, SYSTEM_ORG_ID] },
            moduleKey: 'crm',
            role: { key: { in: roleKeys } },
          },
          select: { orgId: true, canView: true, role: { select: { key: true } } },
        })
      : Promise.resolve([]),
    prisma.userModulePermission.findMany({
      where: { orgId, moduleKey: 'crm', userId: { in: users.map((u) => u.id) } },
      select: { userId: true, canView: true },
    }),
  ]);

  // Explicit per-role crm:view, org row winning over the system row.
  const roleCrmView = new Map<string, boolean>();
  for (const row of roleCrmRows) {
    if (row.orgId === orgId || !roleCrmView.has(row.role.key)) {
      roleCrmView.set(row.role.key, row.canView);
    }
  }
  // Per-user override (null = "inherit", so ignored).
  const userCrmView = new Map(
    userCrmOverrides
      .filter((o) => o.canView !== null)
      .map((o) => [o.userId, o.canView as boolean]),
  );

  const roleGrantsCrmView = (key: string): boolean => {
    const explicit = roleCrmView.get(key);
    if (explicit !== undefined) return explicit;
    return roleDefaults(key).crm?.view === true;
  };

  return users
    .filter((u) => {
      const keys = u.userRoles
        .filter((ur) => ur.role.status === 'active')
        .map((ur) => ur.role.key);
      if (keys.some((k) => EXCLUDED_ROLE_KEYS.has(k))) return false;
      const override = userCrmView.get(u.id);
      if (override !== undefined) return override;
      return keys.some(roleGrantsCrmView);
    })
    .map((u) => ({
      id: u.id,
      firstName: u.firstName,
      lastName: u.lastName,
      email: u.email,
      name:
        [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email,
      role: u.userRoles[0]
        ? { key: u.userRoles[0].role.key, name: u.userRoles[0].role.name }
        : null,
    }));
}
