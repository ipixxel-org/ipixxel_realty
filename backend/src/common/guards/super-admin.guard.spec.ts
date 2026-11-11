import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { SuperAdminGuard } from './super-admin.guard';
import { USER_INACTIVE_ERROR } from './org-approved.guard';

function ctx(
  user: unknown,
  over: { method?: string; path?: string; body?: Record<string, unknown> } = {},
): ExecutionContext {
  const path = over.path ?? '/admin/platform-team';
  const req = {
    user,
    method: over.method ?? 'GET',
    path,
    url: path,
    body: over.body,
  };
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

function makeGuard(
  account: Record<string, unknown> | null,
  opts: {
    platformRoles?: Array<{ id: string; key: string }>;
    grantRows?: Array<Record<string, unknown>>;
  } = {},
) {
  const prisma: any = {
    user: { findUnique: jest.fn().mockResolvedValue(account) },
    role: { findMany: jest.fn().mockResolvedValue(opts.platformRoles ?? []) },
    roleModulePermission: { findMany: jest.fn().mockResolvedValue(opts.grantRows ?? []) },
  };
  return { guard: new SuperAdminGuard(prisma), prisma };
}

const activeSuperAdmin = {
  status: 'active',
  tokenInvalidBefore: null,
  mustChangePassword: false,
};

describe('SuperAdminGuard — Platform Team account-status gate', () => {
  const jwt = (over: Record<string, unknown> = {}) => ({
    sub: 'u1',
    orgId: null,
    roles: ['super_admin'],
    iat: Math.floor(Date.now() / 1000),
    ...over,
  });

  it('allows an active platform Super Admin', async () => {
    const { guard } = makeGuard(activeSuperAdmin);
    await expect(guard.canActivate(ctx(jwt()))).resolves.toBe(true);
  });

  it('rejects a disabled member with a USER_INACTIVE tag', async () => {
    const { guard } = makeGuard({ ...activeSuperAdmin, status: 'disabled' });
    await expect(guard.canActivate(ctx(jwt()))).rejects.toMatchObject({
      response: { error: USER_INACTIVE_ERROR },
    });
  });

  it('rejects when the account no longer exists', async () => {
    const { guard } = makeGuard(null);
    await expect(guard.canActivate(ctx(jwt()))).rejects.toMatchObject({
      response: { error: USER_INACTIVE_ERROR },
    });
  });

  it('rejects an access token issued before tokenInvalidBefore', async () => {
    const { guard } = makeGuard({
      ...activeSuperAdmin,
      tokenInvalidBefore: new Date(Date.now() + 60_000),
    });
    await expect(
      guard.canActivate(ctx(jwt({ iat: Math.floor(Date.now() / 1000) - 30 }))),
    ).rejects.toMatchObject({ response: { error: USER_INACTIVE_ERROR } });
  });

  it('blocks a member who still has a pending first-login password change (plain 403)', async () => {
    const { guard } = makeGuard({ ...activeSuperAdmin, mustChangePassword: true });
    await expect(guard.canActivate(ctx(jwt()))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(guard.canActivate(ctx(jwt()))).rejects.not.toMatchObject({
      response: { error: USER_INACTIVE_ERROR },
    });
  });
});

describe('SuperAdminGuard — Platform Team PATCH: edit vs disable', () => {
  const jwt = (over: Record<string, unknown> = {}) => ({
    sub: 'u1',
    orgId: null,
    roles: ['platform_operator'],
    iat: Math.floor(Date.now() / 1000),
    ...over,
  });
  const platformRoles = [{ id: 'r1', key: 'platform_operator' }];

  it('requires the "approve" (Disable) grant for a status-only PATCH body', async () => {
    const { guard, prisma } = makeGuard(activeSuperAdmin, {
      platformRoles,
      grantRows: [{ canView: true, canAdd: false, canEdit: true, canDelete: false, canApprove: false }],
    });
    await expect(
      guard.canActivate(
        ctx(jwt(), { method: 'PATCH', path: '/admin/platform-team/m1', body: { status: 'disabled' } }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.roleModulePermission.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ moduleKey: 'admin_platform_team' }) }),
    );
  });

  it('allows a status-only PATCH when only "approve" (Disable) is granted, without requiring edit', async () => {
    const { guard } = makeGuard(activeSuperAdmin, {
      platformRoles,
      grantRows: [{ canView: true, canAdd: false, canEdit: false, canDelete: false, canApprove: true }],
    });
    await expect(
      guard.canActivate(
        ctx(jwt(), { method: 'PATCH', path: '/admin/platform-team/m1', body: { status: 'active' } }),
      ),
    ).resolves.toBe(true);
  });

  it('requires "edit" (not "approve") for a profile PATCH even if it happens to include other fields', async () => {
    const { guard } = makeGuard(activeSuperAdmin, {
      platformRoles,
      grantRows: [{ canView: true, canAdd: false, canEdit: false, canDelete: false, canApprove: true }],
    });
    await expect(
      guard.canActivate(
        ctx(jwt(), {
          method: 'PATCH',
          path: '/admin/platform-team/m1',
          body: { firstName: 'New', status: 'disabled' },
        }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows a profile PATCH when "edit" is granted', async () => {
    const { guard } = makeGuard(activeSuperAdmin, {
      platformRoles,
      grantRows: [{ canView: true, canAdd: false, canEdit: true, canDelete: false, canApprove: false }],
    });
    await expect(
      guard.canActivate(
        ctx(jwt(), { method: 'PATCH', path: '/admin/platform-team/m1', body: { firstName: 'New' } }),
      ),
    ).resolves.toBe(true);
  });
});

describe('SuperAdminGuard — Platform roles routes share the Platform Team module', () => {
  const jwt = (over: Record<string, unknown> = {}) => ({
    sub: 'u1',
    orgId: null,
    roles: ['platform_operator'],
    iat: Math.floor(Date.now() / 1000),
    ...over,
  });
  const platformRoles = [{ id: 'r1', key: 'platform_operator' }];

  it('checks admin_platform_team (not a separate admin_platform_roles module) for GET /admin/platform-roles', async () => {
    const { guard, prisma } = makeGuard(activeSuperAdmin, {
      platformRoles,
      grantRows: [{ canView: true, canAdd: false, canEdit: false, canDelete: false, canApprove: false }],
    });
    await expect(
      guard.canActivate(ctx(jwt(), { method: 'GET', path: '/admin/platform-roles' })),
    ).resolves.toBe(true);
    expect(prisma.roleModulePermission.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ moduleKey: 'admin_platform_team' }) }),
    );
  });

  it('requires admin_platform_team:edit to save a role\'s permission matrix (PUT /admin/platform-roles/:id/permissions)', async () => {
    const { guard } = makeGuard(activeSuperAdmin, {
      platformRoles,
      grantRows: [{ canView: true, canAdd: false, canEdit: false, canDelete: false, canApprove: false }],
    });
    await expect(
      guard.canActivate(
        ctx(jwt(), { method: 'PUT', path: '/admin/platform-roles/role1/permissions', body: { permissions: [] } }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('requires admin_platform_team:delete to delete a platform role (DELETE /admin/platform-roles/:id)', async () => {
    const { guard } = makeGuard(activeSuperAdmin, {
      platformRoles,
      grantRows: [{ canView: true, canAdd: false, canEdit: true, canDelete: false, canApprove: false }],
    });
    await expect(
      guard.canActivate(ctx(jwt(), { method: 'DELETE', path: '/admin/platform-roles/role1' })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('SuperAdminGuard — Templates pills', () => {
  const jwt = () => ({
    sub: 'u1',
    orgId: null,
    roles: ['platform_operator'],
    iat: Math.floor(Date.now() / 1000),
  });
  const platformRoles = [{ id: 'r1', key: 'platform_operator' }];
  const row = (moduleKey: string, grants: Record<string, boolean>) => ({
    moduleKey,
    canView: true,
    canAdd: false,
    canEdit: false,
    canDelete: false,
    canApprove: false,
    ...grants,
  });
  function guardWith(rows: Array<Record<string, unknown>>, currentStatus = 'draft') {
    const { guard, prisma } = makeGuard(activeSuperAdmin, { platformRoles, grantRows: rows });
    prisma.template = { findUnique: jest.fn().mockResolvedValue({ status: currentStatus }) };
    return guard;
  }
  const run = (guard: SuperAdminGuard, method: string, path: string, body?: Record<string, unknown>) =>
    guard.canActivate(ctx(jwt(), { method, path, body }));

  it('Publish: a status-only PATCH to published needs Publish, not Edit', async () => {
    await expect(
      run(guardWith([row('admin_templates', { canEdit: true })]), 'PATCH', '/admin/templates/t1', { status: 'published' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      run(guardWith([row('admin_templates', { canApprove: true })]), 'PATCH', '/admin/templates/t1', { status: 'published' }),
    ).resolves.toBe(true);
  });

  it('Publish: a status-only Unpublish needs Publish', async () => {
    await expect(
      run(guardWith([row('admin_templates', { canEdit: true })], 'published'), 'PATCH', '/admin/templates/t1', { status: 'draft' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('Publish: a builder save that goes live needs both Edit and Publish', async () => {
    const body = { name: 'X', status: 'published', content: {} };
    await expect(
      run(guardWith([row('admin_templates', { canEdit: true })]), 'PATCH', '/admin/templates/t1', body),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      run(guardWith([row('admin_templates', { canEdit: true, canApprove: true })]), 'PATCH', '/admin/templates/t1', body),
    ).resolves.toBe(true);
  });

  it('Edit: a builder autosave that moves a live template back to draft only needs Edit', async () => {
    await expect(
      run(
        guardWith([row('admin_templates', { canEdit: true })], 'published'),
        'PATCH',
        '/admin/templates/t1',
        { name: 'X', status: 'draft', content: {} },
      ),
    ).resolves.toBe(true);
  });

  it('Manage Settings: can save settings without Edit, but not change the status', async () => {
    const settings = [row('admin_templates_settings', { canEdit: true })];
    await expect(
      run(guardWith(settings, 'published'), 'PATCH', '/admin/templates/t1', { name: 'X', status: 'published' }),
    ).resolves.toBe(true);
    await expect(
      run(guardWith(settings, 'draft'), 'PATCH', '/admin/templates/t1', { name: 'X', status: 'published' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('View only: cannot save', async () => {
    await expect(
      run(guardWith([row('admin_templates', {})]), 'PATCH', '/admin/templates/t1', { name: 'X' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('Duplicate needs the Duplicate pill, not Create', async () => {
    await expect(
      run(guardWith([row('admin_templates', { canAdd: true })]), 'POST', '/admin/templates/t1/duplicate'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      run(guardWith([row('admin_templates_duplicate', { canAdd: true })]), 'POST', '/admin/templates/t1/duplicate'),
    ).resolves.toBe(true);
  });

  it('Reset to Preset needs the Reset to Preset pill', async () => {
    await expect(
      run(guardWith([row('admin_templates', { canAdd: true, canDelete: true })]), 'POST', '/admin/templates/t1/reset', {}),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      run(guardWith([row('admin_templates_reset', { canEdit: true })]), 'POST', '/admin/templates/t1/reset', {}),
    ).resolves.toBe(true);
  });

  it('Builder image upload needs Edit', async () => {
    await expect(
      run(guardWith([row('admin_templates', { canAdd: true })]), 'POST', '/admin/templates/t1/upload-url', {}),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      run(guardWith([row('admin_templates', { canEdit: true })]), 'POST', '/admin/templates/t1/upload-url', {}),
    ).resolves.toBe(true);
  });

  it('Categories: writes need the Categories pill, reading stays under View', async () => {
    const viewOnly = [row('admin_templates', {})];
    await expect(run(guardWith(viewOnly), 'GET', '/admin/template-categories')).resolves.toBe(true);
    await expect(
      run(guardWith(viewOnly), 'POST', '/admin/template-categories', { name: 'A' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    const cats = [row('admin_templates_categories', { canEdit: true })];
    await expect(run(guardWith(cats), 'POST', '/admin/template-categories', { name: 'A' })).resolves.toBe(true);
    await expect(run(guardWith(cats), 'PATCH', '/admin/template-categories/c1', { name: 'B' })).resolves.toBe(true);
    await expect(run(guardWith(cats), 'DELETE', '/admin/template-categories/c1')).resolves.toBe(true);
  });

  it('Create and Delete keep using the Templates row', async () => {
    await expect(
      run(guardWith([row('admin_templates', { canAdd: true })]), 'POST', '/admin/templates', { name: 'A' }),
    ).resolves.toBe(true);
    await expect(
      run(guardWith([row('admin_templates', { canDelete: true })]), 'DELETE', '/admin/templates/t1'),
    ).resolves.toBe(true);
  });
});
