import {
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OrgApprovedGuard } from '../../common/guards/org-approved.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import type { JwtPayload } from '../../common/types/jwt-payload.interface';
import { PageRevisionsService } from './page-revisions.service';

// Same org-scoping contract as OrgLandingPagesController: orgId always
// derives from the JWT, and each route is held to what Super Admin granted
// the org Admin role (`enforceForOrgAdmin`).
const ENFORCE = { enforceForOrgAdmin: true } as const;

@UseGuards(JwtAuthGuard, OrgApprovedGuard, PermissionGuard)
@Controller('org/landing-pages/:id/revisions')
export class PageRevisionsController {
  constructor(private readonly service: PageRevisionsService) {}

  @RequirePermission('landing_pages', 'view', ENFORCE)
  @Get()
  list(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.service.list(user.orgId as string, id);
  }

  @RequirePermission('landing_pages', 'view', ENFORCE)
  @Get(':revId')
  get(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Param('revId') revId: string,
  ) {
    return this.service.get(user.orgId as string, id, revId);
  }

  // Restoring writes content, so it sits behind Landing Pages > Edit —
  // exactly the permission a regular content save needs.
  @RequirePermission('landing_pages', 'edit', ENFORCE)
  @Post(':revId/restore')
  @HttpCode(200)
  restore(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Param('revId') revId: string,
  ) {
    return this.service.restore(user.orgId as string, id, revId);
  }
}
