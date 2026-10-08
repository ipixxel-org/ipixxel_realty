import { Injectable } from '@nestjs/common';
import { MetaLeadsService } from '../../meta-leads/meta-leads.service';
import { PrismaService } from '../../../database/prisma.service';
import type {
  AdapterConnectResult,
  AdapterOAuthResult,
  AdapterSyncResult,
  MarketingConnectionRow,
  PlatformAdapter,
} from './platform-adapter.interface';

@Injectable()
export class MetaAdapter implements PlatformAdapter {
  readonly key = 'meta';
  readonly category = 'paid_ads' as const;
  readonly displayName = 'Facebook / Meta';

  constructor(
    private readonly meta: MetaLeadsService,
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
    return this.meta.getConnectUrl(orgId, userId, 'meta');
  }

  async handleOAuthCallback(
    code: string,
    state: string,
  ): Promise<AdapterOAuthResult> {
    const result = await this.meta.handleOAuthCallback(code, state);
    return {
      redirectTo: result.redirectTo,
      connected: result.connected,
    };
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
    platformKey = 'meta',
  ) {
    await this.meta.connectWithToken(orgId, userId, {
      pageId: input.externalAccountId,
      pageName: input.externalAccountName || input.externalAccountId,
      accessToken: input.accessToken,
      projectId: input.projectId ?? null,
    });
    const marketing = await this.prisma.marketingConnection.findFirst({
      where: {
        orgId,
        platformKey,
        externalAccountId: input.externalAccountId.trim(),
      },
      orderBy: { connectedAt: 'desc' },
    });
    return { connectionId: marketing?.id ?? input.externalAccountId };
  }

  async syncConnection(
    connection: MarketingConnectionRow,
  ): Promise<AdapterSyncResult> {
    if (!connection.accessToken) {
      return { ok: false, message: 'Missing Page access token' };
    }

    const meta =
      connection.metadata &&
      typeof connection.metadata === 'object' &&
      !Array.isArray(connection.metadata)
        ? (connection.metadata as Record<string, unknown>)
        : null;
    if (meta?.demo === true) {
      const now = new Date();
      await this.prisma.marketingConnection.update({
        where: { id: connection.id },
        data: { lastSyncAt: now, lastError: null, status: 'connected' },
      });
      await this.prisma.marketingConnection.updateMany({
        where: {
          orgId: connection.orgId,
          externalAccountId: connection.externalAccountId,
          platformKey: { in: ['instagram', 'whatsapp'] },
        },
        data: { lastSyncAt: now, lastError: null, status: 'connected' },
      });
      return {
        ok: true,
        message: `Demo Meta Page ${connection.externalAccountName}: sync skipped (seed data)`,
      };
    }

    try {
      const result = await this.meta.resyncPage(
        connection.externalAccountId,
        connection.accessToken,
      );
      const now = new Date();
      await this.prisma.marketingConnection.update({
        where: { id: connection.id },
        data: { lastSyncAt: now, lastError: null, status: 'connected' },
      });
      await this.prisma.marketingConnection.updateMany({
        where: {
          orgId: connection.orgId,
          externalAccountId: connection.externalAccountId,
          platformKey: { in: ['instagram', 'whatsapp'] },
        },
        data: { lastSyncAt: now, lastError: null, status: 'connected' },
      });
      const imported = result.imported ?? 0;
      return {
        ok: true,
        message:
          imported > 0
            ? `Meta Page ${connection.externalAccountName}: leadgen active, imported ${imported} lead(s)`
            : `Meta Page ${connection.externalAccountName}: leadgen active, no new leads to import`,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      await this.prisma.marketingConnection.update({
        where: { id: connection.id },
        data: { lastError: message, status: 'error' },
      });
      return { ok: false, message };
    }
  }

  async disconnect(connection: MarketingConnectionRow): Promise<void> {
    if (connection.platformKey === 'meta') {
      await this.prisma.marketingConnection.deleteMany({
        where: {
          orgId: connection.orgId,
          externalAccountId: connection.externalAccountId,
          platformKey: 'meta',
        },
      });
      const page = await this.prisma.metaPageConnection.findFirst({
        where: {
          orgId: connection.orgId,
          pageId: connection.externalAccountId,
        },
      });
      if (page) {
        await this.prisma.metaPageConnection.delete({ where: { id: page.id } });
      }
    } else {
      await this.prisma.marketingConnection.delete({
        where: { id: connection.id },
      });
    }
  }
}
