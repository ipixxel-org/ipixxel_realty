import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Request } from 'express';
import { PrismaService } from '../../database/prisma.service';
import { JwtPayload } from '../types/jwt-payload.interface';
import { USER_INACTIVE_ERROR } from './org-approved.guard';
import {
  PLATFORM_PERMISSION_MODULES,
  SYSTEM_ORG_ID,
  actionFromHttpMethod,
  platformModuleForPath,
} from '../utils/permissions.util';

function userInactive(message: string): ForbiddenException {
  return new ForbiddenException({
    statusCode: 403,
    error: USER_INACTIVE_ERROR,
    message,
  });
}

const ACCOUNT_REVOKED_MESSAGE =
  'Your account access has been revoked. Please contact your administrator.';

@Injectable()
export class SuperAdminGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user: JwtPayload }>();

    const actor = request.user;
    const roleKeys = actor?.roles ?? [];
    if (!actor?.sub) {
      throw new ForbiddenException('Super Admin access required');
    }

    // Account-status gate for the Platform Team — the console-side counterpart
    // of OrgApprovedGuard's per-request user check. Reads status fresh from the
    // DB on every request (never from the JWT) so a Super Admin disabling a
    // Platform Team member takes effect on that member's very next call:
    //   - account gone / disabled  -> USER_INACTIVE (frontend force-logout to
    //     /admin-login with the "access revoked" notice).
    //   - access token predates a tokenInvalidBefore stamp (disable, admin
    //     password reset, forced session invalidation) -> USER_INACTIVE, so a
    //     still-valid access JWT cannot outlive the disable, and re-enabling an
    //     account never silently resurrects a pre-disable session.
    //   - first-login password change still pending -> plain 403 (NOT
    //     USER_INACTIVE); the frontend shell routes them to /change-password
    //     rather than ending the session.
    const account = await this.prisma.user.findUnique({
      where: { id: actor.sub },
      select: { status: true, tokenInvalidBefore: true, mustChangePassword: true },
    });
    if (!account || account.status === 'disabled') {
      throw userInactive(ACCOUNT_REVOKED_MESSAGE);
    }
    const iatMs = actor.iat ? actor.iat * 1000 : null;
    if (
      account.tokenInvalidBefore &&
      iatMs !== null &&
      iatMs < account.tokenInvalidBefore.getTime()
    ) {
      throw userInactive('Your session has ended. Please sign in again.');
    }
    if (account.mustChangePassword) {
      throw new ForbiddenException(
        'Password change required before accessing the console',
      );
    }

    if (roleKeys.includes('super_admin')) {
      return true;
    }

    const platformRoles = await this.prisma.role.findMany({
      where: {
        orgId: null,
        scope: 'platform',
        status: 'active',
        key: { in: roleKeys },
      },
      select: { id: true, key: true },
    });

    if (actor.orgId !== null || platformRoles.length === 0) {
      throw new ForbiddenException('Super Admin access required');
    }

    const path = request.path || request.url.split('?')[0];
    if (path === '/admin/platform-roles/me') {
      return true;
    }
    if (
      request.method === 'GET' &&
      (path === '/admin/notifications' || path.startsWith('/admin/notifications/'))
    ) {
      return true;
    }

    const moduleKey = platformModuleForPath(path);
    if (!moduleKey) {
      // /admin/integrations performs its own per-integration permission
      // checks (each card has a distinct permission). Every other unmapped
      // admin route is denied rather than silently allowed.
      if (path === '/admin/integrations' || path.startsWith('/admin/integrations/')) {
        return true;
      }
      throw new ForbiddenException(
        'This admin area is not available for your role',
      );
    }

    // Organisation template assignment is one endpoint for both adding and
    // removing templates. Check the dedicated nested permissions separately
    // so Add template and Remove remain independently configurable under the
    // Organisations row in the platform role matrix.
    const templateAssignmentMatch = path.match(/^\/admin\/organisations\/([^/]+)\/templates$/);
    if (templateAssignmentMatch && request.method === 'PUT') {
      const requestedIds = new Set<string>(
        Array.isArray(request.body?.templateIds) ? request.body.templateIds : [],
      );
      const currentRows = await this.prisma.organisationTemplate.findMany({
        where: { orgId: templateAssignmentMatch[1] },
        select: { templateId: true },
      });
      const currentIds = new Set(currentRows.map((row) => row.templateId));
      const hasAdditions = [...requestedIds].some((id) => !currentIds.has(id));
      const hasRemovals = [...currentIds].some((id) => !requestedIds.has(id));
      const requiredPermissions: Array<{ moduleKey: string; action: 'add' | 'delete' }> = [];
      if (hasAdditions) requiredPermissions.push({ moduleKey: 'admin_org_templates_add', action: 'add' });
      if (hasRemovals) requiredPermissions.push({ moduleKey: 'admin_org_templates_remove', action: 'delete' });

      if (requiredPermissions.length > 0) {
        const permissionRows = await this.prisma.roleModulePermission.findMany({
          where: {
            orgId: SYSTEM_ORG_ID,
            roleId: { in: platformRoles.map((role) => role.id) },
            moduleKey: { in: requiredPermissions.map((permission) => permission.moduleKey) },
          },
        });
        const allowed = requiredPermissions.every((required) =>
          permissionRows.some((row) =>
            row.moduleKey === required.moduleKey &&
            (required.action === 'add' ? row.canAdd : row.canDelete),
          ),
        );
        if (!allowed) {
          const missing = requiredPermissions.find((required) =>
            !permissionRows.some((row) =>
              row.moduleKey === required.moduleKey &&
              (required.action === 'add' ? row.canAdd : row.canDelete),
            ),
          );
          throw new ForbiddenException(
            `Missing platform permission: ${missing?.moduleKey}:${missing?.action}`,
          );
        }
        return true;
      }
    }

    // Platform Team members are disabled/re-enabled via the same PATCH route
    // used to edit their profile, distinguished only by the request body
    // containing solely `status` — the console UI never sends it alongside a
    // profile edit. Route that case to `approve` (the module's "Disable" pill)
    // instead of `edit`, so the two console actions can be granted separately.
    const isPlatformTeamStatusOnlyUpdate =
      request.method === 'PATCH' &&
      /^\/admin\/platform-team\/[^/]+$/.test(path) &&
      !!request.body &&
      Object.keys(request.body).length > 0 &&
      Object.keys(request.body).every((key) => key === 'status');

    const action =
      request.method === 'PATCH' && /\/admin\/organisations\/[^/]+\/status$/.test(path)
        ? request.body?.status === 'disabled' ? 'approve' : 'add'
        : isPlatformTeamStatusOnlyUpdate
        ? 'approve'
        : /^\/admin\/package-change-requests\/[^/]+\/approve$/.test(path)
        ? 'approve'
        : /^\/admin\/package-change-requests\/[^/]+\/reject$/.test(path)
        ? 'delete'
        : actionFromHttpMethod(request.method);
    const rows = await this.prisma.roleModulePermission.findMany({
      where: {
        orgId: SYSTEM_ORG_ID,
        roleId: { in: platformRoles.map((r) => r.id) },
        moduleKey,
      },
    });

    const granted = rows.some((row) => {
      if (action === 'view') return row.canView;
      if (action === 'add') return row.canAdd;
      if (action === 'edit') return row.canEdit;
      if (action === 'delete') return row.canDelete;
      return row.canApprove;
    });

    if (granted) {
      return true;
    }

    const known = PLATFORM_PERMISSION_MODULES.some((m) => m.key === moduleKey);
    if (!known) {
      throw new ForbiddenException(
        `Unknown platform permission module: ${moduleKey}`,
      );
    }

    throw new ForbiddenException(
      `Missing platform permission: ${moduleKey}:${action}`,
    );
  }
}
