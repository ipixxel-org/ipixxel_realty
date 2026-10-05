import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { OrgPermissionsService } from './org-permissions.service';
import type { JwtPayload } from '../../common/types/jwt-payload.interface';
import type { UpdateRolePermissionsDto } from './dto/update-role-permissions.dto';

const ROLES = [
  { id: 'r-admin', key: 'admin', name: 'Admin', scope: 'organisation', sortOrder: 1, orgId: null },
  { id: 'r-manager', key: 'manager', name: 'Manager', scope: 'organisation', sortOrder: 2, orgId: null },
  { id: 'r-sales', key: 'sales', name: 'Sales', scope: 'organisation', sortOrder: 3, orgId: null },
];

function row(moduleKey: string, grants: Partial<Record<string, boolean>> = {}) {
  return {
    moduleKey,
    canView: false,
    canAdd: false,
    canEdit: false,
    canDelete: false,
    canApprove: false,
    canActivate: false,
    canDeactivate: false,
    ...grants,
  };
}

function dto(...permissions: ReturnType<typeof row>[]): UpdateRolePermissionsDto {
  return { permissions } as UpdateRolePermissionsDto;
}

/** Actor with the given role; no saved permission rows (role defaults apply). */
function makeService(actorRole: string) {
  const prisma: any = {
    role: {
      findFirst: jest.fn(({ where }: { where: { key: string } }) =>
        Promise.resolve(ROLES.find((r) => r.key === where.key) ?? null),
      ),
      findMany: jest.fn().mockResolvedValue(ROLES),
    },
    user: {
      findFirst: jest.fn().mockResolvedValue({
        userRoles: [{ role: { key: actorRole } }],
      }),
    },
    roleModulePermission: {
      findMany: jest.fn().mockResolvedValue([]),
      upsert: jest.fn(),
      deleteMany: jest.fn(),
    },
    userModulePermission: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn().mockResolvedValue(undefined),
  };
  return { service: new OrgPermissionsService(prisma), prisma };
}

const actor = (role: string): JwtPayload => ({ sub: 'u1', orgId: 'org1', roles: [role] });

describe('OrgPermissionsService.updateRole safety rules', () => {
  it('never lets anyone change the Admin role here', async () => {
    const { service } = makeService('admin');
    await expect(
      service.updateRole('org1', actor('admin'), 'admin', dto(row('crm', { canView: true }))),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('blocks a member from changing a role they hold', async () => {
    const { service, prisma } = makeService('manager');
    await expect(
      service.updateRole('org1', actor('manager'), 'manager', dto(row('crm', { canView: true }))),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('blocks a member from granting an action they lack', async () => {
    const { service, prisma } = makeService('manager');
    // Manager defaults have Landing Pages view only — not Publish.
    await expect(
      service.updateRole(
        'org1',
        actor('manager'),
        'sales',
        dto(row('landing_pages', { canView: true, canActivate: true })),
      ),
    ).rejects.toThrow(/Landing Pages › Publish/);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('lets a member grant actions they hold themselves', async () => {
    const { service, prisma } = makeService('manager');
    await service.updateRole(
      'org1',
      actor('manager'),
      'sales',
      dto(row('crm', { canView: true, canAdd: true, canEdit: true })),
    );
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('exempts the org admin (Super Admin governs their access)', async () => {
    const { service, prisma } = makeService('admin');
    await service.updateRole(
      'org1',
      actor('admin'),
      'sales',
      dto(row('landing_pages', { canView: true, canActivate: true })),
    );
    expect(prisma.$transaction).toHaveBeenCalled();
  });
});

describe('OrgPermissionsService.updateRole inherits Super Admin defaults', () => {
  /** Org admin actor; `systemRows` are the Super Admin's saved rows. */
  function makeSavingService(systemRows: ReturnType<typeof row>[]) {
    const { service, prisma } = makeService('admin');
    prisma.roleModulePermission.findMany.mockImplementation(
      ({ where }: { where: { orgId: unknown } }) =>
        Promise.resolve(where.orgId === 'system' ? systemRows : []),
    );
    prisma.$transaction.mockImplementation((fn: (tx: any) => unknown) => fn(prisma));
    return { service, prisma };
  }

  it('stores only modules that differ from the Super Admin default', async () => {
    const { service, prisma } = makeSavingService([
      row('crm', { canView: true, canAdd: true }),
      row('reports', { canView: true }),
    ]);
    await service.updateRole(
      'org1',
      actor('admin'),
      'sales',
      dto(
        row('crm', { canView: true, canAdd: true }), // same as Super Admin
        row('reports', { canView: false }), // org turned it off
      ),
    );
    expect(prisma.roleModulePermission.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.roleModulePermission.upsert.mock.calls[0][0].create.moduleKey).toBe('reports');
    expect(prisma.roleModulePermission.deleteMany).toHaveBeenCalledWith({
      where: { orgId: 'org1', roleId: 'r-sales', moduleKey: { notIn: ['reports'] } },
    });
  });

  it('falls back to the built-in default when Super Admin saved nothing', async () => {
    const { service, prisma } = makeSavingService([]);
    // Built-in sales default for Dashboard is view only.
    await service.updateRole(
      'org1',
      actor('admin'),
      'sales',
      dto(row('dashboard', { canView: true })),
    );
    expect(prisma.roleModulePermission.upsert).not.toHaveBeenCalled();
    expect(prisma.roleModulePermission.deleteMany).toHaveBeenCalledWith({
      where: { orgId: 'org1', roleId: 'r-sales', moduleKey: { notIn: [] } },
    });
  });
});

describe('OrgPermissionsService custom roles in use', () => {
  function makeRoleService(assigned: number) {
    const role = { id: 'r-custom', orgId: 'org1', name: 'salesman', status: 'active' };
    const prisma: any = {
      role: {
        findFirst: jest.fn().mockResolvedValue({ ...role, _count: { userRoles: assigned } }),
        update: jest.fn().mockResolvedValue(role),
        delete: jest.fn().mockResolvedValue(role),
      },
      userRole: { count: jest.fn().mockResolvedValue(assigned) },
    };
    return { service: new OrgPermissionsService(prisma), prisma };
  }

  it('refuses to delete a role that still has users', async () => {
    const { service, prisma } = makeRoleService(2);
    await expect(service.removeOrgRole('org1', 'r-custom')).rejects.toThrow(
      /assigned to 2 users/,
    );
    expect(prisma.role.delete).not.toHaveBeenCalled();
  });

  it('refuses to make a role inactive while it has users', async () => {
    const { service, prisma } = makeRoleService(1);
    await expect(
      service.updateOrgRole('org1', 'r-custom', { status: 'inactive' }),
    ).rejects.toThrow(/assigned to 1 user\./);
    expect(prisma.role.update).not.toHaveBeenCalled();
  });

  it('deletes or deactivates a role with no users', async () => {
    const { service, prisma } = makeRoleService(0);
    await service.updateOrgRole('org1', 'r-custom', { status: 'inactive' });
    await service.removeOrgRole('org1', 'r-custom');
    expect(prisma.role.update).toHaveBeenCalled();
    expect(prisma.role.delete).toHaveBeenCalled();
  });
});
