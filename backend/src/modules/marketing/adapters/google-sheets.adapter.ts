import { Injectable } from '@nestjs/common';
import { GoogleSheetsService } from '../google-sheets.service';
import type {
  AdapterConnectResult,
  AdapterOAuthResult,
  AdapterSyncResult,
  MarketingConnectionRow,
  PlatformAdapter,
} from './platform-adapter.interface';

@Injectable()
export class GoogleSheetsAdapter implements PlatformAdapter {
  readonly key = 'google_sheets';
  readonly category = 'other' as const;
  readonly displayName = 'Google Sheets & Drive';

  constructor(private readonly googleSheets: GoogleSheetsService) {}

  isConfigured(): boolean {
    // Synchronous check; relies on Google OAuth client id & secret availability
    return true;
  }

  supportsOAuth(): boolean {
    return true;
  }

  supportsWebhook(): boolean {
    return true;
  }

  supportsCredentials(): boolean {
    return true;
  }

  async getConnectUrl(orgId: string, userId: string): Promise<AdapterConnectResult> {
    return this.googleSheets.getConnectUrl(orgId, userId);
  }

  async handleOAuthCallback(code: string, state: string): Promise<AdapterOAuthResult> {
    const result = await this.googleSheets.handleOAuthCallback(code, state);
    return {
      redirectTo: result.redirectTo,
      connected: result.connected,
    };
  }

  async syncConnection(connection: MarketingConnectionRow): Promise<AdapterSyncResult> {
    const res = await this.googleSheets.syncAllLeadsToSheet(
      connection.orgId,
      connection.projectId ?? undefined,
      connection.id,
    );
    return {
      ok: res.ok,
      message: res.message,
      leadsIngested: res.synced,
    };
  }

  async disconnect(connection: MarketingConnectionRow): Promise<void> {
    await this.googleSheets.disconnect(connection.orgId, connection.id);
  }
}
