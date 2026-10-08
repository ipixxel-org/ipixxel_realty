import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { RoleScope } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { publishChatAccessChanged } from '../../common/utils/team-chat-bus';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { UpdateRolePermissionsDto } from './dto/update-role-permissions.dto';
import { CreatePlatformRoleDto } from './dto/create-platform-role.dto';
import { UpdatePlatformRolePermissionsDto } from './dto/update-platform-role-permissions.dto';
import {
  clampToModuleActions,
  defaultForRole,
  dtoToModulePermission,
  fullModulePermission,
  moduleActions,
  roleInUseMessage,
  PERMISSION_MODULES,
  PLATFORM_PERMISSION_MODULES,
  SYSTEM_ORG_ID,
  type ModuleDefinition,
  type PermissionColumn,
} from '../../common/utils/permissions.util';

const SYSTEM_ROLES = new Set(['super_admin', 'admin', 'manager', 'sales', 'telecaller']);
const ORG_SCOPES: RoleScope[] = ['organisation', 'team'];

@Injectable()
export class AdminRolesService {
  constructor(private readonly prisma: PrismaService) {}

  listOrgRoles() {
    return this.prisma.role.findMany({
      where: { orgId: null, scope: { in: ORG_SCOPES } },
      orderBy: { sortOrder: 'asc' },
      include: { _count: { select: { userRoles: true } } },
    });
  }

  listPlatformRoles() {
    return this.prisma.role.findMany({
      where: { orgId: null, scope: 'platform' },
      orderBy: { sortOrder: 'asc' },
      include: { _count: { select: { userRoles: true } } },
    });
  }

  createOrgRole(dto: CreateRoleDto) {
    return this.createRole(dto, 'organisation');
  }

  createPlatformRole(dto: CreatePlatformRoleDto) {
    return this.createRole(dto, 'platform');
  }

  updateOrgRole(id: string, dto: UpdateRoleDto) {
    return this.updateRole(id, dto, ORG_SCOPES);
  }

  async updatePlatformRole(id: string, dto: UpdateRoleDto) {
    // Super Admin is the built-in full-access role: its name, description and
    // status are fixed (its key and permissions are already locked below).
    // The console hides Edit for it; this stops a direct API call too.
    const role = await this.requireRole(id, ['platform']);
    if (role.key === 'super_admin') {
      throw new BadRequestException(`${role.name} role cannot be edited`);
    }
    return this.updateRole(id, dto, ['platform']);
  }

  removeOrgRole(id: string) {
    return this.removeRole(id, ORG_SCOPES);
  }

  removePlatformRole(id: string) {
    return this.removeRole(id, ['platform']);
  }

  getOrgRolePermissions(roleId: string) {
    return this.getRolePermissions(roleId, ORG_SCOPES, PERMISSION_MODULES, ['super_admin'], ['admin']);
  }

  getPlatformRolePermissions(roleId: string) {
    return this.getRolePermissions(roleId, ['platform'], PLATFORM_PERMISSION_MODULES, ['super_admin']);
  }

  updateOrgRolePermissions(roleId: string, dto: UpdateRolePermissionsDto) {
    return this.saveRolePermissions(
      roleId,
      ORG_SCOPES,
      PERMISSION_MODULES,
      dto.permissions,
      ['super_admin'],
    );
  }

  updatePlatformRolePermissions(roleId: string, dto: UpdatePlatformRolePermissionsDto) {
    return this.saveRolePermissions(
      roleId,
      ['platform'],
      PLATFORM_PERMISSION_MODULES,
      dto.permissions,
      ['super_admin'],
    );
  }

