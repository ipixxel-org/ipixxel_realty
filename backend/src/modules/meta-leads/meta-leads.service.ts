import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { normalizeLeadData } from '../../common/utils/lead-data.util';
import {
  attributionToPrismaData,
  resolveAttribution,
  type LeadAttribution,
} from '../../common/utils/lead-attribution.util';
import {
  MetaManualTokenDto,
  UpdateMetaConnectionDto,
} from './dto/meta-leads.dto';
import { GoogleSheetsService } from '../marketing/google-sheets.service';

const GRAPH_VERSION = 'v21.0';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

type MetaLeadField = { name: string; values: string[] };

type MetaLeadPayload = {
  id: string;
  created_time?: string;
  field_data?: MetaLeadField[];
  ad_id?: string;
  adset_id?: string;
  campaign_id?: string;
  form_id?: string;
  ad_name?: string;
  adset_name?: string;
  campaign_name?: string;
  platform?: string;
  is_organic?: boolean;
};

export type MetaChannel = 'instagram' | 'facebook' | 'whatsapp';

/**
 * Map the Graph Lead `platform` value onto a CRM channel. Tolerant on purpose:
 * maps Instagram or WhatsApp if reported by Meta, and defaults to Facebook.
 */
export function resolveMetaChannel(platform?: string | null): MetaChannel {
  const value = (platform ?? '').trim().toLowerCase();
  if (value === 'ig' || value.startsWith('instagram')) return 'instagram';
  if (value === 'wa' || value.includes('whatsapp')) return 'whatsapp';
  return 'facebook';
}

type GraphPage = {
  id: string;
  name: string;
  access_token: string;
};

@Injectable()
export class MetaLeadsService implements OnModuleInit {
  private readonly logger = new Logger(MetaLeadsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly googleSheets?: GoogleSheetsService,
  ) {}

  private cachedAppId = '';
  private cachedAppSecret = '';
  private cachedVerifyToken = '';
  private dbLoaded = false;

  async onModuleInit() {
    await this.loadCredentialsFromDb();
  }

  async loadCredentialsFromDb(): Promise<void> {
    try {
      const rows: any[] = await this.prisma.$queryRawUnsafe(`
        SELECT "meta_app_id", "meta_app_secret", "meta_webhook_verify_token"
        FROM "identity"."marketing_settings"
        WHERE "id" = 'default' LIMIT 1
      `);
      if (rows && rows.length > 0) {
        const r = rows[0];
        this.dbLoaded = true;
        if (typeof r.meta_app_id === 'string') {
          this.cachedAppId = r.meta_app_id.trim();
          process.env.META_APP_ID = this.cachedAppId;
        }
        if (typeof r.meta_app_secret === 'string') {
          this.cachedAppSecret = r.meta_app_secret.trim();
          process.env.META_APP_SECRET = this.cachedAppSecret;
        }
        if (typeof r.meta_webhook_verify_token === 'string') {
          this.cachedVerifyToken = r.meta_webhook_verify_token.trim();
          process.env.META_WEBHOOK_VERIFY_TOKEN = this.cachedVerifyToken;
        }
      }
    } catch {
      // Table may not exist yet on fresh database before ensureSettingsTable
    }
  }

  setCredentials(appId?: string, appSecret?: string, verifyToken?: string) {
    this.dbLoaded = true;
    if (appId !== undefined) {
      this.cachedAppId = (appId ?? '').trim();
      process.env.META_APP_ID = this.cachedAppId;
    }
    if (appSecret !== undefined) {
      this.cachedAppSecret = (appSecret ?? '').trim();
      process.env.META_APP_SECRET = this.cachedAppSecret;
    }
    if (verifyToken !== undefined) {
      this.cachedVerifyToken = (verifyToken ?? '').trim();
      process.env.META_WEBHOOK_VERIFY_TOKEN = this.cachedVerifyToken;
    }
  }

