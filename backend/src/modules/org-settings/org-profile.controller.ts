import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OrgApprovedGuard } from '../../common/guards/org-approved.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { SETTINGS_ACTIONS } from '../../common/utils/permissions.util';
import { getOwnProfile, updateOwnProfile } from '../../common/utils/org-users.util';
import type { JwtPayload } from '../../common/types/jwt-payload.interface';
import { PrismaService } from '../../database/prisma.service';
import { UpdateOwnProfileDto } from './dto/update-own-profile.dto';

// Settings > My profile — the signed-in member's own account. Gated by the
// Settings "My profile" pills, enforced for the org admin too (Super Admin
// sets the Admin role's pills in Organisation roles).
const ENFORCE = { enforceForOrgAdmin: true } as const;

@UseGuards(JwtAuthGuard, OrgApprovedGuard, PermissionGuard)
@Controller('org/profile')
export class OrgProfileController {
  constructor(private readonly prisma: PrismaService) {}

  @RequirePermission('settings', SETTINGS_ACTIONS.viewMyProfile, ENFORCE)
  @Get()
  get(@CurrentUser() actor: JwtPayload) {
    // Always the caller's own account — the id comes from the JWT only.
    return getOwnProfile(this.prisma, actor.orgId as string, actor.sub);
  }

  @RequirePermission('settings', SETTINGS_ACTIONS.editMyProfile, ENFORCE)
  @Patch()
  update(@CurrentUser() actor: JwtPayload, @Body() dto: UpdateOwnProfileDto) {
    return updateOwnProfile(this.prisma, actor.orgId as string, actor.sub, dto);
  }
}