  async effectivePlatformPermissions(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        orgId: true,
        userRoles: { select: { role: { select: { id: true, key: true, name: true, scope: true } } } },
      },
    });
    if (!user || user.orgId !== null) {
      throw new NotFoundException('Platform user not found');
    }

    const platformRoles = user.userRoles
      .map((ur) => ur.role)
      .filter((r) => r.scope === 'platform');
    const keys = platformRoles.map((r) => r.key);
    const unrestricted = keys.includes('super_admin');

    const rows = unrestricted
      ? []
      : await this.prisma.roleModulePermission.findMany({
          where: {
            orgId: SYSTEM_ORG_ID,
            roleId: { in: platformRoles.map((r) => r.id) },
          },
        });

    const byModule = new Map<string, {
      canView: boolean;
      canAdd: boolean;
      canEdit: boolean;
      canDelete: boolean;
      canApprove: boolean;
    }>();

    for (const row of rows) {
      const current = byModule.get(row.moduleKey);
      if (!current) {
        byModule.set(row.moduleKey, {
          canView: row.canView,
          canAdd: row.canAdd,
          canEdit: row.canEdit,
          canDelete: row.canDelete,
          canApprove: row.canApprove,
        });
      } else {
        byModule.set(row.moduleKey, {
          canView: current.canView || row.canView,
          canAdd: current.canAdd || row.canAdd,
          canEdit: current.canEdit || row.canEdit,
          canDelete: current.canDelete || row.canDelete,
          canApprove: current.canApprove || row.canApprove,
        });
      }
    }

    const permissions: Record<string, {
      view?: boolean;
      add?: boolean;
      edit?: boolean;
      delete?: boolean;
      approve?: boolean;
    }> = {};

    for (const def of PLATFORM_PERMISSION_MODULES) {
      if (unrestricted) {
        permissions[def.key] = { view: true, add: true, edit: true, delete: true, approve: true };
        continue;
      }
      const row = byModule.get(def.key);
      permissions[def.key] = {
        view: row?.canView ?? false,
        add: row?.canAdd ?? false,
        edit: row?.canEdit ?? false,
        delete: row?.canDelete ?? false,
        approve: row?.canApprove ?? false,
      };
    }

    return {
      unrestricted,
      roles: platformRoles.map((r) => ({ key: r.key, name: r.name })),
      permissions,
    };
  }

  private async createRole(
    dto: { name: string; key?: string; description?: string },
    scope: 'organisation' | 'platform',
  ) {
    const rawKey = dto.key
      ? dto.key.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_')
      : dto.name.trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_');

    if (SYSTEM_ROLES.has(rawKey)) {
      throw new ConflictException(`Role key '${rawKey}' is reserved`);
    }

    const existing = await this.prisma.role.findFirst({
      where: { orgId: null, key: rawKey },
    });
    if (existing) {
      throw new ConflictException(`Role key '${rawKey}' already exists`);
    }

    const count = await this.prisma.role.count({
      where: { orgId: null, scope },
    });

    return this.prisma.role.create({
      data: {
        key: rawKey,
        name: dto.name,
        description: dto.description ?? '',
        scope,
        status: 'active',
        sortOrder: count + 1,
      },
    });
  }

  private async updateRole(id: string, dto: UpdateRoleDto, allowed: RoleScope[]) {
    const role = await this.requireRole(id, allowed);

    const rawKey = dto.key
      ? dto.key.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_')
      : undefined;

    if (rawKey !== undefined && rawKey !== role.key) {
      if (SYSTEM_ROLES.has(role.key)) {
        throw new BadRequestException(`System role '${role.name}' key cannot be changed`);
      }
      const existing = await this.prisma.role.findFirst({
        where: { orgId: null, key: rawKey },
      });
      if (existing) {
        throw new ConflictException(`Role key '${rawKey}' already exists`);
      }
    }

    // A role still assigned to users can't be switched off — it would leave
    // those users with a role that no longer applies.
    if (dto.status === 'inactive' && role.status !== 'inactive') {
      const assigned = await this.prisma.userRole.count({ where: { roleId: id } });
      if (assigned > 0) {
        throw new BadRequestException(roleInUseMessage(role.name, assigned, 'make it inactive'));
      }
    }

    return this.prisma.role.update({
      where: { id },
      data: {
        ...(dto.name ? { name: dto.name } : {}),
        ...(rawKey !== undefined ? { key: rawKey } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.status ? { status: dto.status } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
      },
    });
  }

  private async removeRole(id: string, allowed: RoleScope[]) {
    const role = await this.prisma.role.findUnique({
      where: { id },
      include: { _count: { select: { userRoles: true } } },
    });
    if (!role || !allowed.includes(role.scope)) {
      throw new NotFoundException('Role not found');
    }
    if (SYSTEM_ROLES.has(role.key)) {
      throw new BadRequestException(`System role '${role.name}' cannot be deleted`);
    }
    if (role._count.userRoles > 0) {
      throw new BadRequestException(
        roleInUseMessage(role.name, role._count.userRoles, 'delete it'),
      );
    }
    await this.prisma.role.delete({ where: { id } });
    return { success: true };
  }

  private async getRolePermissions(
    roleId: string,
    allowed: RoleScope[],
    catalog: ModuleDefinition[],
    unrestrictedKeys: string[],
    unrestrictedFallbackKeys: string[] = [],
  ) {
    const role = await this.prisma.role.findUnique({
      where: { id: roleId },
      select: {
        id: true,
        name: true,
        key: true,
        description: true,
        scope: true,
        status: true,
      },
    });
    if (!role || !allowed.includes(role.scope)) {
      throw new NotFoundException('Role not found');
    }

    const systemRows = await this.prisma.roleModulePermission.findMany({
      where: { orgId: SYSTEM_ORG_ID, roleId },
    });

    const isUnrestricted = unrestrictedKeys.includes(role.key);
    // Roles (org Admin) that have full access to any module Super Admin
    // hasn't saved a row for — same rule computeEffectivePermissions applies.
    const fullByDefault = unrestrictedFallbackKeys.includes(role.key);
    const rowMap = new Map(systemRows.map((r) => [r.moduleKey, r]));

    const permissions = catalog.map((def) => {
      const meta = {
        label: def.label,
        description: def.description,
        actions: [...moduleActions(def.key)],
        actionLabels: def.actionLabels ?? {},
      };

      // Unrestricted role, else the Super Admin's saved row, else the
      // built-in default — always limited to the actions the module supports.
      const saved = rowMap.get(def.key);
      const row =
        isUnrestricted || (!saved && fullByDefault)
          ? fullModulePermission(def.key)
          : dtoToModulePermission(
              def.key,
              saved ?? defaultForRole(role.key, def.key),
            );
      return { ...meta, ...clampToModuleActions(row) };
    });

    return { role, modules: catalog, permissions };
  }

  private async saveRolePermissions(
    roleId: string,
    allowed: RoleScope[],
    catalog: ModuleDefinition[],
    permissions: Array<
      { moduleKey: string } & Partial<Record<PermissionColumn, boolean>>
    >,
    unrestrictedKeys: string[],
  ) {
    const role = await this.requireRole(roleId, allowed);
    if (unrestrictedKeys.includes(role.key)) {
      throw new BadRequestException(`${role.name} permissions cannot be changed`);
    }

    const validModuleKeys = new Set(catalog.map((m) => m.key));
    const validPermissions = permissions.filter((p) => validModuleKeys.has(p.moduleKey));

    await this.prisma.$transaction(async (tx) => {
      await tx.roleModulePermission.deleteMany({
        where: {
          orgId: SYSTEM_ORG_ID,
          roleId,
          moduleKey: { in: [...validModuleKeys] },
        },
      });

      if (validPermissions.length > 0) {
        await tx.roleModulePermission.createMany({
          data: validPermissions.map((p) => ({
            orgId: SYSTEM_ORG_ID,
            roleId,
            ...clampToModuleActions(dtoToModulePermission(p.moduleKey, p)),
          })),
        });
      }
    });
    // System defaults apply to every org: re-check all chat connections.
    publishChatAccessChanged();

    return allowed.includes('platform')
      ? this.getPlatformRolePermissions(roleId)
      : this.getOrgRolePermissions(roleId);
  }

  private async requireRole(id: string, allowed: RoleScope[]) {
    const role = await this.prisma.role.findUnique({ where: { id } });
    if (!role || !allowed.includes(role.scope)) {
      throw new NotFoundException('Role not found');
    }
    return role;
  }
}
