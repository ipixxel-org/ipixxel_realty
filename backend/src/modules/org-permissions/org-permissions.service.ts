import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import {
  PERMISSION_ACTIONS,
  PERMISSION_COLUMN_SELECT,
  PERMISSION_MODULES,
  actionToColumn,
  clampToModuleActions,
  computeEffectivePermissions,
  defaultForRole,
  dtoToModulePermission,
  emptyModulePermission,
  loadRolePermissions,
  mergeRolePermissions,
  moduleActions,
  modulePermissionUpsertData,
  roleInUseMessage,
  SYSTEM_ORG_ID,
  type ModulePermission,
  type PermissionAction,
  type PermissionColumn,
} from '../../common/utils/permissions.util';
import { UpdateRolePermissionsDto } from './dto/update-role-permissions.dto';
import { SetUserPermissionsDto } from './dto/set-user-permissions.dto';
import type { JwtPayload } from '../../common/types/jwt-payload.interface';

// Roles the org admin can never configure for their own org. They are shown
// locked in the UI; the org `admin` role's defaults are set by Super Admin in
// Organisation roles.
const UNRESTRICTABLE = new Set(['admin', 'super_admin']);

export type UserPermissionItem = Partial<Record<PermissionAction, boolean>> & {
  moduleKey: string;
};

@Injectable()
export class OrgPermissionsService {
  constructor(private readonly prisma: PrismaService) {}

  /** The page/action matrix the admin UI renders, plus role defaults. */
  async getCatalog(orgId: string) {
    const roles = await this.prisma.role.findMany({
      where: {
        status: 'active',
        scope: { in: ['organisation', 'team'] },
        OR: [{ orgId: null }, { orgId }],
      },
      select: { id: true, key: true, name: true, scope: true, sortOrder: true, orgId: true },
      orderBy: { sortOrder: 'asc' },
    });

    // Members per org-created role, so the UI can explain why a role in use
    // can't be deleted before trying (the delete itself re-checks).
    const customIds = roles.filter((r) => r.orgId === orgId).map((r) => r.id);
    const assignments = customIds.length
      ? await this.prisma.userRole.findMany({
          where: { roleId: { in: customIds } },
          select: { roleId: true },
        })
      : [];
    const userCounts = new Map<string, number>();
    for (const a of assignments) {
      userCounts.set(a.roleId, (userCounts.get(a.roleId) ?? 0) + 1);
    }

    return {
      actions: [...PERMISSION_ACTIONS],
      modules: PERMISSION_MODULES.map((def) => ({
        key: def.key,
        label: def.label,
        description: def.description,
        actions: [...moduleActions(def.key)],
        actionLabels: def.actionLabels ?? {},
      })),
      roles: roles.map((role) => ({
        id: role.id,
        key: role.key,
        name: role.name,
        scope: role.scope,
        // Org admin + platform roles are always full-access and locked.
        locked: UNRESTRICTABLE.has(role.key),
        // Org-created custom role — the org admin can rename/delete it.
        custom: role.orgId === orgId,
        userCount: role.orgId === orgId ? userCounts.get(role.id) ?? 0 : undefined,
      })),
    };
  }

  /** Roles this org may create for its own members (custom roles). */
  async listOrgRoles(orgId: string) {
    return this.prisma.role.findMany({
      where: { orgId },
      orderBy: { sortOrder: 'asc' },
      include: { _count: { select: { userRoles: true } } },
    });
  }

  /** Create a new custom role scoped to this org (org admin only). */
  async createOrgRole(
    orgId: string,
    dto: { name: string; description?: string },
  ) {
    const rawKey = `org_${orgId.slice(0, 8)}_${dto.name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, '_')}`;

    const existing = await this.prisma.role.findFirst({
      where: { orgId, key: rawKey },
    });
    if (existing) {
      throw new BadRequestException(`A role named '${dto.name}' already exists`);
    }

    const count = await this.prisma.role.count({ where: { orgId } });

    return this.prisma.role.create({
      data: {
        orgId,
        key: rawKey,
        name: dto.name,
        description: dto.description ?? '',
        scope: 'organisation',
        status: 'active',
        sortOrder: 100 + count,
      },
    });
  }

