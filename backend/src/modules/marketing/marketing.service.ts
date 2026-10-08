import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  ServiceUnavailableException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import {
  DEFAULT_MARKETING_PLATFORMS,
  ACTIVE_MARKETING_PLATFORM_KEYS,
  platformDisplayLabel,
} from '../../common/utils/lead-attribution.util';
import {
  CreateMarketingPlatformDto,
  UpdateMarketingConnectionDto,
  UpdateMarketingPlatformDto,
  UpdateOrgPlatformAccessDto,
  UpdateMarketingCredentialsDto,
} from './dto/marketing.dto';
import { MetaLeadsService } from '../meta-leads/meta-leads.service';
import { PlatformAdapterRegistry } from './adapters/platform-adapter.registry';
import { GoogleAdsAdapter } from './adapters/google-ads.adapter';
import { MarketingSyncService } from './marketing-sync.service';
import { GoogleSheetsService } from './google-sheets.service';

@Injectable()
export class MarketingService implements OnModuleInit {
  private readonly logger = new Logger(MarketingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly metaLeads: MetaLeadsService,
    private readonly registry: PlatformAdapterRegistry,
    private readonly syncService: MarketingSyncService,
    private readonly googleSheets: GoogleSheetsService,
  ) {}

  async onModuleInit() {
    try {
      await this.ensureSettingsTable();
      await this.ensurePlatforms();
      await this.loadSettingsOnBoot();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Could not seed marketing platforms: ${message}`);
    }
    this.syncService.startHourlySweep();
  }

  async ensurePlatforms() {
    for (const row of DEFAULT_MARKETING_PLATFORMS) {
      await this.prisma.marketingPlatform.upsert({
        where: { key: row.key },
        create: {
          key: row.key,
          name: row.name,
          description: row.description,
          sortOrder: row.sortOrder,
          enabled: row.enabled,
          supportsOAuth: row.supportsOAuth,
          supportsWebhook: row.supportsWebhook,
        },
        update: {
          name: row.name,
          description: row.description,
          sortOrder: row.sortOrder,
          enabled: true,
          supportsOAuth: row.supportsOAuth,
          supportsWebhook: row.supportsWebhook,
        },
      });
    }
    // Clean up obsolete/unsupported platforms with no connections
    try {
      await this.prisma.marketingPlatform.deleteMany({
        where: {
          key: { notIn: ACTIVE_MARKETING_PLATFORM_KEYS },
          connections: { none: {} },
        },
      });
    } catch {
      // Ignore if relations prevent deletion
    }
    // Hide any remaining non-active platforms from Connected Apps
    await this.prisma.marketingPlatform.updateMany({
      where: { key: { notIn: ACTIVE_MARKETING_PLATFORM_KEYS } },
      data: { enabled: false },
    });
  }

  // --- Marketing Credentials & Settings Storage ------------------------------

  private async ensureSettingsTable() {
    try {
      await this.prisma.$executeRawUnsafe(
        `CREATE SCHEMA IF NOT EXISTS "identity";`,
      );
      await this.prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "identity"."marketing_settings" (
          "id" TEXT NOT NULL DEFAULT 'default',
          "meta_app_id" TEXT,
          "meta_app_secret" TEXT,
          "meta_webhook_verify_token" TEXT,
          "google_client_id" TEXT,
          "google_client_secret" TEXT,
          "google_ads_client_id" TEXT,
          "google_ads_client_secret" TEXT,
          "google_ads_developer_token" TEXT,
          "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "marketing_settings_pkey" PRIMARY KEY ("id")
        );
      `);
      try {
        await this.prisma.$executeRawUnsafe(
          `ALTER TABLE "identity"."marketing_settings" ADD COLUMN IF NOT EXISTS "google_client_id" TEXT;`,
        );
      } catch {}
      try {
        await this.prisma.$executeRawUnsafe(
          `ALTER TABLE "identity"."marketing_settings" ADD COLUMN IF NOT EXISTS "google_client_secret" TEXT;`,
        );
      } catch {}
    } catch (err: unknown) {
      this.logger.warn(`Could not verify marketing_settings table: ${err}`);
    }
  }

  async loadSettingsOnBoot() {
    try {
      await this.ensureSettingsTable();
      const rows: any[] = await this.prisma.$queryRawUnsafe(`
        SELECT * FROM "identity"."marketing_settings" WHERE "id" = 'default' LIMIT 1
      `);
      if (rows && rows.length > 0) {
        const r = rows[0];
        const metaAppId =
          typeof r.meta_app_id === 'string'
            ? r.meta_app_id
            : (process.env.META_APP_ID ?? '');
        const metaAppSecret =
          typeof r.meta_app_secret === 'string'
            ? r.meta_app_secret
            : (process.env.META_APP_SECRET ?? '');
        const metaWebhookVerifyToken =
          typeof r.meta_webhook_verify_token === 'string'
            ? r.meta_webhook_verify_token
            : (process.env.META_WEBHOOK_VERIFY_TOKEN ?? '');
        const googleAdsClientId =
          typeof r.google_ads_client_id === 'string' && r.google_ads_client_id
            ? r.google_ads_client_id
            : (typeof r.google_client_id === 'string' && r.google_client_id
                ? r.google_client_id
                : (process.env.GOOGLE_ADS_CLIENT_ID ?? ''));
        const googleAdsClientSecret =
          typeof r.google_ads_client_secret === 'string' && r.google_ads_client_secret
            ? r.google_ads_client_secret
            : (typeof r.google_client_secret === 'string' && r.google_client_secret
                ? r.google_client_secret
                : (process.env.GOOGLE_ADS_CLIENT_SECRET ?? ''));
        const googleAdsDeveloperToken =
          typeof r.google_ads_developer_token === 'string'
            ? r.google_ads_developer_token
            : (process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? '');

        this.metaLeads.setCredentials(
          metaAppId,
          metaAppSecret,
          metaWebhookVerifyToken,
        );
        const googleAds = this.registry.get('google_ads') as
          | GoogleAdsAdapter
          | undefined;
        if (googleAds?.setCredentials) {
          googleAds.setCredentials(
            googleAdsClientId,
            googleAdsClientSecret,
            googleAdsDeveloperToken,
          );
        }
        process.env.GOOGLE_ADS_CLIENT_ID = googleAdsClientId;
        process.env.GOOGLE_ADS_CLIENT_SECRET = googleAdsClientSecret;
        process.env.GOOGLE_ADS_DEVELOPER_TOKEN = googleAdsDeveloperToken;
        process.env.META_APP_ID = metaAppId;
        process.env.META_APP_SECRET = metaAppSecret;
        process.env.META_WEBHOOK_VERIFY_TOKEN = metaWebhookVerifyToken;
      }
    } catch (err: unknown) {
      this.logger.warn(`Could not load marketing settings: ${err}`);
    }
  }

  async getMarketingCredentials() {
    await this.ensureSettingsTable();
    let row: any = null;
    try {
      const rows: any[] = await this.prisma.$queryRawUnsafe(`
        SELECT * FROM "identity"."marketing_settings" WHERE "id" = 'default' LIMIT 1
      `);
      if (rows && rows.length > 0) {
        row = rows[0];
      }
    } catch (err: unknown) {
      this.logger.warn(`Could not read marketing_settings: ${err}`);
    }

    const metaAppId =
      row && typeof row.meta_app_id === 'string'
        ? row.meta_app_id
        : (process.env.META_APP_ID ?? '');
    const metaAppSecret =
      row && typeof row.meta_app_secret === 'string'
        ? row.meta_app_secret
        : (process.env.META_APP_SECRET ?? '');
    const metaWebhookVerifyToken =
      row && typeof row.meta_webhook_verify_token === 'string'
        ? row.meta_webhook_verify_token
        : (process.env.META_WEBHOOK_VERIFY_TOKEN ?? '');
    const googleClientId =
      row && typeof row.google_client_id === 'string'
        ? row.google_client_id
        : (row && typeof row.google_ads_client_id === 'string'
            ? row.google_ads_client_id
            : (process.env.GOOGLE_CLIENT_ID ?? ''));
    const googleClientSecret =
      row && typeof row.google_client_secret === 'string'
        ? row.google_client_secret
        : (row && typeof row.google_ads_client_secret === 'string'
            ? row.google_ads_client_secret
            : (process.env.GOOGLE_CLIENT_SECRET ?? ''));
    const googleAdsClientId =
      row && typeof row.google_ads_client_id === 'string'
        ? row.google_ads_client_id
        : (row && typeof row.google_client_id === 'string'
            ? row.google_client_id
            : (process.env.GOOGLE_ADS_CLIENT_ID ?? ''));
    const googleAdsClientSecret =
      row && typeof row.google_ads_client_secret === 'string'
        ? row.google_ads_client_secret
        : (row && typeof row.google_client_secret === 'string'
            ? row.google_client_secret
            : (process.env.GOOGLE_ADS_CLIENT_SECRET ?? ''));
    const googleAdsDeveloperToken =
      row && typeof row.google_ads_developer_token === 'string'
        ? row.google_ads_developer_token
        : (process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? '');

    return {
      metaAppId,
      metaAppSecret,
      metaWebhookVerifyToken,
      googleClientId,
      googleClientSecret,
      googleAdsClientId,
      googleAdsClientSecret,
      googleAdsDeveloperToken,
      metaConfigured: Boolean(metaAppId && metaAppSecret),
      googleAuthConfigured: Boolean((googleClientId || googleAdsClientId) && (googleClientSecret || googleAdsClientSecret)),
      googleAdsConfigured: Boolean(googleAdsClientId && googleAdsClientSecret),
    };
  }

  async updateMarketingCredentials(dto: UpdateMarketingCredentialsDto) {
    await this.ensureSettingsTable();
    const current = await this.getMarketingCredentials();

    const metaAppId = dto.metaAppId !== undefined ? dto.metaAppId.trim() : current.metaAppId;
    const metaAppSecret = dto.metaAppSecret !== undefined ? dto.metaAppSecret.trim() : current.metaAppSecret;
    const metaWebhookVerifyToken = dto.metaWebhookVerifyToken !== undefined ? dto.metaWebhookVerifyToken.trim() : current.metaWebhookVerifyToken;
    const googleClientId =
      dto.googleClientId !== undefined
        ? dto.googleClientId.trim()
        : (dto.googleAdsClientId !== undefined ? dto.googleAdsClientId.trim() : current.googleClientId);
    const googleClientSecret =
      dto.googleClientSecret !== undefined
        ? dto.googleClientSecret.trim()
        : (dto.googleAdsClientSecret !== undefined ? dto.googleAdsClientSecret.trim() : current.googleClientSecret);
    const googleAdsClientId =
      dto.googleAdsClientId !== undefined
        ? dto.googleAdsClientId.trim()
        : (dto.googleClientId !== undefined ? dto.googleClientId.trim() : current.googleAdsClientId);
    const googleAdsClientSecret =
      dto.googleAdsClientSecret !== undefined
        ? dto.googleAdsClientSecret.trim()
        : (dto.googleClientSecret !== undefined ? dto.googleClientSecret.trim() : current.googleAdsClientSecret);
    const googleAdsDeveloperToken = dto.googleAdsDeveloperToken !== undefined ? dto.googleAdsDeveloperToken.trim() : current.googleAdsDeveloperToken;

    await this.prisma.$executeRawUnsafe(`
      INSERT INTO "identity"."marketing_settings" (
        "id", "meta_app_id", "meta_app_secret", "meta_webhook_verify_token",
        "google_client_id", "google_client_secret",
        "google_ads_client_id", "google_ads_client_secret", "google_ads_developer_token", "updated_at"
      ) VALUES (
        'default', $1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP
      )
      ON CONFLICT ("id") DO UPDATE SET
        "meta_app_id" = EXCLUDED."meta_app_id",
        "meta_app_secret" = EXCLUDED."meta_app_secret",
        "meta_webhook_verify_token" = EXCLUDED."meta_webhook_verify_token",
        "google_client_id" = EXCLUDED."google_client_id",
        "google_client_secret" = EXCLUDED."google_client_secret",
        "google_ads_client_id" = EXCLUDED."google_ads_client_id",
        "google_ads_client_secret" = EXCLUDED."google_ads_client_secret",
        "google_ads_developer_token" = EXCLUDED."google_ads_developer_token",
        "updated_at" = CURRENT_TIMESTAMP;
    `, metaAppId, metaAppSecret, metaWebhookVerifyToken, googleClientId, googleClientSecret, googleAdsClientId, googleAdsClientSecret, googleAdsDeveloperToken);

    this.metaLeads.setCredentials(metaAppId, metaAppSecret, metaWebhookVerifyToken);
    const googleAds = this.registry.get('google_ads') as GoogleAdsAdapter | undefined;
    if (googleAds?.setCredentials) {
      googleAds.setCredentials(googleAdsClientId, googleAdsClientSecret, googleAdsDeveloperToken);
    }
    process.env.GOOGLE_ADS_CLIENT_ID = googleAdsClientId;
    process.env.GOOGLE_ADS_CLIENT_SECRET = googleAdsClientSecret;
    process.env.GOOGLE_ADS_DEVELOPER_TOKEN = googleAdsDeveloperToken;
    process.env.META_APP_ID = metaAppId;
    process.env.META_APP_SECRET = metaAppSecret;
    process.env.META_WEBHOOK_VERIFY_TOKEN = metaWebhookVerifyToken;

    return {
      metaAppId,
      metaAppSecret,
      metaWebhookVerifyToken,
      googleAdsClientId,
      googleAdsClientSecret,
      googleAdsDeveloperToken,
      metaConfigured: Boolean(metaAppId && metaAppSecret),
      googleAdsConfigured: Boolean(googleAdsClientId && googleAdsClientSecret),
    };
  }

  // --- Super Admin -----------------------------------------------------------

  async listPlatformsAdmin() {
    await this.ensurePlatforms();
    return this.prisma.marketingPlatform.findMany({
      where: { key: { in: ACTIVE_MARKETING_PLATFORM_KEYS } },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async updatePlatform(id: string, dto: UpdateMarketingPlatformDto) {
    const existing = await this.prisma.marketingPlatform.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('Platform not found');
    return this.prisma.marketingPlatform.update({
      where: { id },
      data: {
        ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}),
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description }
          : {}),
      },
    });
  }

  async createPlatform(dto: CreateMarketingPlatformDto) {
    const key = dto.key.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
    const name = dto.name.trim();
    if (!key || !name) {
      throw new BadRequestException('key and name are required');
    }
    const maxSort = await this.prisma.marketingPlatform.aggregate({
      _max: { sortOrder: true },
    });
    try {
      return await this.prisma.marketingPlatform.create({
        data: {
          key,
          name,
          description: dto.description?.trim() || null,
          enabled: dto.enabled ?? true,
          supportsOAuth: dto.supportsOAuth ?? false,
          supportsWebhook: dto.supportsWebhook ?? false,
          sortOrder: (maxSort._max.sortOrder ?? 0) + 10,
        },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException(`Platform key "${key}" already exists`);
      }
      throw err;
    }
  }

  async deletePlatform(id: string) {
    const existing = await this.prisma.marketingPlatform.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('Platform not found');
    const connections = await this.prisma.marketingConnection.count({
      where: { platformKey: existing.key },
    });
    if (connections > 0) {
      throw new BadRequestException(
        'Disconnect all organisation accounts for this platform before deleting.',
      );
    }
    await this.prisma.marketingPlatform.delete({ where: { id } });
    return { ok: true };
  }

  async listOrgAccess() {
    return this.prisma.marketingOrgPlatformAccess.findMany({
      include: {
        organisation: { select: { id: true, name: true, slug: true } },
        platform: { select: { key: true, name: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 500,
    });
  }

  async upsertOrgAccess(dto: UpdateOrgPlatformAccessDto) {
    await this.ensurePlatforms();
    const platform = await this.prisma.marketingPlatform.findUnique({
      where: { key: dto.platformKey },
    });
    if (!platform) throw new NotFoundException('Platform not found');
    const org = await this.prisma.organisation.findUnique({
      where: { id: dto.orgId },
      select: { id: true },
    });
    if (!org) throw new NotFoundException('Organisation not found');

    return this.prisma.marketingOrgPlatformAccess.upsert({
      where: {
        orgId_platformKey: {
          orgId: dto.orgId,
          platformKey: dto.platformKey,
        },
      },
      create: {
        orgId: dto.orgId,
        platformKey: dto.platformKey,
        allowed: dto.allowed,
      },
      update: { allowed: dto.allowed },
    });
  }

  async listSyncLogs(params?: {
    status?: string;
    platformKey?: string;
    limit?: number;
  }) {
    const limit = Math.min(Math.max(params?.limit ?? 50, 1), 200);
    return this.prisma.marketingSyncLog.findMany({
      where: {
        ...(params?.status ? { status: params.status } : {}),
        ...(params?.platformKey ? { platformKey: params.platformKey } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  // --- Org -------------------------------------------------------------------

  private platformCategory(key: string): string {
    return this.registry.category(key);
  }

  private platformConfigured(key: string): boolean {
    return this.registry.isConfigured(key);
  }

  private frontendUrl() {
    return (process.env.FRONTEND_URL ?? 'http://localhost:3001').replace(
      /\/$/,
      '',
    );
  }

  private apiPublicUrl() {
    const explicit = (process.env.BACKEND_PUBLIC_URL ?? '').trim();
    if (explicit) return explicit.replace(/\/$/, '');
    return `${this.frontendUrl()}/api`;
  }

  async listPlatformsForOrg(orgId: string) {
    await this.ensurePlatforms();
    const [platforms, connections, access, leadsByPlatform, campaigns] =
      await Promise.all([
        this.prisma.marketingPlatform.findMany({
          where: { enabled: true },
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        }),
        this.prisma.marketingConnection.findMany({
          where: { orgId },
          include: { project: { select: { id: true, name: true } } },
          orderBy: { connectedAt: 'desc' },
        }),
        this.prisma.marketingOrgPlatformAccess.findMany({
          where: { orgId },
        }),
        this.prisma.lead.groupBy({
          by: ['platform'],
          where: { orgId },
          _count: { _all: true },
        }),
        this.prisma.marketingCampaign.findMany({
          where: { orgId },
          select: {
            platformKey: true,
            spend: true,
            clicks: true,
            impressions: true,
            leadsCount: true,
          },
        }),
      ]);

    const accessMap = new Map(access.map((a) => [a.platformKey, a.allowed]));
    const byPlatform = new Map<string, typeof connections>();
    for (const c of connections) {
      const list = byPlatform.get(c.platformKey) ?? [];
      list.push(c);
      byPlatform.set(c.platformKey, list);
    }

    const leadCountMap = new Map(
      leadsByPlatform.map((r) => [r.platform ?? 'unknown', r._count._all]),
    );
    // Instagram / WhatsApp leads may be stored as meta/facebook — attribute
    // shared Meta Graph leads onto sibling cards when those have no own rows.
    const metaLeadAliases = ['meta', 'facebook', 'fb'];
    const metaLeadTotal = metaLeadAliases.reduce(
      (n, k) => n + (leadCountMap.get(k) ?? 0),
      0,
    );

    const campaignAgg = new Map<
      string,
      { spend: number; clicks: number; impressions: number; leads: number }
    >();
    for (const c of campaigns) {
      const cur = campaignAgg.get(c.platformKey) ?? {
        spend: 0,
        clicks: 0,
        impressions: 0,
        leads: 0,
      };
      cur.spend += Number(c.spend ?? 0);
      cur.clicks += Number(c.clicks ?? 0);
      cur.impressions += Number(c.impressions ?? 0);
      cur.leads += c.leadsCount ?? 0;
      campaignAgg.set(c.platformKey, cur);
    }

    const metaConns = byPlatform.get('meta') ?? [];
    const metaConnected = metaConns.some((c) => c.status === 'connected');

    return platforms
      .filter((p) => accessMap.get(p.key) !== false)
      .map((p) => {
        let conns = (byPlatform.get(p.key) ?? []).map((c) =>
          this.toPublicConnection(c),
        );
        // Instagram / WhatsApp Ads share Meta Page OAuth — surface Meta
        // accounts when the sibling has no dedicated rows yet.
        if (
          (p.key === 'instagram' || p.key === 'whatsapp') &&
          conns.length === 0 &&
          metaConnected
        ) {
          conns = metaConns.map((c) => this.toPublicConnection(c));
        }

        const metrics = campaignAgg.get(p.key) ?? {
          spend: 0,
          clicks: 0,
          impressions: 0,
          leads: 0,
        };
        let leadsCount = leadCountMap.get(p.key) ?? 0;
        if (
          (p.key === 'instagram' || p.key === 'whatsapp' || p.key === 'meta') &&
          leadsCount === 0
        ) {
          leadsCount =
            p.key === 'meta'
              ? metaLeadTotal
              : leadCountMap.get(p.key) ?? 0;
        }
        const effectiveLeads = Math.max(leadsCount, metrics.leads);
        const conversionRate =
          metrics.clicks > 0
            ? Math.round((effectiveLeads / metrics.clicks) * 1000) / 10
            : effectiveLeads > 0
              ? 100
              : 0;

        const ready =
          p.key === 'meta' ||
          p.key === 'instagram' ||
          p.key === 'whatsapp' ||
          this.platformConfigured(p.key);

        const connected =
          conns.some((c) => c.status === 'connected') ||
          (p.key === 'instagram' && metaConnected) ||
          (p.key === 'whatsapp' && metaConnected);

        return {
          key: p.key,
          name: p.name,
          description: p.description,
          supportsOAuth: p.supportsOAuth,
          supportsWebhook: p.supportsWebhook,
          category: this.platformCategory(p.key),
          configured: this.platformConfigured(p.key),
          ready,
          connections: conns,
          connectionCount: conns.length,
          lastSyncAt:
            conns
              .map((c) => c.lastSyncAt)
              .filter(Boolean)
              .sort()
              .at(-1) ?? null,
          status: conns.some((c) => c.status === 'error')
            ? 'error'
            : connected
              ? 'connected'
              : 'disconnected',
          metrics: {
            leadsCount: effectiveLeads,
            spend: metrics.spend,
            clicks: metrics.clicks,
            impressions: metrics.impressions,
            conversionRate,
          },
        };
      });
  }

  async appsOverview(orgId: string) {
    const platforms = await this.listPlatformsForOrg(orgId);
    const connected = platforms.filter((p) => p.status === 'connected');
    const monthAgo = new Date();
    monthAgo.setDate(monthAgo.getDate() - 30);
    const newConnections = await this.prisma.marketingConnection.count({
      where: { orgId, connectedAt: { gte: monthAgo } },
    });

    const totalLeads = platforms.reduce(
      (n, p) => n + (p.metrics?.leadsCount ?? 0),
      0,
    );
    const spend = platforms.reduce((n, p) => n + (p.metrics?.spend ?? 0), 0);
    const clicks = platforms.reduce((n, p) => n + (p.metrics?.clicks ?? 0), 0);
    const impressions = platforms.reduce(
      (n, p) => n + (p.metrics?.impressions ?? 0),
      0,
    );
    const conversionRate =
      clicks > 0 ? Math.round((totalLeads / clicks) * 1000) / 10 : 0;

    return {
      kpis: {
        connectedApps: connected.length,
        newConnectionsThisMonth: newConnections,
        totalLeads,
        spend,
        clicks,
        impressions,
        conversionRate,
      },
      platforms,
    };
  }

  async getPlatformDetail(orgId: string, platformKey: string) {
    const platforms = await this.listPlatformsForOrg(orgId);
    const platform = platforms.find((p) => p.key === platformKey);
    if (!platform) throw new NotFoundException('Platform not available');
    return {
      ...platform,
      metaConfig:
        platformKey === 'meta' ||
        platformKey === 'instagram' ||
        platformKey === 'whatsapp'
          ? this.metaLeads.getPublicConfig()
          : null,
      oauthConfigured: this.platformConfigured(platformKey),
    };
  }

  async getConnectUrl(orgId: string, userId: string, platformKey: string) {
    const adapter = this.registry.get(platformKey);
    if (!adapter?.getConnectUrl) {
      throw new ServiceUnavailableException(
        `${platformDisplayLabel(platformKey)} OAuth is not available. Configure API credentials in Admin Console > Marketing, or connect with an access token on the app detail page.`,
      );
    }
    return adapter.getConnectUrl(orgId, userId);
  }

  async syncConnection(orgId: string, connectionId: string) {
    return this.syncService.syncConnection(orgId, connectionId);
  }

  async syncPlatform(orgId: string, platformKey: string) {
    return this.syncService.syncPlatform(orgId, platformKey);
  }

  /** Manual token / account connect — Meta family goes through adapters. */
  async connectWithCredentials(
    orgId: string,
    userId: string,
    platformKey: string,
    input: {
      externalAccountId: string;
      externalAccountName?: string;
      accessToken: string;
      refreshToken?: string;
      projectId?: string | null;
      metadata?: Record<string, unknown>;
    },
  ) {
    await this.ensurePlatforms();
    const platform = await this.prisma.marketingPlatform.findFirst({
      where: { key: platformKey, enabled: true },
    });
    if (!platform) throw new NotFoundException('Platform not available');

    const adapter = this.registry.get(platformKey);
    if (adapter?.connectCredentials) {
      const result = await adapter.connectCredentials(orgId, userId, input);
      const row = await this.prisma.marketingConnection.findFirst({
        where: { id: result.connectionId, orgId },
      });
      if (row) return this.toPublicConnection(row);
    }

    if (input.projectId) {
      const project = await this.prisma.project.findFirst({
        where: { id: input.projectId, orgId },
        select: { id: true },
      });
      if (!project) throw new NotFoundException('Project not found');
    }

    const accountId = input.externalAccountId.trim();
    if (!accountId || !input.accessToken.trim()) {
      throw new BadRequestException(
        'Account ID and access token are required',
      );
    }

    const row = await this.prisma.marketingConnection.upsert({
      where: {
        orgId_platformKey_externalAccountId: {
          orgId,
          platformKey,
          externalAccountId: accountId,
        },
      },
      create: {
        orgId,
        platformKey,
        status: 'connected',
        externalAccountId: accountId,
        externalAccountName:
          input.externalAccountName?.trim() || accountId,
        accessToken: input.accessToken.trim(),
        refreshToken: input.refreshToken?.trim() || null,
        projectId: input.projectId ?? null,
        connectedBy: userId,
        lastSyncAt: new Date(),
        metadata: (input.metadata ?? { via: 'manual_token' }) as Prisma.InputJsonValue,
      },
      update: {
        status: 'connected',
        externalAccountName:
          input.externalAccountName?.trim() || accountId,
        accessToken: input.accessToken.trim(),
        refreshToken: input.refreshToken?.trim() || null,
        projectId: input.projectId ?? null,
        connectedBy: userId,
        lastSyncAt: new Date(),
        lastError: null,
        metadata: (input.metadata ?? { via: 'manual_token' }) as Prisma.InputJsonValue,
      },
    });

    await this.writeSyncLog({
      orgId,
      connectionId: row.id,
      platformKey,
      status: 'success',
      message: `Connected ${row.externalAccountName}`,
    });

    return this.toPublicConnection(row);
  }

  async listOrgSyncLogs(orgId: string, limit = 50) {
    return this.prisma.marketingSyncLog.findMany({
      where: { orgId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 200),
    });
  }

  async handleGoogleOAuthCallback(code: string, state: string) {
    let parsedState: { orgId?: string; userId?: string; platformKey?: string } = {};
    try {
      parsedState = JSON.parse(Buffer.from(state, 'base64url').toString('utf8'));
    } catch {}

    if (parsedState.platformKey === 'google_sheets') {
      return this.googleSheets.handleOAuthCallback(code, state);
    }

    return this.finishGenericOAuth({
      code,
      state,
      platformKeyFallback: 'google_ads',
      tokenExchange: async (parsed) => {
        const creds = await this.getMarketingCredentials();
        const clientId = creds.googleAdsClientId;
        const clientSecret = creds.googleAdsClientSecret;
        const redirectUri = `${this.apiPublicUrl()}/org/marketing/oauth/google/callback`;
        const body = new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        });
        const res = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body,
        });
        const json = (await res.json()) as {
          access_token?: string;
          refresh_token?: string;
          error?: string;
        };
        if (!res.ok || !json.access_token) {
          throw new ServiceUnavailableException(
            json.error ?? 'Google token exchange failed',
          );
        }
        let userEmail = '';
        try {
          const userRes = await fetch(
            'https://www.googleapis.com/oauth2/v2/userinfo',
            { headers: { Authorization: `Bearer ${json.access_token}` } },
          );
          if (userRes.ok) {
            const u = (await userRes.json()) as { email?: string };
            userEmail = u.email ?? '';
          }
        } catch {}

        const platformKey = 'google_ads';
        const externalAccountId = userEmail
          ? `gads:${userEmail.trim().toLowerCase()}`
          : `gads:${parsed.orgId}:${Date.now()}`;
        const externalAccountName = userEmail
          ? `Google Ads (${userEmail})`
          : 'Google Ads Account';

        return {
          orgId: parsed.orgId!,
          userId: parsed.userId,
          platformKey,
          accessToken: json.access_token,
          refreshToken: json.refresh_token,
          externalAccountId,
          externalAccountName,
        };
      },
    });
  }

  private async finishGenericOAuth(input: {
    code: string;
    state: string;
    platformKeyFallback: string;
    tokenExchange: (parsed: {
      orgId?: string;
      userId?: string;
      platformKey?: string;
    }) => Promise<{
      orgId: string;
      userId?: string;
      platformKey: string;
      accessToken: string;
      refreshToken?: string;
      externalAccountId: string;
      externalAccountName: string;
    }>;
  }) {
    let parsed: { orgId?: string; userId?: string; platformKey?: string };
    try {
      parsed = JSON.parse(
        Buffer.from(input.state, 'base64url').toString('utf8'),
      ) as { orgId?: string; userId?: string; platformKey?: string };
    } catch {
      throw new ServiceUnavailableException('Invalid OAuth state');
    }
    if (!parsed.orgId) {
      throw new ServiceUnavailableException('Invalid OAuth state');
    }
    const token = await input.tokenExchange(parsed);
    const row = await this.connectWithCredentials(
      token.orgId,
      token.userId ?? 'oauth',
      token.platformKey || input.platformKeyFallback,
      {
        externalAccountId: token.externalAccountId,
        externalAccountName: token.externalAccountName,
        accessToken: token.accessToken,
        refreshToken: token.refreshToken,
        metadata: { via: 'oauth' },
      },
    );
    const key = token.platformKey || input.platformKeyFallback;
    return {
      connection: row,
      redirectTo: `${this.frontendUrl()}/org/marketing/apps/${key}?connected=1`,
    };
  }

  async listConnections(orgId: string, platformKey?: string) {
    const rows = await this.prisma.marketingConnection.findMany({
      where: {
        orgId,
        ...(platformKey ? { platformKey } : {}),
      },
      include: { project: { select: { id: true, name: true } } },
      orderBy: { connectedAt: 'desc' },
    });
    return rows.map((r) => ({
      ...this.toPublicConnection(r),
      project: r.project,
    }));
  }

  async updateConnection(
    orgId: string,
    id: string,
    dto: UpdateMarketingConnectionDto,
  ) {
    const existing = await this.prisma.marketingConnection.findFirst({
      where: { id, orgId },
    });
    if (!existing) throw new NotFoundException('Connection not found');
    if (dto.projectId) {
      const project = await this.prisma.project.findFirst({
        where: { id: dto.projectId, orgId },
        select: { id: true },
      });
      if (!project) throw new NotFoundException('Project not found');
    }
    const row = await this.prisma.marketingConnection.update({
      where: { id },
      data: {
        projectId:
          dto.projectId === undefined ? existing.projectId : dto.projectId,
        ...(dto.externalAccountName !== undefined && dto.externalAccountName.trim()
          ? { externalAccountName: dto.externalAccountName.trim() }
          : {}),
      },
      include: { project: { select: { id: true, name: true } } },
    });

    // Keep legacy MetaPageConnection in sync when present.
    if (
      row.platformKey === 'meta' ||
      row.platformKey === 'instagram' ||
      row.platformKey === 'whatsapp'
    ) {
      await this.prisma.metaPageConnection
        .updateMany({
          where: { orgId, pageId: row.externalAccountId },
          data: {
            projectId: row.projectId,
            ...(dto.externalAccountName !== undefined && dto.externalAccountName.trim()
              ? { pageName: dto.externalAccountName.trim() }
              : {}),
          },
        })
        .catch(() => undefined);
      await this.prisma.marketingConnection
        .updateMany({
          where: {
            orgId,
            externalAccountId: row.externalAccountId,
            platformKey: { in: ['meta', 'instagram', 'whatsapp'] },
            id: { not: row.id },
          },
          data: { projectId: row.projectId },
        })
        .catch(() => undefined);
    }

    return { ...this.toPublicConnection(row), project: row.project };
  }

  async disconnect(orgId: string, id: string) {
    const existing = await this.prisma.marketingConnection.findFirst({
      where: { id, orgId },
    });
    if (!existing) throw new NotFoundException('Connection not found');

    const adapter = this.registry.get(existing.platformKey);
    if (adapter?.disconnect) {
      await adapter.disconnect({
        id: existing.id,
        orgId: existing.orgId,
        platformKey: existing.platformKey,
        status: existing.status,
        externalAccountId: existing.externalAccountId,
        externalAccountName: existing.externalAccountName,
        accessToken: existing.accessToken,
        refreshToken: existing.refreshToken,
        projectId: existing.projectId,
        metadata: existing.metadata,
        lastSyncAt: existing.lastSyncAt,
      });
    } else {
      await this.prisma.marketingConnection.delete({ where: { id } });
    }

    await this.writeSyncLog({
      orgId,
      connectionId: null,
      platformKey: existing.platformKey,
      status: 'success',
      message: `Disconnected ${existing.externalAccountName}`,
    });
    return { ok: true };
  }

  async dashboard(orgId: string) {
    const since = new Date();
    since.setDate(since.getDate() - 30);

    const [
      totalLeads,
      wonLeads,
      prevTotalLeads,
      byPlatform,
      bySource,
      byCampaign,
      byAd,
      campaigns,
      recentLeads,
      platforms,
    ] = await Promise.all([
      this.prisma.lead.count({ where: { orgId } }),
      this.prisma.lead.count({ where: { orgId, status: 'won' } }),
      this.prisma.lead.count({
        where: {
          orgId,
          createdAt: {
            gte: new Date(since.getTime() - 30 * 24 * 60 * 60 * 1000),
            lt: since,
          },
        },
      }),
      this.prisma.lead.groupBy({
        by: ['platform'],
        where: { orgId },
        _count: { _all: true },
      }),
      this.prisma.lead.groupBy({
        by: ['source'],
        where: { orgId },
        _count: { _all: true },
      }),
      this.prisma.lead.groupBy({
        by: ['campaign'],
        where: { orgId, campaign: { not: null } },
        _count: { _all: true },
      }),
      this.prisma.lead.groupBy({
        by: ['ad'],
        where: { orgId, ad: { not: null } },
        _count: { _all: true },
      }),
      this.prisma.marketingCampaign.findMany({
        where: { orgId },
        orderBy: { spend: 'desc' },
        take: 25,
      }),
      this.prisma.lead.findMany({
        where: { orgId, createdAt: { gte: since } },
        select: { createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),
      this.listPlatformsForOrg(orgId),
    ]);

    const periodLeads = recentLeads.length;
    const spend = campaigns.reduce(
      (sum, c) => sum + Number(c.spend ?? 0),
      0,
    );
    const clicks = campaigns.reduce(
      (sum, c) => sum + Number(c.clicks ?? 0),
      0,
    );
    const impressions = campaigns.reduce(
      (sum, c) => sum + Number(c.impressions ?? 0),
      0,
    );
    const cpl = totalLeads > 0 ? spend / totalLeads : 0;
    const conversionRate =
      totalLeads > 0 ? Math.round((wonLeads / totalLeads) * 1000) / 10 : 0;

    const pctChange = (curr: number, prev: number) => {
      if (prev <= 0) return curr > 0 ? 100 : 0;
      return Math.round(((curr - prev) / prev) * 1000) / 10;
    };

    // Daily lead trend for last 30 days
    const dayMap = new Map<string, number>();
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      dayMap.set(d.toISOString().slice(0, 10), 0);
    }
    for (const lead of recentLeads) {
      const key = lead.createdAt.toISOString().slice(0, 10);
      if (dayMap.has(key)) dayMap.set(key, (dayMap.get(key) ?? 0) + 1);
    }
    const leadTrend = [...dayMap.entries()].map(([date, count]) => ({
      date,
      count,
    }));

    const campaignLeadCounts = new Map(
      byCampaign
        .filter((r) => r.campaign)
        .map((r) => [r.campaign as string, r._count._all]),
    );

    return {
      kpis: {
        totalLeads,
        convertedLeads: wonLeads,
        spend,
        clicks,
        impressions,
        cpl,
        conversionRate,
        revenue: 0,
        totalLeadsChange: pctChange(periodLeads, prevTotalLeads),
        convertedChange: 0,
        spendChange: 0,
        clicksChange: 0,
        impressionsChange: 0,
        cplChange: 0,
        conversionChange: 0,
      },
      leadsByPlatform: byPlatform.map((r) => ({
        key: r.platform ?? 'unknown',
        label: platformDisplayLabel(r.platform),
        count: r._count._all,
      })),
      leadsBySource: bySource
        .filter((r) => r.source)
        .map((r) => ({
          key: r.source as string,
          label: platformDisplayLabel(null, r.source),
          count: r._count._all,
        })),
      leadsByCampaign: byCampaign
        .filter((r) => r.campaign)
        .slice(0, 20)
        .map((r) => ({
          key: r.campaign as string,
          label: r.campaign as string,
          count: r._count._all,
        })),
      leadsByAd: byAd
        .filter((r) => r.ad)
        .slice(0, 20)
        .map((r) => ({
          key: r.ad as string,
          label: r.ad as string,
          count: r._count._all,
        })),
      leadTrend,
      connectedApps: platforms.slice(0, 6).map((p) => ({
        key: p.key,
        name: p.name,
        status: p.status,
        ready: p.ready,
        connectionCount: p.connectionCount,
        lastSyncAt: p.lastSyncAt,
      })),
      campaignPerformance: campaigns.map((c) => {
        const leadsCount =
          campaignLeadCounts.get(c.name) ?? c.leadsCount ?? 0;
        return {
          id: c.id,
          name: c.name,
          platformKey: c.platformKey,
          status: c.status,
          spend: Number(c.spend),
          impressions: Number(c.impressions),
          clicks: Number(c.clicks),
          leadsCount,
          cpl: leadsCount > 0 ? Number(c.spend) / leadsCount : 0,
          conversion:
            leadsCount > 0
              ? Math.round((wonLeads / Math.max(totalLeads, 1)) * 1000) / 10
              : 0,
        };
      }),
      topCampaigns: [...campaigns]
        .sort(
          (a, b) =>
            (campaignLeadCounts.get(b.name) ?? b.leadsCount) -
            (campaignLeadCounts.get(a.name) ?? a.leadsCount),
        )
        .slice(0, 5)
        .map((c) => {
          const leadsCount =
            campaignLeadCounts.get(c.name) ?? c.leadsCount ?? 0;
          return {
            id: c.id,
            name: c.name,
            platformKey: c.platformKey,
            leadsCount,
            cpl: leadsCount > 0 ? Number(c.spend) / leadsCount : 0,
            conversion: 0,
          };
        }),
      connectionsCount: platforms.reduce((n, p) => n + p.connectionCount, 0),
    };
  }

  /** Mirror a Meta page connection into MarketingConnection after OAuth. */
  async upsertMetaConnection(input: {
    orgId: string;
    pageId: string;
    pageName: string;
    accessToken: string;
    projectId?: string | null;
    connectedBy?: string | null;
  }) {
    await this.ensurePlatforms();
    const row = await this.prisma.marketingConnection.upsert({
      where: {
        orgId_platformKey_externalAccountId: {
          orgId: input.orgId,
          platformKey: 'meta',
          externalAccountId: input.pageId,
        },
      },
      create: {
        orgId: input.orgId,
        platformKey: 'meta',
        status: 'connected',
        externalAccountId: input.pageId,
        externalAccountName: input.pageName,
        accessToken: input.accessToken,
        projectId: input.projectId ?? null,
        connectedBy: input.connectedBy ?? null,
        lastSyncAt: new Date(),
        lastError: null,
      },
      update: {
        status: 'connected',
        externalAccountName: input.pageName,
        accessToken: input.accessToken,
        projectId:
          input.projectId === undefined ? undefined : input.projectId,
        connectedBy: input.connectedBy ?? undefined,
        lastSyncAt: new Date(),
        lastError: null,
      },
    });
    await this.writeSyncLog({
      orgId: input.orgId,
      connectionId: row.id,
      platformKey: 'meta',
      status: 'success',
      message: `Connected Meta Page ${input.pageName}`,
    });
    return row;
  }

  async writeSyncLog(input: {
    orgId?: string | null;
    connectionId?: string | null;
    platformKey: string;
    status: 'success' | 'failed';
    message?: string;
    detail?: Prisma.InputJsonValue;
    direction?: string;
  }) {
    try {
      await this.prisma.marketingSyncLog.create({
        data: {
          orgId: input.orgId ?? null,
          connectionId: input.connectionId ?? null,
          platformKey: input.platformKey,
          status: input.status,
          message: input.message ?? null,
          detail: input.detail ?? undefined,
          direction: input.direction ?? 'inbound',
        },
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Failed to write sync log: ${message}`);
    }
  }

  private toPublicConnection(row: {
    id: string;
    orgId: string;
    platformKey: string;
    status: string;
    externalAccountId: string;
    externalAccountName: string;
    projectId: string | null;
    lastSyncAt: Date | null;
    lastError: string | null;
    connectedAt: Date;
    updatedAt: Date;
    metadata?: unknown;
  }) {
    return {
      id: row.id,
      orgId: row.orgId,
      platformKey: row.platformKey,
      status: row.status,
      externalAccountId: row.externalAccountId,
      externalAccountName: row.externalAccountName,
      projectId: row.projectId,
      lastSyncAt: row.lastSyncAt,
      lastError: row.lastError,
      connectedAt: row.connectedAt,
      updatedAt: row.updatedAt,
      metadata: (row as { metadata?: unknown }).metadata ?? null,
    };
  }
}
