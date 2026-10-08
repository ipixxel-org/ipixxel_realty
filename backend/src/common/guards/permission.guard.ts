import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { PrismaService } from '../../database/prisma.service';
import { JwtPayload } from '../types/jwt-payload.interface';
import {
  PERMISSION_METADATA_KEY,
  RequiredPermission,
} from '../decorators/require-permission.decorator';
import {
  assertPermission,
  computeEffectivePermissions,
  mergeRolePermissions,
  PERMISSION_COLUMN_SELECT,
  SYSTEM_ORG_ID,
  type PermissionAction,
} from '../utils/permissions.util';

/**
 * Enforces page/action permissions declared with @RequirePermission(module, action).
 * Must run after JwtAuthGuard (relies on request.user) and is typically chained
 * with OrgAdminGuard/OrgApprovedGuard per the existing convention — this guard
 * only narrows further based on the @RequirePermission decorator.
 *
 * Rules:
 *   - user with super_admin always passes; the org's admin role passes unless
 *     the route sets `enforceForOrgAdmin` (then its Super Admin defaults apply).
 *   - otherwise the effective permission is resolved from the DB (role rows +
 *     any per-user override rows), falling back to role defaults, and the
 *     requested (module, action) must be granted.
 *   - routes without @RequirePermission metadata pass through untouched.
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<RequiredPermission | undefined>(
      PERMISSION_METADATA_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!required) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<Request & { user: JwtPayload }>();
    await assertOrgPermission(
      this.prisma,
      request.user,
      required.module,
      required.action,
      required.enforceForOrgAdmin === true,
    );
    return true;
  }
}

/**
 * Throws a 403 unless the org member `actor` holds (module, action). Shared by
 * PermissionGuard and handlers whose required action depends on the request
 * body (e.g. setting a user active vs disabled).
 */
export async function assertOrgPermission(
  prisma: Pick<
    PrismaService,
    'user' | 'roleModulePermission' | 'userModulePermission'
  >,
  actor: JwtPayload | undefined,
  module: string,
  action: PermissionAction,
  enforceForOrgAdmin: boolean,
): Promise<void> {
  const orgId = actor?.orgId;
  if (!actor || !orgId) {
    throw new ForbiddenException('Organisation access required');
  }

  // Resolve roles + permission rows for this org member.
  const user = await prisma.user.findUnique({
    where: { id: actor.sub },
    select: {
      id: true,
      orgId: true,
      userRoles: { select: { role: { select: { key: true } } } },
    },
  });
  if (!user || user.orgId !== orgId) {
    throw new ForbiddenException('User not found in this organisation');
  }

  const roleKeys = user.userRoles.map((ur) => ur.role.key);

  // Unrestricted roles bypass immediately — no DB reads needed for them.
  if (isUnrestricted(roleKeys, enforceForOrgAdmin)) {
    return;
  }

  const [rawRolePermissions, userOverrides] = await Promise.all([
    prisma.roleModulePermission.findMany({
      where: {
        orgId: { in: [orgId, SYSTEM_ORG_ID] },
        role: { key: { in: roleKeys } },
      },
      select: { orgId: true, moduleKey: true, ...PERMISSION_COLUMN_SELECT },
    }),
    prisma.userModulePermission.findMany({
      where: { orgId, userId: actor.sub },
      select: { moduleKey: true, ...PERMISSION_COLUMN_SELECT },
    }),
  ]);

  const rolePermissions = mergeRolePermissions(rawRolePermissions);

  const effective = computeEffectivePermissions({
    roleKeys,
    rolePermissions: rolePermissions.map((row) => ({
      role: { key: roleKeys[0] ?? '' },
      ...row,
    })),
    userOverrides,
  });

  assertPermission(effective, module, action);
}

/**
 * Batch form of hasOrgPermission: which of `userIds` (members of `orgId`)
 * hold (module, action). Same tiers as assertOrgPermission — per-user
 * override, then org role row, then the Super Admin system row, then the
 * baked-in role default; admin/super_admin unrestricted — in three queries
 * for any number of users. Users outside the org are never returned.
 */
export async function usersWithOrgPermission(
  prisma: Pick<
    PrismaService,
    'user' | 'roleModulePermission' | 'userModulePermission'
  >,
  orgId: string,
  userIds: string[],
  module: string,
  action: PermissionAction,
): Promise<Set<string>> {
  const allowed = new Set<string>();
  if (userIds.length === 0) return allowed;

  const users = await prisma.user.findMany({
    where: { id: { in: userIds }, orgId },
    select: {
      id: true,
      userRoles: { select: { role: { select: { key: true } } } },
    },
  });
  const allRoleKeys = [
    ...new Set(users.flatMap((u) => u.userRoles.map((ur) => ur.role.key))),
  ];
  const [roleRows, overrideRows] = await Promise.all([
    prisma.roleModulePermission.findMany({
      where: {
        orgId: { in: [orgId, SYSTEM_ORG_ID] },
        moduleKey: module,
        role: { key: { in: allRoleKeys } },
      },
      select: {
        orgId: true,
        moduleKey: true,
        role: { select: { key: true } },
        ...PERMISSION_COLUMN_SELECT,
      },
    }),
    prisma.userModulePermission.findMany({
      where: { orgId, userId: { in: users.map((u) => u.id) }, moduleKey: module },
      select: { userId: true, moduleKey: true, ...PERMISSION_COLUMN_SELECT },
    }),
  ]);

  for (const user of users) {
    const roleKeys = user.userRoles.map((ur) => ur.role.key);
    if (isUnrestricted(roleKeys, false)) {
      allowed.add(user.id);
      continue;
    }
    const rolePermissions = mergeRolePermissions(
      roleRows.filter((r) => roleKeys.includes(r.role.key)),
    );
    const effective = computeEffectivePermissions({
      roleKeys,
      // Same shape assertOrgPermission passes (role key = primary role).
      rolePermissions: rolePermissions.map((row) => ({
        ...row,
        role: { key: roleKeys[0] ?? '' },
      })),
      userOverrides: overrideRows.filter((r) => r.userId === user.id),
    });
    if (effective.has(module, action)) allowed.add(user.id);
  }
  return allowed;
}

/**
 * Boolean form of assertOrgPermission, for handlers that allow an action
 * either by permission or by some other right (e.g. Team Chat: channel admin
 * OR team_chat:edit).
 */
export async function hasOrgPermission(
  prisma: Parameters<typeof assertOrgPermission>[0],
  actor: JwtPayload | undefined,
  module: string,
  action: PermissionAction,
  enforceForOrgAdmin = false,
): Promise<boolean> {
  try {
    await assertOrgPermission(prisma, actor, module, action, enforceForOrgAdmin);
    return true;
  } catch (err) {
    if (err instanceof ForbiddenException) return false;
    throw err;
  }
}

/**
 * Passes when the member holds ANY of the given actions on the module (e.g. a
 * support attachment is uploaded for either a new ticket or a reply).
 */
export async function assertAnyOrgPermission(
  prisma: Parameters<typeof assertOrgPermission>[0],
  actor: JwtPayload | undefined,
  module: string,
  actions: PermissionAction[],
  enforceForOrgAdmin: boolean,
): Promise<void> {
  let lastError: unknown = new ForbiddenException('Permission denied');
  for (const action of actions) {
    try {
      await assertOrgPermission(prisma, actor, module, action, enforceForOrgAdmin);
      return;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

function isUnrestricted(
  roleKeys: string[],
  enforceForOrgAdmin: boolean,
): boolean {
  if (roleKeys.includes('super_admin')) return true;
  return !enforceForOrgAdmin && roleKeys.includes('admin');
}
