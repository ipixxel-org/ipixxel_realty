import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Request } from 'express';
import { PrismaService } from '../../database/prisma.service';
import { JwtPayload } from '../types/jwt-payload.interface';

/**
 * Billing v2 "choose what stays": a project made view-only because the
 * organisation moved to a smaller plan can be opened but not changed (its
 * details, unit types, units, sales agents). Deleting it is still allowed —
 * that's one way to make room. Reads the project from `:projectId` or `:id`.
 * Use after JwtAuthGuard / OrgApprovedGuard on the project's edit routes.
 */
@Injectable()
export class ProjectEditableGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context
      .switchToHttp()
      .getRequest<Request & { user?: JwtPayload }>();
    const raw = req.params?.projectId ?? req.params?.id;
    const projectId = Array.isArray(raw) ? raw[0] : raw;
    if (!projectId || !req.user?.orgId) return true;
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, orgId: req.user.orgId },
      select: { billingViewOnlyAt: true },
    });
    if (project?.billingViewOnlyAt) {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'project_view_only',
        message:
          'This project is view-only on your current plan. Upgrade, or choose it in Billing → Choose what stays, to edit it again.',
      });
    }
    return true;
  }
}