  async persistCredentials(appId?: string, appSecret?: string, verifyToken?: string): Promise<void> {
    this.setCredentials(appId, appSecret, verifyToken);
    try {
      await this.prisma.$executeRawUnsafe(`
        CREATE SCHEMA IF NOT EXISTS "identity";
        CREATE TABLE IF NOT EXISTS "identity"."marketing_settings" (
          "id" VARCHAR(64) PRIMARY KEY,
          "meta_app_id" TEXT,
          "meta_app_secret" TEXT,
          "meta_webhook_verify_token" TEXT,
          "google_ads_client_id" TEXT,
          "google_ads_client_secret" TEXT,
          "google_ads_developer_token" TEXT,
          "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);
      await this.prisma.$executeRawUnsafe(`
        INSERT INTO "identity"."marketing_settings" ("id", "meta_app_id", "meta_app_secret", "meta_webhook_verify_token")
        VALUES ('default', $1, $2, $3)
        ON CONFLICT ("id") DO UPDATE SET
          "meta_app_id" = EXCLUDED."meta_app_id",
          "meta_app_secret" = EXCLUDED."meta_app_secret",
          "meta_webhook_verify_token" = EXCLUDED."meta_webhook_verify_token",
          "updated_at" = NOW();
      `, this.cachedAppId, this.cachedAppSecret, this.cachedVerifyToken);
    } catch (err) {
      this.logger.error('Failed to persist Meta credentials to database', err);
    }
  }

  private appId() {
    if (this.dbLoaded) return this.cachedAppId;
    return this.cachedAppId || (process.env.META_APP_ID ?? '').trim();
  }

  private appSecret() {
    if (this.dbLoaded) return this.cachedAppSecret;
    return this.cachedAppSecret || (process.env.META_APP_SECRET ?? '').trim();
  }

  private verifyToken() {
    if (this.dbLoaded) return this.cachedVerifyToken;
    return this.cachedVerifyToken || (process.env.META_WEBHOOK_VERIFY_TOKEN ?? '').trim();
  }

  private frontendUrl() {
    return (process.env.FRONTEND_URL ?? 'http://localhost:3001').replace(
      /\/$/,
      '',
    );
  }

  private apiPublicUrl() {
    // Where Meta redirects after OAuth / posts webhooks. Prefer explicit
    // BACKEND_PUBLIC_URL; fall back to FRONTEND_URL/api (Next rewrite).
    const explicit = (process.env.BACKEND_PUBLIC_URL ?? '').trim();
    if (explicit) return explicit.replace(/\/$/, '');
    return `${this.frontendUrl()}/api`;
  }

  isConfigured() {
    return Boolean(this.appId() && this.appSecret());
  }

  getPublicConfig() {
    return {
      configured: this.isConfigured(),
      appId: this.appId() || null,
      webhookCallbackUrl: `${this.apiPublicUrl()}/webhooks/meta`,
      oauthRedirectUri: `${this.apiPublicUrl()}/org/meta/oauth/callback`,
    };
  }

  /** Build Facebook OAuth URL for an org admin to connect Pages. */
  getConnectUrl(orgId: string, userId: string, platformKey = 'meta') {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException(
        'Facebook Lead Ads is not configured. Ask a Super Admin to configure Meta credentials in Admin Console > Marketing.',
      );
    }
    const redirectUri = `${this.apiPublicUrl()}/org/meta/oauth/callback`;
    const state = Buffer.from(
      JSON.stringify({
        orgId,
        userId,
        platformKey: platformKey || 'meta',
        ts: Date.now(),
      }),
      'utf8',
    ).toString('base64url');
    const params = new URLSearchParams({
      client_id: this.appId(),
      redirect_uri: redirectUri,
      state,
      scope: [
        // Lead Ads + Page connect — keep scopes minimal so App Review / product
        // setup is not blocked by Instagram Business extras.
        'pages_show_list',
        'pages_read_engagement',
        'pages_manage_metadata',
        'leads_retrieval',
        'pages_manage_ads',
      ].join(','),
      response_type: 'code',
    });
    return {
      url: `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth?${params}`,
      state,
    };
  }

  /** Decode OAuth state so error redirects land on the right Connected App. */
  platformKeyFromOAuthState(state: string | undefined): string {
    if (!state) return 'meta';
    try {
      const parsed = JSON.parse(
        Buffer.from(state, 'base64url').toString('utf8'),
      ) as { platformKey?: string };
      if (
        parsed.platformKey === 'instagram' ||
        parsed.platformKey === 'whatsapp'
      ) {
        return parsed.platformKey;
      }
    } catch {
      // ignore malformed state
    }
    return 'meta';
  }

  async handleOAuthCallback(code: string, state: string) {
    let parsed: { orgId?: string; userId?: string; platformKey?: string };
    try {
      parsed = JSON.parse(
        Buffer.from(state, 'base64url').toString('utf8'),
      ) as { orgId?: string; userId?: string; platformKey?: string };
    } catch {
      throw new BadRequestException('Invalid OAuth state');
    }
    if (!parsed.orgId) throw new BadRequestException('Invalid OAuth state');
    const returnKey =
      parsed.platformKey === 'instagram' || parsed.platformKey === 'whatsapp'
        ? parsed.platformKey
        : 'meta';

    const redirectUri = `${this.apiPublicUrl()}/org/meta/oauth/callback`;
    const tokenUrl = new URL(`${GRAPH_BASE}/oauth/access_token`);
    tokenUrl.searchParams.set('client_id', this.appId());
    tokenUrl.searchParams.set('client_secret', this.appSecret());
    tokenUrl.searchParams.set('redirect_uri', redirectUri);
    tokenUrl.searchParams.set('code', code);

    const tokenRes = await fetch(tokenUrl);
    const tokenJson = (await tokenRes.json()) as {
      access_token?: string;
      error?: { message?: string };
    };
    if (!tokenRes.ok || !tokenJson.access_token) {
      this.logger.warn(`Meta token exchange failed: ${JSON.stringify(tokenJson)}`);
      throw new BadRequestException(
        tokenJson.error?.message ?? 'Failed to exchange Facebook OAuth code',
      );
    }

    const longLived = await this.exchangeLongLivedUserToken(
      tokenJson.access_token,
    );
    const pages = await this.fetchUserPages(longLived);
    if (pages.length === 0) {
      throw new BadRequestException(
        'No Facebook Pages were shared with iPixxel. Click Connect again, choose Edit settings, and tick your Page (and its business portfolio if asked).',
      );
    }

    const saved: Array<{
      id: string;
      orgId: string;
      pageId: string;
      pageName: string;
      projectId: string | null;
      connectedAt: Date;
      updatedAt: Date;
    }> = [];
    for (const page of pages) {
      const row = await this.prisma.metaPageConnection.upsert({
        where: {
          orgId_pageId: { orgId: parsed.orgId, pageId: page.id },
        },
        create: {
          orgId: parsed.orgId,
          pageId: page.id,
          pageName: page.name,
          accessToken: page.access_token,
          connectedBy: parsed.userId ?? null,
        },
        update: {
          pageName: page.name,
          accessToken: page.access_token,
          connectedBy: parsed.userId ?? null,
        },
      });
      await this.subscribePageToLeadgen(page.id, page.access_token);
      await this.mirrorToMarketingConnection({
        orgId: parsed.orgId,
        pageId: page.id,
        pageName: page.name,
        accessToken: page.access_token,
        connectedBy: parsed.userId ?? null,
        alsoPlatformKeys: ['instagram', 'whatsapp'],
      });
      // Pull recent leads so CRM has data right after connect.
      await this.backfillRecentLeads(page.id, page.access_token);
      saved.push(this.toPublicConnection(row));
    }

    return {
      connected: saved.length,
      pages: saved,
      redirectTo: `${this.frontendUrl()}/org/marketing/apps/${returnKey}?meta=connected`,
    };
  }

  /** Manual Page token — useful when OAuth redirect isn't reachable locally. */
  async connectWithToken(orgId: string, userId: string, dto: MetaManualTokenDto) {
    if (!dto.accessToken.trim()) {
      throw new BadRequestException('Page access token is required');
    }
    if (dto.projectId) {
      const project = await this.prisma.project.findFirst({
        where: { id: dto.projectId, orgId },
        select: { id: true },
      });
      if (!project) throw new NotFoundException('Project not found');
    }

    try {
      await this.subscribePageToLeadgen(dto.pageId, dto.accessToken.trim());
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `Could not subscribe Page ${dto.pageId} to leadgen webhooks during token connect: ${msg}`,
      );
    }

    const row = await this.prisma.metaPageConnection.upsert({
      where: { orgId_pageId: { orgId, pageId: dto.pageId.trim() } },
      create: {
        orgId,
        pageId: dto.pageId.trim(),
        pageName: dto.pageName.trim() || dto.pageId.trim(),
        accessToken: dto.accessToken.trim(),
        projectId: dto.projectId ?? null,
        connectedBy: userId,
      },
      update: {
        pageName: dto.pageName.trim() || dto.pageId.trim(),
        accessToken: dto.accessToken.trim(),
        projectId: dto.projectId ?? null,
        connectedBy: userId,
      },
    });
    await this.mirrorToMarketingConnection({
      orgId,
      pageId: dto.pageId.trim(),
      pageName: dto.pageName.trim() || dto.pageId.trim(),
      accessToken: dto.accessToken.trim(),
      projectId: dto.projectId ?? null,
      connectedBy: userId,
      alsoPlatformKeys: ['instagram', 'whatsapp'],
    });
    // Import recent form leads so Lead Center shows data immediately.
    const imported = await this.backfillRecentLeads(
      dto.pageId.trim(),
      dto.accessToken.trim(),
    );
    return { ...this.toPublicConnection(row), imported };
  }

  async listConnections(orgId: string) {
    const rows = await this.prisma.metaPageConnection.findMany({
      where: { orgId },
      include: { project: { select: { id: true, name: true } } },
      orderBy: { connectedAt: 'desc' },
    });
    return rows.map((row) => ({
      ...this.toPublicConnection(row),
      project: row.project,
    }));
  }

  async updateConnection(
    orgId: string,
    id: string,
    dto: UpdateMetaConnectionDto,
  ) {
    const existing = await this.prisma.metaPageConnection.findFirst({
      where: { id, orgId },
    });
    if (!existing) throw new NotFoundException('Meta connection not found');

    if (dto.projectId) {
      const project = await this.prisma.project.findFirst({
        where: { id: dto.projectId, orgId },
        select: { id: true },
      });
      if (!project) throw new NotFoundException('Project not found');
    }

    const row = await this.prisma.metaPageConnection.update({
      where: { id },
      data: {
        projectId:
          dto.projectId === undefined ? existing.projectId : dto.projectId,
      },
      include: { project: { select: { id: true, name: true } } },
    });

    const nextProjectId =
      dto.projectId === undefined ? existing.projectId : dto.projectId;
    try {
      await this.prisma.marketingConnection.updateMany({
        where: {
          orgId,
          externalAccountId: existing.pageId,
          platformKey: { in: ['meta', 'instagram', 'whatsapp'] },
        },
        data: { projectId: nextProjectId },
      });
    } catch {
      // Marketing mirror optional on older deploys
    }

    return { ...this.toPublicConnection(row), project: row.project };
  }

  async disconnect(orgId: string, id: string) {
    const existing = await this.prisma.metaPageConnection.findFirst({
      where: { id, orgId },
    });
    if (!existing) throw new NotFoundException('Meta connection not found');
    await this.prisma.metaPageConnection.delete({ where: { id } });
    try {
      await this.prisma.marketingConnection.deleteMany({
        where: {
          orgId,
          externalAccountId: existing.pageId,
          platformKey: { in: ['meta', 'instagram', 'whatsapp'] },
        },
      });
    } catch {
      // Marketing mirror optional on older deploys
    }
    return { ok: true };
  }

  verifyWebhookChallenge(
    mode: string | undefined,
    token: string | undefined,
    challenge: string | undefined,
  ): string {
    const expected = this.verifyToken();
    if (!expected) {
      throw new ServiceUnavailableException(
        'Meta Webhook Verify Token is not configured. Configure it in Admin Console > Marketing.',
      );
    }
    if (mode === 'subscribe' && token === expected && challenge) {
      return challenge;
    }
    throw new BadRequestException('Webhook verification failed');
  }

  /**
   * Optional App Secret proof for webhook POSTs. Meta signs the raw body with
   * SHA256 HMAC using the app secret (`X-Hub-Signature-256`).
   */
  assertWebhookSignature(rawBody: Buffer | string | undefined, signatureHeader: string | undefined) {
    const secret = this.appSecret();
    if (!secret) return;
    if (!signatureHeader || !rawBody) {
      throw new BadRequestException('Missing webhook signature');
    }
    const expected =
      'sha256=' +
      createHmac('sha256', secret)
        .update(typeof rawBody === 'string' ? rawBody : rawBody)
        .digest('hex');
    const a = Buffer.from(expected);
    const b = Buffer.from(signatureHeader);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new BadRequestException('Invalid webhook signature');
    }
  }

  async handleWebhookPayload(body: {
    object?: string;
    entry?: Array<{
      id?: string;
      changes?: Array<{
        field?: string;
        value?: {
          leadgen_id?: string;
          page_id?: string;
          form_id?: string;
          ad_id?: string;
          adgroup_id?: string;
          campaign_id?: string;
          created_time?: number;
        };
      }>;
    }>;
  }) {
    if (body.object !== 'page') return { processed: 0 };

    let processed = 0;
    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        if (change.field !== 'leadgen') continue;
        const value = change.value;
        if (!value?.leadgen_id || !value.page_id) continue;
        try {
          await this.ingestLeadgen({
            leadgenId: value.leadgen_id,
            pageId: value.page_id,
            formId: value.form_id,
            adId: value.ad_id,
            adSetId: value.adgroup_id,
            campaignId: value.campaign_id,
          });
          processed += 1;
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          this.logger.error(
            `Failed to ingest Meta lead ${value.leadgen_id}: ${message}`,
          );
        }
      }
    }
    return { processed };
  }

  async ingestLeadgen(input: {
    leadgenId: string;
    pageId: string;
    formId?: string;
    adId?: string;
    adSetId?: string;
    campaignId?: string;
  }) {
    const existing = await this.prisma.lead.findUnique({
      where: { metaLeadgenId: input.leadgenId },
      select: { id: true },
    });
    if (existing) return existing;

    const connection =
      (await this.prisma.metaPageConnection.findFirst({
        where: { pageId: input.pageId },
        orderBy: { connectedAt: 'desc' },
      })) ??
      (await this.prisma.marketingConnection
        .findFirst({
          where: { platformKey: 'meta', externalAccountId: input.pageId },
          orderBy: { connectedAt: 'desc' },
        })
        .then((row) =>
          row
            ? {
                orgId: row.orgId,
                projectId: row.projectId,
                accessToken: row.accessToken ?? '',
              }
            : null,
        ));
    if (!connection || !('accessToken' in connection) || !connection.accessToken) {
      throw new NotFoundException(
        `No organisation connected to Facebook Page ${input.pageId}`,
      );
    }

    const payload = await this.fetchLeadDetails(
      input.leadgenId,
      connection.accessToken,
    );
    const fieldMap = this.fieldDataToMap(payload.field_data ?? []);
    const data = normalizeLeadData(fieldMap);

    const channel = resolveMetaChannel(payload.platform);
    const channelLabel =
      channel === 'instagram'
        ? 'Instagram'
        : channel === 'whatsapp'
          ? 'WhatsApp'
          : 'Facebook';
    this.logger.log(
      `Meta lead ${input.leadgenId}: platform=${JSON.stringify(payload.platform ?? null)} is_organic=${String(payload.is_organic ?? null)} -> ${channel}`,
    );

    const attribution: LeadAttribution = resolveAttribution(data, {
      source: channelLabel,
      platform:
        channel === 'instagram'
          ? 'instagram'
          : channel === 'whatsapp'
            ? 'whatsapp'
            : 'meta',
      medium: payload.is_organic === true ? 'Organic Social' : 'Paid Social',
      campaign: payload.campaign_name ?? null,
      campaignId: payload.campaign_id ?? input.campaignId ?? null,
      adSet: payload.adset_name ?? null,
      adSetId: payload.adset_id ?? input.adSetId ?? null,
      ad: payload.ad_name ?? null,
      adId: payload.ad_id ?? input.adId ?? null,
      utmSource: channelLabel,
      utmMedium: 'Paid',
      utmCampaign: payload.campaign_name ?? null,
      firstTouchSource: channelLabel,
      lastTouchSource: channelLabel,
    });

    // Keep what Meta actually reported next to the form answers (no dedicated
    // column yet). Added after attribution is resolved so it can't feed it.
    const rawPlatform = payload.platform?.trim();
    const leadData: Record<string, unknown> = {
      ...data,
      ...(rawPlatform ? { metaPlatform: rawPlatform } : {}),
      ...(typeof payload.is_organic === 'boolean'
        ? { metaIsOrganic: payload.is_organic }
        : {}),
    };

    // Enrich names from Graph when only IDs arrived on the webhook.
    if (attribution.adId && !attribution.ad) {
      attribution.ad = await this.fetchObjectName(
        attribution.adId,
        connection.accessToken,
      );
    }
    if (attribution.adSetId && !attribution.adSet) {
      attribution.adSet = await this.fetchObjectName(
        attribution.adSetId,
        connection.accessToken,
      );
    }
    if (attribution.campaignId && !attribution.campaign) {
      attribution.campaign = await this.fetchObjectName(
        attribution.campaignId,
        connection.accessToken,
      );
      if (!attribution.utmCampaign) {
        attribution.utmCampaign = attribution.campaign;
      }
    }

    const assignedToId = await this.nextRoundRobinAssignee(
      connection.orgId,
      connection.projectId,
    );

    try {
      const lead = await this.prisma.lead.create({
        data: {
          orgId: connection.orgId,
          projectId: connection.projectId,
          formName: payload.form_id
            ? `Meta Lead Form ${payload.form_id}`
            : 'Meta Lead Ad',
          source: attribution.source ?? channelLabel,
          data: leadData as Prisma.InputJsonValue,
          configurations: [],
          tags: [],
          metaLeadgenId: input.leadgenId,
          metaFormId: payload.form_id ?? input.formId ?? null,
          metaPageId: input.pageId,
          ...attributionToPrismaData(attribution),
          ...(assignedToId ? { assignedToId } : {}),
        },
      });

      if (this.googleSheets) {
        void this.googleSheets
          .appendLeadRow(
            connection.orgId,
            lead,
            lead.projectId ?? connection.projectId ?? undefined,
          )
          .catch(() => {});
      }

      await this.prisma.activityEvent.create({
        data: {
          orgId: connection.orgId,
          agentId: null,
          leadId: lead.id,
          type: 'status_updated',
          text: assignedToId
            ? `Lead captured from ${channelLabel} Lead Ads and assigned automatically`
            : `Lead captured from ${channelLabel} Lead Ads`,
        },
      });

      return lead;
    } catch (err: unknown) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        return this.prisma.lead.findUnique({
          where: { metaLeadgenId: input.leadgenId },
        });
      }
      throw err;
    }
  }

  private toPublicConnection(row: {
    id: string;
    orgId: string;
    pageId: string;
    pageName: string;
    projectId: string | null;
    connectedAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: row.id,
      orgId: row.orgId,
      pageId: row.pageId,
      pageName: row.pageName,
      projectId: row.projectId,
      connectedAt: row.connectedAt,
      updatedAt: row.updatedAt,
    };
  }

  private async exchangeLongLivedUserToken(shortToken: string) {
    const url = new URL(`${GRAPH_BASE}/oauth/access_token`);
    url.searchParams.set('grant_type', 'fb_exchange_token');
    url.searchParams.set('client_id', this.appId());
    url.searchParams.set('client_secret', this.appSecret());
    url.searchParams.set('fb_exchange_token', shortToken);
    const res = await fetch(url);
    const json = (await res.json()) as {
      access_token?: string;
      error?: { message?: string };
    };
    if (!res.ok || !json.access_token) {
      throw new BadRequestException(
        json.error?.message ?? 'Failed to obtain long-lived Facebook token',
      );
    }
    return json.access_token;
  }

  /**
   * Pages the user shared with the app. `/me/accounts` is the primary source;
   * it comes back empty for Pages owned by a business portfolio, so fall back
   * to the Page IDs listed in the token's granular scopes.
   */
  private async fetchUserPages(userToken: string): Promise<GraphPage[]> {
    const byId = new Map<string, GraphPage>();

    const first = new URL(`${GRAPH_BASE}/me/accounts`);
    first.searchParams.set('fields', 'id,name,access_token');
    first.searchParams.set('access_token', userToken);
    let nextUrl: string | null = first.toString();
    // Bounded so a misbehaving paging cursor can't loop forever.
    for (let i = 0; nextUrl && i < 20; i++) {
      const res = await fetch(nextUrl);
      const json = (await res.json()) as {
        data?: GraphPage[];
        paging?: { next?: string };
        error?: { message?: string };
      };
      if (!res.ok) {
        throw new BadRequestException(
          json.error?.message ?? 'Failed to list Facebook Pages',
        );
      }
      for (const page of json.data ?? []) {
        if (page?.id) byId.set(page.id, page);
      }
      nextUrl = json.paging?.next ?? null;
    }

    if (byId.size === 0) {
      for (const page of await this.fetchPagesFromGranularScopes(userToken)) {
        byId.set(page.id, page);
      }
    }
    return [...byId.values()];
  }

  /**
   * Facebook Login for Business tokens carry granular scopes naming the Page
   * IDs the user ticked. Resolve each to a Page access token; a Page that
   * can't be read is skipped so the others still connect.
   */
  private async fetchPagesFromGranularScopes(
    userToken: string,
  ): Promise<GraphPage[]> {
    const pageIds = new Set<string>();
    try {
      const url = new URL(`${GRAPH_BASE}/debug_token`);
      url.searchParams.set('input_token', userToken);
      url.searchParams.set(
        'access_token',
        `${this.appId()}|${this.appSecret()}`,
      );
      const res = await fetch(url);
      const json = (await res.json()) as {
        data?: {
          granular_scopes?: Array<{ scope?: string; target_ids?: string[] }>;
        };
        error?: { message?: string };
      };
      if (!res.ok) {
        this.logger.warn(
          `Meta debug_token failed: ${json.error?.message ?? res.status}`,
        );
        return [];
      }
      const pageScopes = [
        'pages_show_list',
        'leads_retrieval',
        'pages_manage_metadata',
      ];
      for (const entry of json.data?.granular_scopes ?? []) {
        if (!entry.scope || !pageScopes.includes(entry.scope)) continue;
        for (const id of entry.target_ids ?? []) {
          if (id) pageIds.add(String(id));
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Meta debug_token failed: ${message}`);
      return [];
    }

    const pages: GraphPage[] = [];
    for (const pageId of pageIds) {
      try {
        const url = new URL(`${GRAPH_BASE}/${pageId}`);
        url.searchParams.set('fields', 'id,name,access_token');
        url.searchParams.set('access_token', userToken);
        const res = await fetch(url);
        const json = (await res.json()) as Partial<GraphPage> & {
          error?: { message?: string };
        };
        if (!res.ok || !json.id || !json.access_token) {
          this.logger.warn(
            `Could not read Facebook Page ${pageId}: ${json.error?.message ?? 'no Page access token returned'}`,
          );
          continue;
        }
        pages.push({
          id: json.id,
          name: json.name ?? json.id,
          access_token: json.access_token,
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Could not read Facebook Page ${pageId}: ${message}`);
      }
    }
    return pages;
  }

  /**
   * Re-subscribe Page to leadgen and pull recent form leads into CRM.
   * Used by Integration Engine Sync Now — recovers leads missed while
   * webhook was down or before first connect.
   */
  async resyncPage(pageId: string, pageToken: string) {
    await this.subscribePageToLeadgen(pageId, pageToken);
    const imported = await this.backfillRecentLeads(pageId, pageToken);
    return { ok: true as const, imported };
  }

  private async subscribePageToLeadgen(pageId: string, pageToken: string) {
    const url = new URL(`${GRAPH_BASE}/${pageId}/subscribed_apps`);
    url.searchParams.set('subscribed_fields', 'leadgen');
    url.searchParams.set('access_token', pageToken);
    const res = await fetch(url, { method: 'POST' });
    const json = (await res.json().catch(() => ({}))) as {
      success?: boolean;
      error?: { message?: string };
    };
    if (!res.ok || json.success === false) {
      const message =
        json.error?.message ??
        `Failed to subscribe Page ${pageId} to leadgen webhooks`;
      this.logger.warn(`Page ${pageId} leadgen subscribe failed: ${message}`);
      throw new BadRequestException(message);
    }
  }

  /**
   * Pull recent Lead Ad form submissions for a Page and ingest any that are
   * not already in CRM (idempotent on metaLeadgenId).
   */
  private async backfillRecentLeads(
    pageId: string,
    pageToken: string,
    perFormLimit = 25,
  ): Promise<number> {
    const formsUrl = new URL(`${GRAPH_BASE}/${pageId}/leadgen_forms`);
    formsUrl.searchParams.set('fields', 'id,name,status');
    formsUrl.searchParams.set('limit', '50');
    formsUrl.searchParams.set('access_token', pageToken);
    const formsRes = await fetch(formsUrl);
    const formsJson = (await formsRes.json()) as {
      data?: Array<{ id: string; name?: string; status?: string }>;
      error?: { message?: string };
    };
    if (!formsRes.ok) {
      this.logger.warn(
        `Could not list leadgen forms for Page ${pageId}: ${formsJson.error?.message ?? formsRes.status}`,
      );
      return 0;
    }

    let imported = 0;
    for (const form of formsJson.data ?? []) {
      if (form.status && form.status !== 'ACTIVE') continue;
      let nextUrl: string | null = (() => {
        const u = new URL(`${GRAPH_BASE}/${form.id}/leads`);
        u.searchParams.set('fields', 'id,created_time,ad_id,adset_id,campaign_id,form_id,field_data');
        u.searchParams.set('limit', String(perFormLimit));
        u.searchParams.set('access_token', pageToken);
        return u.toString();
      })();
      let fetched = 0;
      while (nextUrl && fetched < perFormLimit) {
        const leadsRes = await fetch(nextUrl);
        const leadsJson = (await leadsRes.json()) as {
          data?: Array<{
            id: string;
            created_time?: string;
            ad_id?: string;
            adset_id?: string;
            campaign_id?: string;
            form_id?: string;
          }>;
          paging?: { next?: string };
          error?: { message?: string };
        };
        if (!leadsRes.ok) {
          this.logger.warn(
            `Could not list leads for form ${form.id}: ${leadsJson.error?.message ?? leadsRes.status}`,
          );
          break;
        }
        for (const lead of leadsJson.data ?? []) {
          if (!lead.id) continue;
          try {
            const before = await this.prisma.lead.findUnique({
              where: { metaLeadgenId: lead.id },
              select: { id: true },
            });
            await this.ingestLeadgen({
              leadgenId: lead.id,
              pageId,
              formId: lead.form_id ?? form.id,
              adId: lead.ad_id,
              adSetId: lead.adset_id,
              campaignId: lead.campaign_id,
            });
            if (!before) imported += 1;
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            this.logger.warn(
              `Backfill skip lead ${lead.id}: ${message}`,
            );
          }
          fetched += 1;
          if (fetched >= perFormLimit) break;
        }
        nextUrl =
          fetched < perFormLimit && leadsJson.paging?.next
            ? leadsJson.paging.next
            : null;
      }
    }
    return imported;
  }

  private async fetchLeadDetails(
    leadgenId: string,
    pageToken: string,
  ): Promise<MetaLeadPayload> {
    const url = new URL(`${GRAPH_BASE}/${leadgenId}`);
    url.searchParams.set(
      'fields',
      'id,created_time,field_data,ad_id,adset_id,campaign_id,form_id,ad_name,adset_name,campaign_name,platform,is_organic',
    );
    url.searchParams.set('access_token', pageToken);
    const res = await fetch(url);
    const json = (await res.json()) as MetaLeadPayload & {
      error?: { message?: string };
    };
    if (!res.ok) {
      throw new BadRequestException(
        json.error?.message ?? `Failed to fetch Meta lead ${leadgenId}`,
      );
    }
    return json;
  }

  private async fetchObjectName(
    id: string,
    token: string,
  ): Promise<string | null> {
    try {
      const url = new URL(`${GRAPH_BASE}/${id}`);
      url.searchParams.set('fields', 'name');
      url.searchParams.set('access_token', token);
      const res = await fetch(url);
      if (!res.ok) return null;
      const json = (await res.json()) as { name?: string };
      return json.name?.trim() || null;
    } catch {
      return null;
    }
  }

  private fieldDataToMap(fields: MetaLeadField[]): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const field of fields) {
      const value = (field.values ?? []).filter(Boolean).join(', ').trim();
      if (!value) continue;
      const name = (field.name ?? '').trim();
      if (!name) continue;
      out[name] = value;
      // Map common Meta lead form field names onto CRM contact keys.
      const lower = name.toLowerCase();
      if (['full_name', 'full name', 'name', 'your name'].includes(lower)) {
        out.fullName = value;
        out.name = value;
      } else if (
        ['email', 'email_address', 'work_email'].includes(lower)
      ) {
        out.email = value;
      } else if (
        ['phone', 'phone_number', 'mobile', 'mobile_number', 'work_phone'].includes(
          lower,
        )
      ) {
        out.phone = value;
      } else if (lower === 'city') {
        out.city = value;
      }
    }
    return out;
  }

  private async mirrorToMarketingConnection(input: {
    orgId: string;
    pageId: string;
    pageName: string;
    accessToken: string;
    projectId?: string | null;
    connectedBy?: string | null;
    alsoPlatformKeys?: string[];
  }) {
    const keys = ['meta', ...(input.alsoPlatformKeys ?? [])];
    const names: Record<string, string> = {
      meta: 'Facebook / Meta',
      instagram: 'Instagram',
      whatsapp: 'WhatsApp Ads',
    };
    try {
      for (const platformKey of keys) {
        await this.prisma.marketingPlatform.upsert({
          where: { key: platformKey },
          create: {
            key: platformKey,
            name: names[platformKey] ?? platformKey,
            description:
              platformKey === 'meta'
                ? 'Facebook & Instagram Lead Ads via Meta Graph API'
                : platformKey === 'instagram'
                  ? 'Instagram Lead Ads (via Meta)'
                  : 'WhatsApp ads attribution via Meta',
            sortOrder:
              platformKey === 'meta' ? 10 : platformKey === 'instagram' ? 20 : 60,
            enabled: true,
            supportsOAuth: true,
            supportsWebhook: platformKey !== 'whatsapp',
          },
          update: {},
        });
        await this.prisma.marketingConnection.upsert({
          where: {
            orgId_platformKey_externalAccountId: {
              orgId: input.orgId,
              platformKey,
              externalAccountId: input.pageId,
            },
          },
          create: {
            orgId: input.orgId,
            platformKey,
            status: 'connected',
            externalAccountId: input.pageId,
            externalAccountName: input.pageName,
            accessToken: input.accessToken,
            projectId: input.projectId ?? null,
            connectedBy: input.connectedBy ?? null,
            lastSyncAt: new Date(),
            metadata: { via: 'meta_oauth' },
          },
          update: {
            status: 'connected',
            externalAccountName: input.pageName,
            accessToken: input.accessToken,
            ...(input.projectId !== undefined
              ? { projectId: input.projectId }
              : {}),
            connectedBy: input.connectedBy ?? undefined,
            lastSyncAt: new Date(),
            lastError: null,
            metadata: { via: 'meta_oauth' },
          },
        });
      }
    } catch {
      // Marketing tables may not exist yet on older deploys — Meta path still works.
    }
  }

  private async nextRoundRobinAssignee(
    orgId: string,
    projectId: string | null,
  ): Promise<string | null> {
    if (!projectId) return null;
    const agents = await this.prisma.projectSalesAgent.findMany({
      where: { projectId, user: { orgId, status: 'active' } },
      select: { userId: true },
      orderBy: { assignedAt: 'asc' },
    });
    if (agents.length === 0) return null;

    const last = await this.prisma.lead.findFirst({
      where: {
        orgId,
        projectId,
        assignedToId: { in: agents.map((a) => a.userId) },
      },
      orderBy: { createdAt: 'desc' },
      select: { assignedToId: true },
    });
    if (!last?.assignedToId) return agents[0].userId;
    const idx = agents.findIndex((a) => a.userId === last.assignedToId);
    const next = agents[(idx + 1) % agents.length];
    return next.userId;
  }
}
