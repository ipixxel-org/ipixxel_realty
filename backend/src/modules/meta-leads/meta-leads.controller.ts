import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OrgApprovedGuard } from '../../common/guards/org-approved.guard';
import { SuperAdminGuard } from '../../common/guards/super-admin.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../common/types/jwt-payload.interface';
import { MetaLeadsService } from './meta-leads.service';
import {
  MetaManualTokenDto,
  MetaOAuthCallbackDto,
  SaveOrgMetaAppCredentialsDto,
  UpdateMetaConnectionDto,
} from './dto/meta-leads.dto';

@Controller('webhooks/meta')
export class MetaWebhookController {
  constructor(private readonly service: MetaLeadsService) { }

  @Get()
  async verify(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
    @Res() res: Response,
  ) {
    try {
      const result = await this.service.verifyWebhookChallenge(mode, token, challenge);
      return res.status(200).send(result);
    } catch {
      return res.status(403).send('Verification failed');
    }
  }

  @Post()
  async receive(
    @Req() req: Request & { rawBody?: Buffer },
    @Headers('x-hub-signature-256') signature: string | undefined,
    @Body() body: Record<string, unknown>,
    @Res() res: Response,
  ) {
    try {
      await this.service.assertWebhookSignature(req.rawBody, signature);
    } catch {
      return res.status(403).send('Invalid signature');
    }

    res.status(200).send('EVENT_RECEIVED');
    void this.service
      .handleWebhookPayload(
        body as Parameters<MetaLeadsService['handleWebhookPayload']>[0],
      )
      .catch(() => undefined);
  }
}

/**
 * Public OAuth redirect — Facebook hits this without a JWT.
 */
@Controller('org/meta/oauth')
export class MetaOAuthCallbackController {
  constructor(private readonly service: MetaLeadsService) { }

  @Get('callback')
  async oauthCallbackGet(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string | undefined,
    @Query('error_description') errorDescription: string | undefined,
    @Res() res: Response,
  ) {
    const frontend = (
      process.env.FRONTEND_URL ?? 'http://localhost:3001'
    ).replace(/\/$/, '');
    const stateInfo = this.service.infoFromOAuthState(state);
    const returnKey = stateInfo.platformKey || 'meta';
    const redirectPrefix = stateInfo.orgId === 'platform' ? '/admin-console' : '/org';
    if (error) {
      const msg = encodeURIComponent(errorDescription || error);
      return res.redirect(
        `${frontend}${redirectPrefix}/marketing/apps/${returnKey}?connected=0&meta=error&message=${msg}`,
      );
    }
    try {
      const result = await this.service.handleOAuthCallback(code, state);
      return res.redirect(result.redirectTo);
    } catch (err: unknown) {
      const message = encodeURIComponent(
        err instanceof Error ? err.message : 'Facebook connection failed',
      );
      return res.redirect(
        `${frontend}${redirectPrefix}/marketing/apps/${returnKey}?connected=0&meta=error&message=${message}`,
      );
    }
  }

  @Post('callback')
  oauthCallbackPost(@Body() dto: MetaOAuthCallbackDto) {
    return this.service.handleOAuthCallback(dto.code, dto.state);
  }
}

@UseGuards(JwtAuthGuard, OrgApprovedGuard)
@Controller('org/meta')
export class OrgMetaLeadsController {
  constructor(private readonly service: MetaLeadsService) { }

  private resolveOrgId(user: JwtPayload): string {
    return user.orgId || (user.roles?.includes('super_admin') ? 'platform' : '');
  }

  @Get('app-credentials')
  getAppCredentials(@CurrentUser() user: JwtPayload) {
    return this.service.getOrgAppCredentials(this.resolveOrgId(user));
  }

  @Put('app-credentials')
  updateAppCredentials(
    @CurrentUser() user: JwtPayload,
    @Body() dto: SaveOrgMetaAppCredentialsDto,
  ) {
    return this.service.saveOrgAppCredentials(this.resolveOrgId(user), dto);
  }

  @Get('config')
  config(@CurrentUser() user: JwtPayload) {
    return this.service.getPublicConfig(this.resolveOrgId(user) || undefined);
  }

  @Get('connect')
  async connect(@CurrentUser() user: JwtPayload) {
    const orgId = this.resolveOrgId(user);
    if (!orgId) {
      return { url: null, error: 'Organisation required' };
    }
    return await this.service.getConnectUrl(orgId, user.sub);
  }

  @Post('connect-token')
  connectToken(
    @CurrentUser() user: JwtPayload,
    @Body() dto: MetaManualTokenDto,
  ) {
    return this.service.connectWithToken(this.resolveOrgId(user), user.sub, dto);
  }

  @Get('connections')
  list(@CurrentUser() user: JwtPayload) {
    return this.service.listConnections(this.resolveOrgId(user));
  }

  @Patch('connections/:id')
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateMetaConnectionDto,
  ) {
    return this.service.updateConnection(this.resolveOrgId(user), id, dto);
  }

  @Delete('connections/:id')
  disconnect(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.service.disconnect(this.resolveOrgId(user), id);
  }
}

@UseGuards(JwtAuthGuard, SuperAdminGuard)
@Controller('admin/meta')
export class AdminMetaLeadsController {
  constructor(private readonly service: MetaLeadsService) { }

  @Get('config')
  config() {
    return this.service.getPublicConfig();
  }

  @Put('config')
  async updateConfig(
    @Body() dto: { appId?: string; appSecret?: string; verifyToken?: string },
  ) {
    await this.service.persistCredentials(dto.appId, dto.appSecret, dto.verifyToken);
    return this.service.getPublicConfig();
  }
}