  /** Rename/disable a custom role this org created. */
  async updateOrgRole(
    orgId: string,
    roleId: string,
    dto: { name?: string; description?: string; status?: 'active' | 'inactive' },
  ) {
    const role = await this.prisma.role.findFirst({ where: { id: roleId, orgId } });
    if (!role) {
      throw new NotFoundException('Role not found');
    }
    if (dto.status === 'inactive' && role.status !== 'inactive') {
      const assigned = await this.prisma.userRole.count({ where: { roleId } });
      if (assigned > 0) {
        throw new BadRequestException(roleInUseMessage(role.name, assigned, 'make it inactive'));
      }
    }

    return this.prisma.role.update({
      where: { id: roleId },
      data: {
        ...(dto.name ? { name: dto.name } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.status ? { status: dto.status } : {}),
      },
    });
  }

  /** Delete a custom role this org created, if unused. */
  async removeOrgRole(orgId: string, roleId: string) {
    const role = await this.prisma.role.findFirst({
      where: { id: roleId, orgId },
      include: { _count: { select: { userRoles: true } } },
    });
    if (!role) {
      throw new NotFoundException('Role not found');
    }
    if (role._count.userRoles > 0) {
      throw new BadRequestException(
        roleInUseMessage(role.name, role._count.userRoles, 'delete it'),
      );
    }

    await this.prisma.role.delete({ where: { id: roleId } });
    return { success: true };
  }

  /** Every configurable role with its current page/action rows for this org. */
  async listRoles(orgId: string) {
    return loadRolePermissions(this.prisma, orgId);
  }

  /**
   * Full-set replace of ONE role's permissions within this org. Missing
   * modules are cleared so they fall back to the role default. The org's own
   * `admin` / `super_admin` roles are governed by Super Admin only.
   */
  async updateRole(
    orgId: string,
    actor: JwtPayload,
    roleKey: string,
    dto: UpdateRolePermissionsDto,
  ) {
    if (UNRESTRICTABLE.has(roleKey)) {
      throw new BadRequestException(
        'Organisation Admin permissions are managed by the platform and cannot be changed here',
      );
    }

    const role = await this.prisma.role.findFirst({
      where: {
        key: roleKey,
        status: 'active',
        scope: { in: ['organisation', 'team'] },
        OR: [{ orgId: null }, { orgId }],
      },
      select: { id: true },
    });
    if (!role) {
      throw new BadRequestException('That role is not configurable');
    }

    await this.assertCanChangeRole(orgId, actor, roleKey, dto);

    // What this role inherits when the org has no row of its own: the Super
    // Admin's default (Organisation roles), else the built-in default.
    const systemRows = await this.prisma.roleModulePermission.findMany({
      where: { orgId: SYSTEM_ORG_ID, roleId: role.id },
      select: { moduleKey: true, ...PERMISSION_COLUMN_SELECT },
    });
    const inherited = new Map(
      systemRows.map((r) => [r.moduleKey, dtoToModulePermission(r.moduleKey, r)]),
    );

    const input = dto.permissions;
    const seen = new Set<string>();
    // Modules the org has actually changed from the inherited default. Only
    // these get an org row; everything else keeps following Super Admin, so a
    // later change to the platform default still reaches this org.
    const overridden = new Set<string>();

    await this.prisma.$transaction(async (tx) => {
      for (const item of input) {
        if (seen.has(item.moduleKey)) continue;
        seen.add(item.moduleKey);
        const data = modulePermissionUpsertData(
          dtoToModulePermission(item.moduleKey, item),
        );
        const baseline = modulePermissionUpsertData(
          inherited.get(item.moduleKey) ??
            dtoToModulePermission(item.moduleKey, defaultForRole(roleKey, item.moduleKey)),
        );
        if (samePermissions(data, baseline)) continue;
        overridden.add(item.moduleKey);
        await tx.roleModulePermission.upsert({
          where: {
            orgId_roleId_moduleKey: {
              orgId,
              roleId: role.id,
              moduleKey: item.moduleKey,
            },
          },
          update: data,
          create: { orgId, roleId: role.id, moduleKey: item.moduleKey, ...data },
        });
      }
      // Anything not sent, or matching the inherited default, is removed so
      // it falls back to the Super Admin / built-in default.
      await tx.roleModulePermission.deleteMany({
        where: {
          orgId,
          roleId: role.id,
          moduleKey: { notIn: [...overridden] },
        },
      });
    });

    const rows = await loadRolePermissions(this.prisma, orgId);
    return rows.find((r) => r.roleKey === roleKey) ?? null;
  }

