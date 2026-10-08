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

/** WhatsApp Ads attribution rides Meta Page OAuth. */
@Injectable()
export class WhatsappAdapter implements PlatformAdapter {
  readonly key = 'whatsapp';
  readonly category = 'messaging' as const;
  readonly displayName = 'WhatsApp Ads';

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
    return false;
  }

  supportsCredentials() {
    return true;
  }

  getConnectUrl(orgId: string, userId: string): AdapterConnectResult {
    return this.meta.getConnectUrl(orgId, userId, 'whatsapp');
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
        'whatsapp',
      );
    } catch {
      const row = await this.prisma.marketingConnection.upsert({
        where: {
          orgId_platformKey_externalAccountId: {
            orgId,
            platformKey: 'whatsapp',
            externalAccountId: input.externalAccountId.trim(),
          },
        },
        create: {
          orgId,
          platformKey: 'whatsapp',
          status: 'connected',
          externalAccountId: input.externalAccountId.trim(),
          externalAccountName:
            input.externalAccountName?.trim() || input.externalAccountId.trim(),
          accessToken: input.accessToken.trim(),
          projectId: input.projectId ?? null,
          connectedBy: userId,
          lastSyncAt: new Date(),
          metadata: { via: 'whatsapp_token' },
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
          metadata: { via: 'whatsapp_token' },
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
