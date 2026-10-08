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
  getCredentials() {
    return this.service.getMarketingCredentials();
  }

  @Put('credentials')
  updateCredentials(@Body() dto: UpdateMarketingCredentialsDto) {
    return this.service.updateMarketingCredentials(dto);
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

  @Get('credentials')
  getCredentials() {
    return this.service.getMarketingCredentials();
  }

  @Put('credentials')
  updateCredentials(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateMarketingCredentialsDto,
  ) {
    const isAllowed =
      user.roles?.includes('super_admin') || user.roles?.includes('admin');
    if (!isAllowed) {
      throw new ForbiddenException(
        'Only administrators can configure marketing platform credentials',
      );
    }
    return this.service.updateMarketingCredentials(dto);
  }

  @Get('dashboard')
  dashboard(@CurrentUser() user: JwtPayload) {
    return this.service.dashboard(user.orgId as string);
  }

  @Get('apps-overview')
  appsOverview(@CurrentUser() user: JwtPayload) {
    return this.service.appsOverview(user.orgId as string);
  }

  @Get('platforms')
  platforms(@CurrentUser() user: JwtPayload) {
    return this.service.listPlatformsForOrg(user.orgId as string);
  }

  @Get('platforms/:key')
  platformDetail(
    @CurrentUser() user: JwtPayload,
    @Param('key') key: string,
  ) {
    return this.service.getPlatformDetail(user.orgId as string, key);
  }

  @Get('platforms/:key/connect')
  connect(
    @CurrentUser() user: JwtPayload,
    @Param('key') key: string,
  ) {
    return this.service.getConnectUrl(
      user.orgId as string,
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
      user.orgId as string,
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
    return this.service.syncPlatform(user.orgId as string, key);
  }

  @Post('connections/:id/sync')
  syncConnection(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.service.syncConnection(user.orgId as string, id);
  }

  @Get('sync-logs')
  orgSyncLogs(
    @CurrentUser() user: JwtPayload,
    @Query('limit') limit?: string,
  ) {
    return this.service.listOrgSyncLogs(
      user.orgId as string,
      limit ? Number(limit) : 50,
    );
  }

  @Get('connections')
  connections(
    @CurrentUser() user: JwtPayload,
    @Query('platformKey') platformKey?: string,
  ) {
    return this.service.listConnections(user.orgId as string, platformKey);
  }

  @Patch('connections/:id')
  updateConnection(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateMarketingConnectionDto,
  ) {
    return this.service.updateConnection(user.orgId as string, id, dto);
  }

  @Delete('connections/:id')
  disconnect(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.service.disconnect(user.orgId as string, id);
  }

  // --- Google Sheets & Drive dedicated endpoints -----------------------------

  @Post('google-sheets/create-sheet')
  createGoogleSheet(
    @CurrentUser() user: JwtPayload,
    @Body() dto: { title?: string; connectionId?: string; projectId?: string },
  ) {
    return this.googleSheets.createNewSheetForOrg(
      user.orgId as string,
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
      user.orgId as string,
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
      user.orgId as string,
      dto?.projectId,
      dto?.connectionId,
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
      user.orgId as string,
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
      user.orgId as string,
      connectionId,
    );
  }

  @Post('google-sheets/regenerate-token')
  regenerateGoogleSheetsWebhookToken(
    @CurrentUser() user: JwtPayload,
    @Body('connectionId') connectionId?: string,
  ) {
    return this.googleSheets.regenerateWebhookToken(
      user.orgId as string,
      connectionId,
    );
  }

  @Post('google-sheets/reset-stats')
  resetGoogleSheetsSyncStats(
    @CurrentUser() user: JwtPayload,
    @Body('connectionId') connectionId?: string,
  ) {
    return this.googleSheets.resetSyncStats(
      user.orgId as string,
      connectionId,
    );
  }

  @Delete('google-sheets')
  disconnectGoogleSheets(
    @CurrentUser() user: JwtPayload,
    @Query('connectionId') connectionId?: string,
  ) {
    return this.googleSheets.disconnect(user.orgId as string, connectionId);
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
    let returnKey = 'google_ads';
    if (state) {
      try {
        const parsed = JSON.parse(Buffer.from(state, 'base64url').toString('utf8'));
        if (parsed.platformKey === 'google_sheets') returnKey = 'google_sheets';
      } catch {}
    }

    if (error || !code || !state) {
      return res.redirect(
        `${fe}/org/marketing/apps/${returnKey}?connected=0&message=${encodeURIComponent(error || 'OAuth cancelled')}`,
      );
    }
    try {
      const result = await this.service.handleGoogleOAuthCallback(code, state);
      return res.redirect(result.redirectTo);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Google connect failed';
      return res.redirect(
        `${fe}/org/marketing/apps/${returnKey}?connected=0&message=${encodeURIComponent(message)}`,
      );
    }
  }
}