  /**
   * Safety rules for members (non org-admins) holding Roles & Permissions >
   * Edit role permissions, so the right can't be used to escalate:
   *   1. they can't change a role they hold themselves;
   *   2. they can only switch ON an action they hold themselves (grants that
   *      are already on and that they lack are left untouched, not blocked).
   * The org admin is exempt — their own access is set by Super Admin.
   */
  private async assertCanChangeRole(
    orgId: string,
    actor: JwtPayload,
    roleKey: string,
    dto: UpdateRolePermissionsDto,
  ) {
    const actorUser = await this.prisma.user.findFirst({
      where: { id: actor.sub, orgId },
      select: { userRoles: { select: { role: { select: { key: true } } } } },
    });
    const actorRoleKeys = actorUser?.userRoles.map((ur) => ur.role.key) ?? [];
    if (actorRoleKeys.includes('admin')) return;

    if (actorRoleKeys.includes(roleKey)) {
      throw new ForbiddenException(
        "You can't change the permissions of a role you hold yourself",
      );
    }

    const [roles, actorEffective] = await Promise.all([
      loadRolePermissions(this.prisma, orgId),
      this.resolveEffective(orgId, actor.sub, actorRoleKeys),
    ]);
    const current = new Map(
      (roles.find((r) => r.roleKey === roleKey)?.permissions ?? []).map((p) => [
        p.moduleKey,
        p,
      ]),
    );

    const denied: string[] = [];
    for (const item of dto.permissions) {
      const def = PERMISSION_MODULES.find((m) => m.key === item.moduleKey);
      if (!def) continue;
      const next = clampToModuleActions(dtoToModulePermission(item.moduleKey, item));
      const before = current.get(item.moduleKey);
      for (const action of moduleActions(item.moduleKey)) {
        const column = actionToColumn(action);
        const turningOn = next[column] && !before?.[column];
        if (turningOn && !actorEffective.has(item.moduleKey, action)) {
          const label =
            def.actionLabels?.[action] ?? action[0].toUpperCase() + action.slice(1);
          denied.push(`${def.label} › ${label}`);
        }
      }
    }
    if (denied.length > 0) {
      throw new ForbiddenException(
        `You can only grant permissions you have yourself: ${denied.join(", ")}`,
      );
    }
  }

  /** Effective (role + overrides) permissions for a specific user. */
  async getUserPermissions(orgId: string, userId: string) {
    return this.loadUserPermissions(orgId, userId);
  }

  /**
   * Full-set replace of one user's per-module overrides. Sending a null (or
   * omitting) a column clears that override so it inherits from the role. A
   * module whose columns are all clear is removed entirely.
   */
  async setUserPermissions(
    orgId: string,
    actorUserId: string,
    userId: string,
    dto: SetUserPermissionsDto,
  ) {
    const target = await this.prisma.user.findFirst({
      where: { id: userId, orgId },
      select: {
        id: true,
        userRoles: { select: { role: { select: { key: true } } } },
      },
    });
    if (!target) {
      throw new NotFoundException('User not found');
    }
    if (userId === actorUserId) {
      throw new ForbiddenException('You cannot change your own permissions');
    }
    if (target.userRoles.some((ur) => ur.role.key === 'admin')) {
      throw new BadRequestException(
        'Organisation admin access is managed by the platform and cannot be overridden',
      );
    }

    // Normalise to (module -> {column: boolean}) keeping only explicit values
    // for actions the module supports (e.g. Dashboard "add" is ignored).
    const byModule = new Map<string, Partial<Record<PermissionColumn, boolean>>>();
    for (const item of dto.permissions) {
      const columns = byModule.get(item.moduleKey) ?? {};
      for (const action of moduleActions(item.moduleKey)) {
        const column = actionToColumn(action);
        const value = item[column];
        if (typeof value === 'boolean') columns[column] = value;
      }
      byModule.set(item.moduleKey, columns);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.userModulePermission.deleteMany({ where: { orgId, userId } });

      for (const [moduleKey, columns] of byModule) {
        if (Object.keys(columns).length === 0) continue;
        await tx.userModulePermission.create({
          data: { orgId, userId, moduleKey, ...columns },
        });
      }
    });

