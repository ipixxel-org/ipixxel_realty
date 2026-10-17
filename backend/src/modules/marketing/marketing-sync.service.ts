import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { PlatformAdapterRegistry } from './adapters/platform-adapter.registry';
import type {
  AdapterSyncResult,
  MarketingConnectionRow,
} from './adapters/platform-adapter.interface';

@Injectable()
export class MarketingSyncService {
  private readonly logger = new Logger(MarketingSyncService.name);
  private syncTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: PlatformAdapterRegistry,
  ) {}

  startHourlySweep() {
    if (this.syncTimer) return;
    this.syncTimer = setInterval(
      () => {
        void this.syncAllConnected().catch((err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          this.logger.warn(`Marketing sync sweep failed: ${message}`);
        });
      },
      60 * 60 * 1000,
    );
    this.syncTimer.unref?.();
  }

  stopHourlySweep() {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
  }

  async syncConnection(
    orgId: string,
    connectionId: string,
  ): Promise<AdapterSyncResult & { connectionId: string; platformKey: string }> {
    const row = await this.prisma.marketingConnection.findFirst({
      where: { id: connectionId, orgId },
    });
    if (!row) throw new NotFoundException('Connection not found');
    return this.runSync(row);
  }

  async syncPlatform(
    orgId: string,
    platformKey: string,
  ): Promise<{
    ok: boolean;
    synced: number;
    failed: number;
    results: Array<AdapterSyncResult & { connectionId: string }>;
  }> {
    const rows = await this.prisma.marketingConnection.findMany({
      where: { orgId, platformKey, status: { in: ['connected', 'error'] } },
      orderBy: { connectedAt: 'desc' },
      take: 50,
    });
    if (rows.length === 0) {
      return { ok: true, synced: 0, failed: 0, results: [] };
    }

    const results: Array<AdapterSyncResult & { connectionId: string }> = [];
    let failed = 0;
    for (const row of rows) {
      const r = await this.runSync(row);
      results.push({ ...r, connectionId: row.id });
      if (!r.ok) failed += 1;
    }
    return {
      ok: failed === 0,
      synced: results.length - failed,
      failed,
      results,
    };
  }

  async syncAllConnected(limit = 100) {
    const rows = await this.prisma.marketingConnection.findMany({
      where: { status: 'connected' },
      orderBy: { lastSyncAt: 'asc' },
      take: limit,
    });
    let ok = 0;
    let failed = 0;
    for (const row of rows) {
      const result = await this.runSync(row);
      if (result.ok) ok += 1;
      else failed += 1;
    }
    this.logger.log(
      `Integration Engine sweep: ${ok} ok, ${failed} failed (${rows.length} connections)`,
    );
    return { ok, failed, total: rows.length };
  }

  private async runSync(row: {
    id: string;
    orgId: string;
    platformKey: string;
    status: string;
    externalAccountId: string;
    externalAccountName: string;
    accessToken: string | null;
    refreshToken: string | null;
    projectId: string | null;
    metadata: Prisma.JsonValue | null;
    lastSyncAt: Date | null;
  }): Promise<AdapterSyncResult & { connectionId: string; platformKey: string }> {
    const adapter = this.registry.get(row.platformKey);
    const connection: MarketingConnectionRow = {
      id: row.id,
      orgId: row.orgId,
      platformKey: row.platformKey,
      status: row.status,
      externalAccountId: row.externalAccountId,
      externalAccountName: row.externalAccountName,
      accessToken: row.accessToken,
      refreshToken: row.refreshToken,
      projectId: row.projectId,
      metadata: row.metadata,
      lastSyncAt: row.lastSyncAt,
    };

    if (!adapter?.syncConnection) {
      const message = `No sync adapter for ${row.platformKey}`;
      await this.writeLog({
        orgId: row.orgId,
        connectionId: row.id,
        platformKey: row.platformKey,
        status: 'failed',
        message,
      });
      return {
        ok: false,
        message,
        connectionId: row.id,
        platformKey: row.platformKey,
      };
    }

    try {
      const result = await adapter.syncConnection(connection);
      await this.writeLog({
        orgId: row.orgId,
        connectionId: row.id,
        platformKey: row.platformKey,
        status: result.ok ? 'success' : 'failed',
        message: result.message,
        detail: result.detail,
      });
      if (!result.ok) {
        await this.prisma.marketingConnection
          .update({
            where: { id: row.id },
            data: { lastError: result.message, status: 'error' },
          })
          .catch(() => undefined);
      }
      return {
        ...result,
        connectionId: row.id,
        platformKey: row.platformKey,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      await this.writeLog({
        orgId: row.orgId,
        connectionId: row.id,
        platformKey: row.platformKey,
        status: 'failed',
        message,
      });
      await this.prisma.marketingConnection
        .update({
          where: { id: row.id },
          data: { lastError: message, status: 'error' },
        })
        .catch(() => undefined);
      return {
        ok: false,
        message,
        connectionId: row.id,
        platformKey: row.platformKey,
      };
    }
  }

  private async writeLog(input: {
    orgId: string;
    connectionId: string | null;
    platformKey: string;
    status: 'success' | 'failed';
    message?: string;
    detail?: Prisma.InputJsonValue;
  }) {
    try {
      await this.prisma.marketingSyncLog.create({
        data: {
          orgId: input.orgId,
          connectionId: input.connectionId,
          platformKey: input.platformKey,
          status: input.status,
          message: input.message ?? null,
          detail: input.detail ?? undefined,
          direction: 'outbound',
        },
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Failed to write sync log: ${message}`);
    }
  }
}
