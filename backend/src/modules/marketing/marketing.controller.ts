import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { SuperAdminGuard } from '../../common/guards/super-admin.guard';
import { OrgApprovedGuard } from '../../common/guards/org-approved.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../common/types/jwt-payload.interface';
import { MarketingService } from './marketing.service';
import { GoogleSheetsService } from './google-sheets.service';
import {
  ConnectMarketingCredentialsDto,
  CreateMarketingPlatformDto,
  UpdateMarketingConnectionDto,
  UpdateMarketingCredentialsDto,
  UpdateMarketingPlatformDto,
  UpdateOrgPlatformAccessDto,
} from './dto/marketing.dto';

@UseGuards(JwtAuthGuard, SuperAdminGuard)
@Controller('admin/marketing')
export class AdminMarketingController {
  constructor(private readonly service: MarketingService) {}

  @Get('credentials')
  getCredentials(@CurrentUser() actor: JwtPayload) {
    this.assertSuperAdmin(actor);
    return this.service.getMarketingCredentials();
  }

  @Put('credentials')
  updateCredentials(
    @CurrentUser() actor: JwtPayload,
    @Body() dto: UpdateMarketingCredentialsDto,
  ) {
    this.assertSuperAdmin(actor);
    return this.service.updateMarketingCredentials(dto);
  }

  // The platform OAuth secrets are not delegated through the Settings
  // permission matrix; only a true Super Administrator may read or change
  // them.
  private assertSuperAdmin(actor: JwtPayload) {
    if (!actor.roles?.includes('super_admin')) {
      throw new ForbiddenException(
        'Platform marketing credentials can only be accessed by a Super Administrator',
      );
    }
  }

  @Get('platforms')
  listPlatforms() {
    return this.service.listPlatformsAdmin();
  }

  @Post('platforms')
  createPlatform(@Body() dto: CreateMarketingPlatformDto) {
    return this.service.createPlatform(dto);
  }

  @Patch('platforms/:id')
  updatePlatform(
    @Param('id') id: string,
    @Body() dto: UpdateMarketingPlatformDto,
  ) {
    return this.service.updatePlatform(id, dto);
  }

  @Delete('platforms/:id')
  deletePlatform(@Param('id') id: string) {
    return this.service.deletePlatform(id);
  }

  @Get('org-access')
  listOrgAccess() {
    return this.service.listOrgAccess();
  }

  @Post('org-access')
  upsertOrgAccess(@Body() dto: UpdateOrgPlatformAccessDto) {
    return this.service.upsertOrgAccess(dto);
  }

  @Get('sync-logs')
  syncLogs(
    @Query('status') status?: string,
    @Query('platformKey') platformKey?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.listSyncLogs({
      status,
      platformKey,
      limit: limit ? Number(limit) : undefined,
    });
  }
}

@UseGuards(JwtAuthGuard, OrgApprovedGuard)
@Controller('org/marketing')
export class OrgMarketingController {
  constructor(
    private readonly service: MarketingService,
    private readonly googleSheets: GoogleSheetsService,
  ) {}

  private resolveOrgId(user: JwtPayload): string {
    return user.orgId || (user.roles?.includes('super_admin') ? 'platform' : '');
  }

  @Get('credentials')
  getCredentials(@CurrentUser() user: JwtPayload) {
    if (!user.roles?.includes('super_admin')) {
      throw new ForbiddenException(
        'Platform credentials can only be accessed by Super Administrator in Admin Console > Marketing',
      );
    }
    return this.service.getMarketingCredentials();
  }

  @Put('credentials')
  updateCredentials(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateMarketingCredentialsDto,
  ) {
    if (!user.roles?.includes('super_admin')) {
      throw new ForbiddenException(
        'Platform credentials can only be configured by Super Administrator in Admin Console > Marketing',
      );
    }
    return this.service.updateMarketingCredentials(dto);
  }

  @Get('dashboard')
  dashboard(@CurrentUser() user: JwtPayload) {
    return this.service.dashboard(this.resolveOrgId(user));
  }

  @Get('apps-overview')
  appsOverview(@CurrentUser() user: JwtPayload) {
    return this.service.appsOverview(this.resolveOrgId(user));
  }

  @Get('platforms')
  platforms(@CurrentUser() user: JwtPayload) {
    return this.service.listPlatformsForOrg(this.resolveOrgId(user));
  }

  @Get('platforms/:key')
  platformDetail(
    @CurrentUser() user: JwtPayload,
    @Param('key') key: string,
  ) {
    return this.service.getPlatformDetail(this.resolveOrgId(user), key);
  }

  @Get('platforms/:key/connect')
  connect(
    @CurrentUser() user: JwtPayload,
    @Param('key') key: string,
  ) {
    const orgId = this.resolveOrgId(user);
    return this.service.getConnectUrl(
      orgId,
      user.sub,
      key,
    );
  }

  @Post('platforms/:key/connect-credentials')
  connectCredentials(
    @CurrentUser() user: JwtPayload,
    @Param('key') key: string,
    @Body() dto: ConnectMarketingCredentialsDto,
  ) {
    return this.service.connectWithCredentials(
      this.resolveOrgId(user),
      user.sub,
      key,
      dto,
    );
  }

  @Post('platforms/:key/sync')
  syncPlatform(
    @CurrentUser() user: JwtPayload,
    @Param('key') key: string,
  ) {
    return this.service.syncPlatform(this.resolveOrgId(user), key);
  }

  @Post('connections/:id/sync')
  syncConnection(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.service.syncConnection(this.resolveOrgId(user), id);
  }

  @Get('sync-logs')
  orgSyncLogs(
    @CurrentUser() user: JwtPayload,
    @Query('limit') limit?: string,
  ) {
    return this.service.listOrgSyncLogs(
      this.resolveOrgId(user),
      limit ? Number(limit) : 50,
    );
  }

