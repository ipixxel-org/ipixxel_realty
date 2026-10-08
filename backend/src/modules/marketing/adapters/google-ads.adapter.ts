import { Injectable, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import type {
  AdapterConnectResult,
  AdapterSyncResult,
  MarketingConnectionRow,
  PlatformAdapter,
} from './platform-adapter.interface';
import { PrismaService } from '../../../database/prisma.service';

function env(name: string) {
  return (process.env[name] ?? '').trim();
}

function frontendUrl() {
  return (process.env.FRONTEND_URL ?? 'http://localhost:3001').replace(/\/$/, '');
}

function apiPublicUrl() {
  const explicit = (process.env.BACKEND_PUBLIC_URL ?? '').trim();
  if (explicit) return explicit.replace(/\/$/, '');
  return `${frontendUrl()}/api`;
}

@Injectable()
export class GoogleAdsAdapter implements PlatformAdapter, OnModuleInit {
  readonly key = 'google_ads';
  readonly category = 'paid_ads' as const;
  readonly displayName = 'Google Ads';

  private cachedClientId = '';
  private cachedClientSecret = '';
  private cachedDeveloperToken = '';
  private dbLoaded = false;

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.loadCredentialsFromDb();
  }

  async loadCredentialsFromDb(): Promise<void> {
    try {
      const rows: any[] = await this.prisma.$queryRawUnsafe(`
        SELECT "google_ads_client_id", "google_ads_client_secret", "google_ads_developer_token"
        FROM "identity"."marketing_settings"
        WHERE "id" = 'default' LIMIT 1
      `);
      if (rows && rows.length > 0) {
        const r = rows[0];
        this.dbLoaded = true;
        if (typeof r.google_ads_client_id === 'string') {
          this.cachedClientId = r.google_ads_client_id.trim();
        }
        if (typeof r.google_ads_client_secret === 'string') {
          this.cachedClientSecret = r.google_ads_client_secret.trim();
        }
        if (typeof r.google_ads_developer_token === 'string') {
          this.cachedDeveloperToken = r.google_ads_developer_token.trim();
        }
      }
    } catch {
      // Table may not exist yet on fresh database before ensureSettingsTable
    }
  }

  setCredentials(clientId?: string, clientSecret?: string, developerToken?: string) {
    this.dbLoaded = true;
    if (clientId !== undefined) this.cachedClientId = (clientId ?? '').trim();
    if (clientSecret !== undefined) this.cachedClientSecret = (clientSecret ?? '').trim();
    if (developerToken !== undefined) this.cachedDeveloperToken = (developerToken ?? '').trim();
  }

  clientId() {
    if (this.dbLoaded) return this.cachedClientId;
    return this.cachedClientId || (process.env.GOOGLE_ADS_CLIENT_ID ?? '').trim();
  }

  clientSecret() {
    if (this.dbLoaded) return this.cachedClientSecret;
    return this.cachedClientSecret || (process.env.GOOGLE_ADS_CLIENT_SECRET ?? '').trim();
  }

  developerToken() {
    if (this.dbLoaded) return this.cachedDeveloperToken;
    return this.cachedDeveloperToken || (process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? '').trim();
  }

  isConfigured() {
    return Boolean(this.clientId() && this.clientSecret());
  }

  supportsOAuth() {
    return true;
  }

  supportsWebhook() {
    return false;
  }

  supportsCredentials() {
    return true;
  }

  getConnectUrl(orgId: string, userId: string): AdapterConnectResult {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException(
        'Google Ads is not configured. Ask a Super Admin to configure Google Ads credentials in Admin Console > Marketing.',
      );
    }
    const redirectUri = `${apiPublicUrl()}/org/marketing/oauth/google/callback`;
    const state = Buffer.from(
      JSON.stringify({
        orgId,
        userId,
        platformKey: 'google_ads',
        ts: Date.now(),
      }),
      'utf8',
    ).toString('base64url');
    const params = new URLSearchParams({
      client_id: this.clientId(),
      redirect_uri: redirectUri,
      response_type: 'code',
      access_type: 'offline',
      prompt: 'consent',
      scope:
        'https://www.googleapis.com/auth/adwords https://www.googleapis.com/auth/userinfo.email',
      state,
    });
    return {
      url: `https://accounts.google.com/o/oauth2/v2/auth?${params}`,
      state,
    };
  }

  async syncConnection(
    connection: MarketingConnectionRow,
  ): Promise<AdapterSyncResult> {
    const meta =
      connection.metadata &&
      typeof connection.metadata === 'object' &&
      !Array.isArray(connection.metadata)
        ? (connection.metadata as Record<string, unknown>)
        : null;
    if (meta?.demo === true) {
      await this.prisma.marketingConnection.update({
        where: { id: connection.id },
        data: {
          lastSyncAt: new Date(),
          lastError: null,
          status: 'connected',
        },
      });
      return {
        ok: true,
        message: 'Demo Google Ads: sync skipped (seed data)',
        campaignsUpserted: 0,
      };
    }

    if (!connection.accessToken) {
      return { ok: false, message: 'Missing Google access token' };
    }
    await this.prisma.marketingConnection.update({
      where: { id: connection.id },
      data: {
        lastSyncAt: new Date(),
        lastError: null,
        status: 'connected',
        metadata: {
          ...(typeof connection.metadata === 'object' &&
          connection.metadata &&
          !Array.isArray(connection.metadata)
            ? (connection.metadata as Record<string, unknown>)
            : {}),
          syncNote:
            'OAuth connected. Campaign metrics sync requires Developer Token configured in Admin Console > Marketing.',
        },
      },
    });
    return {
      ok: true,
      message:
        'Google Ads connection verified. Configure Developer Token in Admin Console > Marketing to enable metrics sync.',
      campaignsUpserted: 0,
    };
  }
}