    return this.loadUserPermissions(orgId, userId);
  }

  /** Effective permissions for the caller — enriches /auth/me. */
  async getMyPermissions(orgId: string, userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        orgId: true,
        userRoles: { select: { role: { select: { key: true, name: true } } } },
      },
    });
    if (!user || user.orgId !== orgId) {
      throw new NotFoundException('User not found');
    }

    const roleKeys = user.userRoles.map((ur) => ur.role.key);
    let effective: ReturnType<typeof computeEffectivePermissions>;
    try {
      effective = await this.resolveEffective(orgId, userId, roleKeys);
    } catch {
      effective = computeEffectivePermissions({
        roleKeys,
        rolePermissions: [],
        userOverrides: [],
      });
    }

    return {
      role: roleKeys[0] ?? null,
      roleName: user.userRoles[0]?.role.name ?? null,
      roles: roleKeys,
      permissions: toActionMap(effective.byModule),
    };
  }

  private async resolveEffective(
    orgId: string,
    userId: string,
    roleKeys: string[],
  ) {
    const [rawRolePermissions, userOverrides] = await Promise.all([
      roleKeys.length
        ? this.prisma.roleModulePermission.findMany({
            where: {
              orgId: { in: [orgId, SYSTEM_ORG_ID] },
              role: { key: { in: roleKeys } },
            },
            select: {
              orgId: true,
              role: { select: { key: true } },
              moduleKey: true,
              ...PERMISSION_COLUMN_SELECT,
            },
          })
        : Promise.resolve([]),
      this.prisma.userModulePermission.findMany({
        where: { orgId, userId },
        select: { moduleKey: true, ...PERMISSION_COLUMN_SELECT },
      }),
    ]);

    return computeEffectivePermissions({
      roleKeys,
      rolePermissions: mergeRolePermissions(rawRolePermissions),
      userOverrides,
    });
  }

  private async loadUserPermissions(orgId: string, userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, orgId },
      select: {
        id: true,
        userRoles: { select: { role: { select: { key: true, name: true } } } },
        userPermissions: {
          where: { orgId },
          select: { moduleKey: true, ...PERMISSION_COLUMN_SELECT },
        },
      },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const roleKeys = user.userRoles.map((ur) => ur.role.key);
    const effective = await this.resolveEffective(orgId, userId, roleKeys);

    return {
      userId: user.id,
      role: user.userRoles[0]
        ? { key: user.userRoles[0].role.key, name: user.userRoles[0].role.name }
        : null,
      effective: effective.byModule,
      overrides: PERMISSION_MODULES.map(
        (module) =>
          user.userPermissions.find((p) => p.moduleKey === module.key) ?? null,
      ).filter((x): x is NonNullable<typeof x> => x !== null),
    };
  }
}

/** True when two clamped permission rows grant exactly the same actions. */
function samePermissions(
  a: Record<PermissionColumn, boolean>,
  b: Record<PermissionColumn, boolean>,
) {
  return PERMISSION_ACTIONS.every((action) => {
    const column = actionToColumn(action);
    return a[column] === b[column];
  });
}

/** { moduleKey: ModulePermission } -> { moduleKey: { view, add, ... } }. */
function toActionMap(byModule: Record<string, ModulePermission>) {
  const out: Record<string, Record<PermissionAction, boolean>> = {};
  for (const module of PERMISSION_MODULES) {
    const row = byModule[module.key] ?? emptyModulePermission(module.key);
    const actions = {} as Record<PermissionAction, boolean>;
    for (const action of PERMISSION_ACTIONS) {
      actions[action] = row[actionToColumn(action)];
    }
    out[module.key] = actions;
  }
  return out;
}
