import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OrgApprovedGuard } from '../../common/guards/org-approved.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { SETTINGS_ACTIONS } from '../../common/utils/permissions.util';
import type { JwtPayload } from '../../common/types/jwt-payload.interface';
import { OrgSettingsService } from './org-settings.service';
import { UpdateOrganisationDto } from '../admin-organisations/dto/update-organisation.dto';
import { AssetUploadUrlDto } from './dto/asset-upload-url.dto';

// General, Branding and Localization — Settings > Edit settings & branding.
const ENFORCE = { enforceForOrgAdmin: true } as const;

@UseGuards(JwtAuthGuard, OrgApprovedGuard, PermissionGuard)
@Controller('org/settings')
export class OrgSettingsController {
  constructor(private readonly orgSettingsService: OrgSettingsService) {}

  @RequirePermission('settings', 'view', ENFORCE)
  @Get()
  getSettings(@CurrentUser() actor: JwtPayload) {
    // orgId always comes from the JWT, never a client-supplied param —
    // core multi-tenant isolation rule for every /org/* endpoint.
    return this.orgSettingsService.getSettings(actor.orgId as string);
  }

  @RequirePermission('settings', SETTINGS_ACTIONS.editProfile, ENFORCE)
  @Patch()
  updateSettings(
    @CurrentUser() actor: JwtPayload,
    @Body() dto: UpdateOrganisationDto,
  ) {
    return this.orgSettingsService.updateSettings(actor.orgId as string, dto);
  }

  @RequirePermission('settings', SETTINGS_ACTIONS.editProfile, ENFORCE)
  @Post('logo-upload-url')
  logoUploadUrl(@CurrentUser() actor: JwtPayload, @Body() dto: AssetUploadUrlDto) {
    return this.orgSettingsService.createAssetUploadUrl(
      actor.orgId as string,
      'logo',
      dto,
    );
  }

  @RequirePermission('settings', SETTINGS_ACTIONS.editProfile, ENFORCE)
  @Post('favicon-upload-url')
  faviconUploadUrl(
    @CurrentUser() actor: JwtPayload,
    @Body() dto: AssetUploadUrlDto,
  ) {
    return this.orgSettingsService.createAssetUploadUrl(
      actor.orgId as string,
      'favicon',
      dto,
    );
  }
}