  @Get('connections')
  connections(
    @CurrentUser() user: JwtPayload,
    @Query('platformKey') platformKey?: string,
  ) {
    return this.service.listConnections(this.resolveOrgId(user), platformKey);
  }

  @Patch('connections/:id')
  updateConnection(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateMarketingConnectionDto,
  ) {
    return this.service.updateConnection(this.resolveOrgId(user), id, dto);
  }

  @Delete('connections/:id')
  disconnect(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.service.disconnect(this.resolveOrgId(user), id);
  }

  // --- Google Sheets & Drive dedicated endpoints -----------------------------

  @Post('google-sheets/create-sheet')
  createGoogleSheet(
    @CurrentUser() user: JwtPayload,
    @Body() dto: { title?: string; connectionId?: string; projectId?: string },
  ) {
    return this.googleSheets.createNewSheetForOrg(
      this.resolveOrgId(user),
      dto?.title,
      dto?.projectId,
      dto?.connectionId,
    );
  }

  @Post('google-sheets/link-sheet')
  linkGoogleSheet(
    @CurrentUser() user: JwtPayload,
    @Body()
    dto: {
      sheetInput: string;
      sheetName?: string;
      connectionId?: string;
      projectId?: string;
    },
  ) {
    return this.googleSheets.linkExistingSheet(
      this.resolveOrgId(user),
      dto.sheetInput,
      dto?.sheetName,
      dto?.projectId,
      dto?.connectionId,
    );
  }

  @Post('google-sheets/sync-all')
  syncAllGoogleSheets(
    @CurrentUser() user: JwtPayload,
    @Body() dto?: { projectId?: string; connectionId?: string },
  ) {
    return this.googleSheets.syncAllLeadsToSheet(
      this.resolveOrgId(user),
      dto?.projectId,
      dto?.connectionId,
    );
  }

  @Post('google-sheets/import-leads')
  importGoogleSheetsLeads(
    @CurrentUser() user: JwtPayload,
    @Body()
    dto?: {
      connectionId?: string;
      projectId?: string;
      sheetName?: string;
    },
  ) {
    return this.googleSheets.importLeadsFromSheet(
      this.resolveOrgId(user),
      dto?.projectId,
      dto?.connectionId,
      dto?.sheetName,
    );
  }

  @Patch('google-sheets/settings')
  updateGoogleSheetsSettings(
    @CurrentUser() user: JwtPayload,
    @Body()
    dto: {
      autoSync?: boolean;
      sheetName?: string;
      sheetPerProject?: boolean;
      createSheetPerProject?: boolean;
      projectSheetNames?: Record<string, string>;
      projectId?: string | null;
      connectionId?: string;
    },
  ) {
    const { connectionId, ...settings } = dto ?? {};
    return this.googleSheets.updateSettings(
      this.resolveOrgId(user),
      settings,
      connectionId,
    );
  }

  @Get('google-sheets/apps-script-config')
  getGoogleSheetsAppsScriptConfig(
    @CurrentUser() user: JwtPayload,
    @Query('connectionId') connectionId?: string,
  ) {
    return this.googleSheets.getWebhookConfig(
      this.resolveOrgId(user),
      connectionId,
    );
  }

  @Post('google-sheets/regenerate-token')
  regenerateGoogleSheetsWebhookToken(
    @CurrentUser() user: JwtPayload,
    @Body('connectionId') connectionId?: string,
  ) {
    return this.googleSheets.regenerateWebhookToken(
      this.resolveOrgId(user),
      connectionId,
    );
  }

  @Post('google-sheets/reset-stats')
  resetGoogleSheetsSyncStats(
    @CurrentUser() user: JwtPayload,
    @Body('connectionId') connectionId?: string,
  ) {
    return this.googleSheets.resetSyncStats(
      this.resolveOrgId(user),
      connectionId,
    );
  }

  @Delete('google-sheets')
  disconnectGoogleSheets(
    @CurrentUser() user: JwtPayload,
    @Query('connectionId') connectionId?: string,
  ) {
    return this.googleSheets.disconnect(this.resolveOrgId(user), connectionId);
  }
}

/** Public OAuth callbacks (no JWT — state carries org context). */
@Controller('org/marketing/oauth')
export class MarketingOAuthController {
  constructor(private readonly service: MarketingService) {}

  @Get('google/callback')
  async googleCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string | undefined,
    @Res() res: Response,
  ) {
    const fe = (process.env.FRONTEND_URL ?? 'http://localhost:3001').replace(
      /\/$/,
      '',
    );
    const stateInfo = this.service.infoFromOAuthState(state);
    const isPlatform = stateInfo.orgId === 'platform';
    const redirectPrefix = isPlatform ? '/admin-console' : '/org';
    let returnKey = stateInfo.platformKey || 'google_ads';
    if (state && !stateInfo.platformKey) {
      try {
        const parsed = JSON.parse(Buffer.from(state, 'base64url').toString('utf8'));
        if (parsed.platformKey === 'google_sheets') returnKey = 'google_sheets';
      } catch {}
    }

    if (error || !code || !state) {
      return res.redirect(
        `${fe}${redirectPrefix}/marketing/apps/${returnKey}?connected=0&message=${encodeURIComponent(error || 'OAuth cancelled')}`,
      );
    }
    try {
      const result = await this.service.handleGoogleOAuthCallback(code, state);
      return res.redirect(result.redirectTo);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Google connect failed';
      return res.redirect(
        `${fe}${redirectPrefix}/marketing/apps/${returnKey}?connected=0&message=${encodeURIComponent(message)}`,
      );
    }
  }
}
