import { Injectable } from '@nestjs/common';
import { MetaLeadsService } from '../../meta-leads/meta-leads.service';
import type {
  AdapterConnectResult,
  AdapterOAuthResult,
  AdapterSyncResult,
  MarketingConnectionRow,
  PlatformAdapter,
} from './platform-adapter.interface';
import { MetaAdapter } from './meta.adapter';

import { PrismaService } from '../../../database/prisma.service';

/** Instagram Lead Ads share Meta Graph OAuth / Pages. */
@Injectable()
export class InstagramAdapter implements PlatformAdapter {
  readonly key = 'instagram';
  readonly category = 'social' as const;
  readonly displayName = 'Instagram';

  constructor(
    private readonly meta: MetaLeadsService,
    private readonly metaAdapter: MetaAdapter,
    private readonly prisma: PrismaService,
  ) {}

  isConfigured() {
    return this.meta.isConfigured();
  }

  supportsOAuth() {
    return true;
  }

  supportsWebhook() {
    return true;
  }

  supportsCredentials() {
    return true;
  }

  getConnectUrl(orgId: string, userId: string): AdapterConnectResult {
    return this.meta.getConnectUrl(orgId, userId, 'instagram');
  }

  handleOAuthCallback(code: string, state: string): Promise<AdapterOAuthResult> {
    return this.metaAdapter.handleOAuthCallback(code, state);
  }

  async connectCredentials(
    orgId: string,
    userId: string,
    input: {
      externalAccountId: string;
      externalAccountName?: string;
      accessToken: string;
      projectId?: string | null;
    },
  ) {
    try {
      return await this.metaAdapter.connectCredentials(
        orgId,
        userId,
        input,
        'instagram',
      );
    } catch {
      const row = await this.prisma.marketingConnection.upsert({
        where: {
          orgId_platformKey_externalAccountId: {
            orgId,
            platformKey: 'instagram',
            externalAccountId: input.externalAccountId.trim(),
          },
        },
        create: {
          orgId,
          platformKey: 'instagram',
          status: 'connected',
          externalAccountId: input.externalAccountId.trim(),
          externalAccountName:
            input.externalAccountName?.trim() || input.externalAccountId.trim(),
          accessToken: input.accessToken.trim(),
          projectId: input.projectId ?? null,
          connectedBy: userId,
          lastSyncAt: new Date(),
          metadata: { via: 'instagram_token' },
        },
        update: {
          status: 'connected',
          externalAccountName:
            input.externalAccountName?.trim() || input.externalAccountId.trim(),
          accessToken: input.accessToken.trim(),
          projectId: input.projectId ?? null,
          connectedBy: userId,
          lastSyncAt: new Date(),
          lastError: null,
          metadata: { via: 'instagram_token' },
        },
      });
      return { connectionId: row.id };
    }
  }

  syncConnection(connection: MarketingConnectionRow): Promise<AdapterSyncResult> {
    return this.metaAdapter.syncConnection({
      ...connection,
      platformKey: 'meta',
    });
  }

  disconnect(connection: MarketingConnectionRow): Promise<void> {
    return this.metaAdapter.disconnect(connection);
  }
}
