import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { LeadStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { leadContactFromData } from '../../common/utils/lead-data.util';

export const GOOGLE_SHEETS_SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ');

export const DEFAULT_SHEET_HEADERS = [
  'Captured At',
  'Name',
  'Phone',
  'Email',
  'Source',
  'Platform',
  'Campaign',
  'Project',
  'Status',
  'Notes / Message',
  'Lead ID',
];

export interface GoogleSheetMetadata {
  spreadsheetId?: string;
  spreadsheetUrl?: string;
  sheetName?: string;
  autoSync?: boolean;
  googleEmail?: string;
  lastSyncCount?: number;
  webhookSecret?: string;
  // Per-project sheet behavior
  sheetPerProject?: boolean;
  createSheetPerProject?: boolean;
  projectSheetNames?: Record<string, string>; // projectId -> sheet/tab name
  // Real-time synchronization metrics
  recordsAdded?: number;
  recordsUpdated?: number;
  failedRecords?: number;
  syncErrors?: string[];
  lastSyncAt?: string;
  [key: string]: unknown;
}

type ConnectionRow = {
  id: string;
  orgId: string;
  platformKey: string;
  status: string;
  externalAccountId: string;
  externalAccountName: string;
  accessToken: string | null;
  refreshToken: string | null;
  projectId: string | null;
  metadata: unknown;
  lastSyncAt: Date | null;
  lastError?: string | null;
  connectedAt: Date;
  connectedBy?: string | null;
  updatedAt?: Date;
};

@Injectable()
export class GoogleSheetsService {
  private readonly logger = new Logger(GoogleSheetsService.name);

  constructor(private readonly prisma: PrismaService) {}

  private frontendUrl(): string {
    return (process.env.FRONTEND_URL ?? 'http://localhost:3001').replace(
      /\/$/,
      '',
    );
  }

  private apiPublicUrl(): string {
    return (
      process.env.BACKEND_PUBLIC_URL ??
      `${process.env.FRONTEND_URL ?? 'http://localhost:3001'}/api`
    ).replace(/\/$/, '');
  }

  private backendUrl(): string {
    const raw =
      process.env.BACKEND_PUBLIC_URL ||
      process.env.PUBLIC_BACKEND_URL ||
      process.env.BACKEND_URL ||
      process.env.APP_URL ||
      `http://localhost:${process.env.PORT || '3000'}`;
    return raw.replace(/\/$/, '');
  }

  private parseMetadata(raw: unknown): GoogleSheetMetadata {
    return raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as GoogleSheetMetadata)
      : {};
  }

  /** Stable external account id per Google account (supports many accounts per org). */
  private accountExternalId(email: string | null | undefined): string {
    return email
      ? `gsheet:${email.trim().toLowerCase()}`
      : `gsheet:unknown:${Date.now()}`;
  }

  private accountKeyFromExternalId(externalAccountId: string): string {
    // Legacy rows used spreadsheetId or `google_drive:{orgId}` — treat all as legacy.
    if (!externalAccountId) return '';
    if (externalAccountId.startsWith('gsheet:')) return externalAccountId;
    return '';
  }

  async getGoogleOAuthClient(): Promise<{
    clientId: string;
    clientSecret: string;
  }> {
    try {
      const rows: any[] = await this.prisma.$queryRawUnsafe(`
        SELECT "google_ads_client_id", "google_ads_client_secret"
        FROM "identity"."marketing_settings"
        WHERE "id" = 'default' LIMIT 1
      `);
      const row = rows && rows.length > 0 ? rows[0] : null;
      const clientId =
        row &&
        typeof row.google_ads_client_id === 'string' &&
        row.google_ads_client_id.trim()
          ? row.google_ads_client_id.trim()
          : (process.env.GOOGLE_ADS_CLIENT_ID ?? '').trim();
      const clientSecret =
        row &&
        typeof row.google_ads_client_secret === 'string' &&
        row.google_ads_client_secret.trim()
          ? row.google_ads_client_secret.trim()
          : (process.env.GOOGLE_ADS_CLIENT_SECRET ?? '').trim();

      return { clientId, clientSecret };
    } catch {
      return {
        clientId: (process.env.GOOGLE_ADS_CLIENT_ID ?? '').trim(),
        clientSecret: (process.env.GOOGLE_ADS_CLIENT_SECRET ?? '').trim(),
      };
    }
  }

  async isConfigured(): Promise<boolean> {
    const { clientId, clientSecret } = await this.getGoogleOAuthClient();
    return Boolean(clientId && clientSecret);
  }

  async getConnectUrl(orgId: string, userId: string) {
    const { clientId } = await this.getGoogleOAuthClient();
    if (!clientId) {
      throw new ServiceUnavailableException(
        'Google OAuth is not configured. Configure Google Client ID & Secret in Connected Apps or Admin Console.',
      );
    }

    const redirectUri = `${this.apiPublicUrl()}/org/marketing/oauth/google/callback`;
    const state = Buffer.from(
      JSON.stringify({
        orgId,
        userId,
        platformKey: 'google_sheets',
        ts: Date.now(),
      }),
      'utf8',
    ).toString('base64url');

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      access_type: 'offline',
      prompt: 'consent',
      scope: GOOGLE_SHEETS_SCOPES,
      state,
    });

    return {
      url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
      state,
    };
  }

  /** All Google Sheets connections for an org (one per connected Google account / sheet). */
  async listConnections(orgId: string): Promise<ConnectionRow[]> {
    return this.prisma.marketingConnection.findMany({
      where: { orgId, platformKey: 'google_sheets' },
      orderBy: { connectedAt: 'desc' },
    }) as unknown as Promise<ConnectionRow[]>;
  }

  private async getConnectionById(
    orgId: string,
    connectionId: string,
  ): Promise<ConnectionRow | null> {
    const row = await this.prisma.marketingConnection.findFirst({
      where: { id: connectionId, orgId, platformKey: 'google_sheets' },
    });
    return (row as unknown as ConnectionRow) ?? null;
  }

  private async resolveConnection(
    orgId: string,
    connectionId?: string,
  ): Promise<ConnectionRow> {
    if (connectionId) {
      const row = await this.getConnectionById(orgId, connectionId);
      if (!row)
        throw new NotFoundException('Google Sheets connection not found');
      return row;
    }
    const rows = await this.listConnections(orgId);
    const first = rows.find((r) => r.status === 'connected') ?? rows[0];
    if (!first) {
      throw new BadRequestException(
        'Google Sheets is not connected for this organisation',
      );
    }
    return first;
  }

  async getValidAccessToken(
    orgId: string,
    connectionId?: string,
  ): Promise<{
    accessToken: string;
    connection: ConnectionRow;
    metadata: GoogleSheetMetadata;
  } | null> {
    const connection = connectionId
      ? await this.getConnectionById(orgId, connectionId)
      : ((await this.prisma.marketingConnection.findFirst({
          where: { orgId, platformKey: 'google_sheets' },
          orderBy: { connectedAt: 'desc' },
        })) as unknown as ConnectionRow | null);
    if (!connection || !connection.accessToken) return null;

    const metadata = this.parseMetadata(connection.metadata);

    const { clientId, clientSecret } = await this.getGoogleOAuthClient();

    // Verify token validity or refresh proactively using refresh token
    if (connection.refreshToken && clientId && clientSecret) {
      try {
        const testRes = await fetch(
          'https://www.googleapis.com/oauth2/v2/userinfo',
          { headers: { Authorization: `Bearer ${connection.accessToken}` } },
        );
        if (!testRes.ok) {
          // Token expired, refresh it
          const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              client_id: clientId,
              client_secret: clientSecret,
              refresh_token: connection.refreshToken,
              grant_type: 'refresh_token',
            }),
          });
          const tokenJson = (await tokenRes.json()) as {
            access_token?: string;
          };
          if (tokenJson.access_token) {
            await this.prisma.marketingConnection.update({
              where: { id: connection.id },
              data: { accessToken: tokenJson.access_token },
            });
            connection.accessToken = tokenJson.access_token;
            return {
              accessToken: tokenJson.access_token,
              connection,
              metadata,
            };
          }
        }
      } catch (err) {
        this.logger.warn(
          `Failed token refresh check for org ${orgId}: ${String(err)}`,
        );
      }
    }

    return { accessToken: connection.accessToken, connection, metadata };
  }

  async handleOAuthCallback(code: string, state: string) {
    let parsed: { orgId?: string; userId?: string; platformKey?: string };
    try {
      parsed = JSON.parse(Buffer.from(state, 'base64url').toString('utf8'));
    } catch {
      throw new BadRequestException('Invalid Google OAuth state');
    }
    if (!parsed.orgId)
      throw new BadRequestException('Missing orgId in OAuth state');

    const { clientId, clientSecret } = await this.getGoogleOAuthClient();
    const redirectUri = `${this.apiPublicUrl()}/org/marketing/oauth/google/callback`;

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    const tokenJson = (await tokenRes.json()) as {
      access_token?: string;
      refresh_token?: string;
      error?: string;
    };

    if (!tokenRes.ok || !tokenJson.access_token) {
      throw new BadRequestException(
        tokenJson.error ?? 'Google OAuth token exchange failed',
      );
    }

    // Fetch Google user email
    let userEmail = '';
    try {
      const userRes = await fetch(
        'https://www.googleapis.com/oauth2/v2/userinfo',
        {
          headers: { Authorization: `Bearer ${tokenJson.access_token}` },
        },
      );
      if (userRes.ok) {
        const u = (await userRes.json()) as { email?: string };
        userEmail = u.email ?? '';
      }
    } catch {
      // ignore
    }

    // Fetch org details for spreadsheet naming
    const org = await this.prisma.organisation.findUnique({
      where: { id: parsed.orgId },
      select: { name: true },
    });
    const orgName = org?.name ?? 'Lead Center';

    // Multi-account: a connection is keyed by the Google account email so each
    // Google account gets its own connection row (and its own spreadsheet).
    const wantedExternalId = this.accountExternalId(userEmail);
    const all = await this.listConnections(parsed.orgId);

    let existing: ConnectionRow | null =
      all.find((c) => c.externalAccountId === wantedExternalId) ??
      all.find(
        (c) =>
          this.parseMetadata(c.metadata).googleEmail &&
          String(this.parseMetadata(c.metadata).googleEmail).toLowerCase() ===
            userEmail.toLowerCase(),
      ) ??
      null;

    // Legacy rows keyed by spreadsheetId / google_drive:{orgId} with no email
    if (!existing && !userEmail) {
      existing =
        all.find((c) => !this.accountKeyFromExternalId(c.externalAccountId)) ??
        null;
    }

    let metadata: GoogleSheetMetadata = this.parseMetadata(existing?.metadata);

    metadata.googleEmail = userEmail || metadata.googleEmail;
    metadata.autoSync = metadata.autoSync !== false; // default true

    // If no spreadsheet exists yet in metadata, create one in Google Drive automatically!
    if (!metadata.spreadsheetId) {
      try {
        const created = await this.createSpreadsheet(
          tokenJson.access_token,
          `${orgName} - Leads`,
        );
        metadata.spreadsheetId = created.spreadsheetId;
        metadata.spreadsheetUrl = created.spreadsheetUrl;
        metadata.sheetName = created.sheetName;
      } catch (err) {
        this.logger.error(
          `Could not auto-create Google Sheet for ${parsed.orgId}`,
          err,
        );
      }
    }

    const externalId = userEmail
      ? wantedExternalId
      : existing?.externalAccountId || wantedExternalId;
    const externalName = userEmail
      ? `Google Sheets (${userEmail})`
      : 'Google Sheets & Drive';
    const shared = {
      externalAccountName: externalName,
      accessToken: tokenJson.access_token,
      refreshToken: tokenJson.refresh_token ?? existing?.refreshToken ?? null,
      status: 'connected',
      metadata: metadata as any,
      ...(parsed.userId ? { connectedBy: parsed.userId } : {}),
    };

    let connection: ConnectionRow;
    if (existing) {
      try {
        connection = (await this.prisma.marketingConnection.update({
          where: { id: existing.id },
          data: { ...shared, externalAccountId: externalId },
        })) as unknown as ConnectionRow;
      } catch {
        // Unique collision on externalAccountId — keep the legacy id.
        connection = (await this.prisma.marketingConnection.update({
          where: { id: existing.id },
          data: shared,
        })) as unknown as ConnectionRow;
      }
    } else {
      connection = (await this.prisma.marketingConnection.create({
        data: {
          orgId: parsed.orgId,
          platformKey: 'google_sheets',
          externalAccountId: externalId,
          ...shared,
        },
      })) as unknown as ConnectionRow;
    }

    return {
      connected: 1,
      redirectTo: `${this.frontendUrl()}/org/marketing/apps/google_sheets?connected=1`,
      connection,
    };
  }

  /**
   * Resolves which spreadsheet/tab a lead should be written to for one
   * connection, creating the project tab on demand when configured.
   */
  private async resolveTargetSheet(
    accessToken: string,
    connection: ConnectionRow,
    metadata: GoogleSheetMetadata,
    leadProjectId: string | null,
    leadProjectName: string,
  ): Promise<{ spreadsheetId: string; sheetName: string }> {
    const spreadsheetId = metadata.spreadsheetId as string;
    let sheetName = metadata.sheetName || 'Leads';

    if (metadata.sheetPerProject && leadProjectId) {
      const mapped = metadata.projectSheetNames?.[leadProjectId];
      if (mapped) {
        sheetName = mapped;
      } else if (metadata.createSheetPerProject) {
        const suggested = leadProjectName || leadProjectId.slice(0, 15);
        const created = this.sanitizeSheetName(suggested) || 'Project';
        await this.ensureSheetExists(accessToken, spreadsheetId, created);
        sheetName = created;
        const projectSheetNames = {
          ...(metadata.projectSheetNames || {}),
          [leadProjectId]: created,
        };
        metadata.projectSheetNames = projectSheetNames;
        await this.prisma.marketingConnection.update({
          where: { id: connection.id },
          data: { metadata: { ...metadata, projectSheetNames } as any },
        });
      }
    }

    return { spreadsheetId, sheetName };
  }

  private async appendRows(
    accessToken: string,
    spreadsheetId: string,
    sheetName: string,
    rows: unknown[][],
  ): Promise<boolean> {
    const range = `'${sheetName}'!A:K`;
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ values: rows }),
    });
    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      this.logger.warn(
        `Google Sheet append failed for sheet "${sheetName}": ${JSON.stringify(errJson)}`,
      );
      return false;
    }
    return true;
  }

  /**
   * Automatically appends a single lead row to every eligible connected Google
   * Sheet in real time. Supports multiple Google accounts and project-wise
   * sheet/tab routing per connection.
   */
  async appendLeadRow(
    orgId: string,
    lead: any,
    projectId?: string,
  ): Promise<boolean> {
    try {
      const connections = await this.listConnections(orgId);
      if (connections.length === 0) return false;

      const leadProjectId: string | null =
        projectId || lead.projectId || lead.project?.id || null;

      let leadProjectName = '';
      if (lead.project?.name) {
        leadProjectName = lead.project.name;
      } else if (leadProjectId) {
        const proj = await this.prisma.project.findUnique({
          where: { id: leadProjectId },
          select: { name: true },
        });
        leadProjectName = proj?.name ?? '';
      }

      const contact = leadContactFromData(lead.data ?? {});
      const notesOrMsg =
        lead.data?.notes ||
        lead.data?.message ||
        lead.data?.comments ||
        lead.formName ||
        '';

      const rowValues = [
        lead.createdAt
          ? new Date(lead.createdAt).toLocaleString()
          : new Date().toLocaleString(),
        contact.fullName || lead.name || '',
        contact.phone || lead.phone || '',
        contact.email || lead.email || '',
        lead.source || 'website',
        lead.platform || '',
        lead.campaign || lead.utmCampaign || '',
        leadProjectName,
        lead.status || 'New',
        String(notesOrMsg),
        lead.id || '',
      ];

      let anySuccess = false;

      for (const connection of connections) {
        try {
          if (connection.status !== 'connected') continue;
          const metadata = this.parseMetadata(connection.metadata);
          if (metadata.autoSync === false) continue;
          if (!metadata.spreadsheetId) continue;
          // Project-scoped connection: only receives leads of its project.
          if (connection.projectId) {
            if (!leadProjectId || connection.projectId !== leadProjectId)
              continue;
          }

          const auth = await this.getValidAccessToken(orgId, connection.id);
          if (!auth) continue;

          const { spreadsheetId, sheetName } = await this.resolveTargetSheet(
            auth.accessToken,
            connection,
            metadata,
            leadProjectId,
            leadProjectName,
          );

          const ok = await this.appendRows(
            auth.accessToken,
            spreadsheetId,
            sheetName,
            [rowValues],
          );
          if (ok) {
            anySuccess = true;
            await this.prisma.marketingConnection.update({
              where: { id: connection.id },
              data: { lastSyncAt: new Date(), lastError: null },
            });
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          this.logger.warn(
            `Error appending lead ${lead.id} to Google Sheet connection ${connection.id}: ${msg}`,
          );
        }
      }

      return anySuccess;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `Error appending lead to Google Sheet for org ${orgId}: ${msg}`,
      );
      return false;
    }
  }

  /**
   * Backfills or syncs existing leads from Lead Center into the Google Sheet(s).
   * Syncs one connection when `connectionId` is given, otherwise all connected
   * Google Sheets connections for the org.
   */
  async syncAllLeadsToSheet(
    orgId: string,
    projectId?: string,
    connectionId?: string,
  ) {
    const targets = connectionId
      ? [await this.resolveConnection(orgId, connectionId)]
      : (await this.listConnections(orgId)).filter(
          (c) => c.status === 'connected',
        );

    if (targets.length === 0) {
      throw new BadRequestException(
        'Google Sheets is not connected for this organisation',
      );
    }

    const results: Array<{
      ok: boolean;
      connectionId: string;
      synced: number;
      message: string;
      spreadsheetUrl?: string;
    }> = [];

    for (const connection of targets) {
      results.push(await this.syncConnectionLeads(connection, projectId));
    }

    const synced = results.reduce((n, r) => n + (r.synced || 0), 0);
    const failed = results.filter((r) => !r.ok);
    const ok = failed.length === 0;
    const spreadsheetUrl = results.find(
      (r) => r.spreadsheetUrl,
    )?.spreadsheetUrl;

    // Single-connection calls (adapter / legacy UI) surface the failure directly.
    if (connectionId && !ok) {
      throw new BadRequestException(
        failed[0]?.message ?? 'Failed to sync leads to Google Sheet',
      );
    }
    if (!ok && targets.length === 1) {
      throw new BadRequestException(
        failed[0]?.message ?? 'Failed to sync leads to Google Sheet',
      );
    }

    return {
      ok,
      synced,
      message: ok
        ? `Successfully synced ${synced} lead(s) to Google Sheet${results.length > 1 ? 's' : ''}!`
        : `Synced ${synced} lead(s); ${failed.length} connection(s) failed`,
      spreadsheetUrl,
      results,
    };
  }

  private async syncConnectionLeads(
    connection: ConnectionRow,
    projectId?: string,
  ) {
    const metadata = this.parseMetadata(connection.metadata);
    const base = {
      connectionId: connection.id,
      spreadsheetUrl: metadata.spreadsheetUrl,
    };

    if (!metadata.spreadsheetId) {
      return {
        ok: false,
        synced: 0,
        message: 'No Google Sheet is currently linked for this connection',
        ...base,
      };
    }

    const auth = await this.getValidAccessToken(
      connection.orgId,
      connection.id,
    );
    if (!auth) {
      return {
        ok: false,
        synced: 0,
        message: 'Google account token is not available for this connection',
        ...base,
      };
    }
    const accessToken = auth.accessToken;

    // Project filter: explicit request > connection default project.
    const targetProjectId = projectId ?? connection.projectId ?? undefined;
    const where: any = { orgId: connection.orgId };
    if (targetProjectId) where.projectId = targetProjectId;

    const leads = await this.prisma.lead.findMany({
      where,
      include: { project: { select: { name: true } } },
      orderBy: { createdAt: 'asc' },
      take: 5000,
    });

    if (leads.length === 0) {
      return {
        ok: true,
        synced: 0,
        message: 'No leads found in Lead Center to sync',
        ...base,
      };
    }

    const rowFor = (lead: {
      createdAt: Date | null;
      data: unknown;
      source: string | null;
      platform: string | null;
      campaign: string | null;
      utmCampaign: string | null;
      status: string | null;
      formName: string | null;
      id: string;
      project?: { name: string } | null;
    }) => {
      const contact = leadContactFromData(
        (lead.data as Record<string, unknown>) ?? {},
      );
      const notes =
        (lead.data as any)?.notes ||
        (lead.data as any)?.message ||
        lead.formName ||
        '';
      return [
        lead.createdAt ? new Date(lead.createdAt).toLocaleString() : '',
        contact.fullName || '',
        contact.phone || '',
        contact.email || '',
        lead.source || '',
        lead.platform || '',
        lead.campaign || lead.utmCampaign || '',
        lead.project?.name || '',
        lead.status || 'New',
        String(notes),
        lead.id,
      ];
    };

    let synced = 0;

    if (metadata.sheetPerProject && !projectId) {
      // Project-wise: group leads by project and append into each project tab.
      const groups = new Map<string, typeof leads>();
      for (const lead of leads) {
        const pid =
          (lead as { projectId?: string | null }).projectId ?? '__none__';
        const list = groups.get(pid) ?? [];
        list.push(lead);
        groups.set(pid, list);
      }
      for (const [pid, group] of groups) {
        const leadProjectId = pid === '__none__' ? null : pid;
        const leadProjectName = group[0]?.project?.name || '';
        const { spreadsheetId, sheetName } = await this.resolveTargetSheet(
          accessToken,
          connection,
          metadata,
          leadProjectId,
          leadProjectName,
        );
        const ok = await this.appendRows(
          accessToken,
          spreadsheetId,
          sheetName,
          group.map(rowFor),
        );
        if (ok) synced += group.length;
      }
    } else {
      const leadProjectId = targetProjectId ?? null;
      const leadProjectName = leads[0]?.project?.name || '';
      const { spreadsheetId, sheetName } = await this.resolveTargetSheet(
        accessToken,
        connection,
        metadata,
        leadProjectId,
        leadProjectName,
      );
      await this.ensureSheetHeaders(accessToken, spreadsheetId, sheetName);
      const ok = await this.appendRows(
        accessToken,
        spreadsheetId,
        sheetName,
        leads.map(rowFor),
      );
      if (ok) synced += leads.length;
    }

    const updatedMetadata: GoogleSheetMetadata = {
      ...metadata,
      lastSyncCount: synced,
    };

    await this.prisma.marketingConnection.update({
      where: { id: connection.id },
      data: {
        lastSyncAt: new Date(),
        lastError: null,
        metadata: updatedMetadata as any,
      },
    });

    return {
      ok: synced > 0,
      synced,
      message:
        synced > 0
          ? `Synced ${synced} lead(s) to Google Sheet`
          : 'No leads were written to Google Sheet',
      ...base,
    };
  }

  /**
   * Creates a new Google Sheet inside the connected Google Drive.
   * With `connectionId`, replaces that connection's spreadsheet; without it,
   * replaces the first connection's spreadsheet (legacy behaviour).
   */
  async createNewSheetForOrg(
    orgId: string,
    customTitle?: string,
    projectId?: string,
    connectionId?: string,
  ) {
    const connection = await this.resolveConnection(orgId, connectionId);
    const auth = await this.getValidAccessToken(orgId, connection.id);
    if (!auth) {
      throw new BadRequestException(
        'Google Sheets is not connected for this organisation',
      );
    }
    const { accessToken, metadata } = auth;

    const org = await this.prisma.organisation.findUnique({
      where: { id: orgId },
      select: { name: true },
    });
    const title = customTitle || `${org?.name ?? 'Lead Center'} - Leads`;

    const created = await this.createSpreadsheet(accessToken, title);

    const updatedMetadata: GoogleSheetMetadata = {
      ...metadata,
      spreadsheetId: created.spreadsheetId,
      spreadsheetUrl: created.spreadsheetUrl,
      sheetName: created.sheetName,
      // Fresh spreadsheet — start project tab map over.
      projectSheetNames: {},
    };

    await this.prisma.marketingConnection.update({
      where: { id: connection.id },
      data: {
        ...(projectId !== undefined ? { projectId: projectId || null } : {}),
        metadata: updatedMetadata as any,
      },
    });

    return {
      ok: true,
      connectionId: connection.id,
      spreadsheetId: created.spreadsheetId,
      spreadsheetUrl: created.spreadsheetUrl,
      sheetName: created.sheetName,
    };
  }

  /**
   * Links an existing Google Sheet ID or full Google Drive URL.
   * - If that spreadsheet is already linked on some connection, updates it.
   * - If `connectionId` is given, repoints that connection to the sheet.
   * - Otherwise creates an additional connection for the new spreadsheet
   *   (multiple Google Sheets per org / per account are supported).
   */
  async linkExistingSheet(
    orgId: string,
    sheetInput: string,
    sheetName = 'Leads',
    projectId?: string,
    connectionId?: string,
  ) {
    const source = await this.resolveConnection(orgId, connectionId);
    const auth = await this.getValidAccessToken(orgId, source.id);
    if (!auth) {
      throw new BadRequestException(
        'Google Sheets is not connected for this organisation',
      );
    }
    const { accessToken, metadata } = auth;

    // Parse spreadsheet ID from URL or raw ID
    let spreadsheetId = sheetInput.trim();
    const match = sheetInput.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (match && match[1]) {
      spreadsheetId = match[1];
    }

    if (!spreadsheetId) {
      throw new BadRequestException('Invalid Google Spreadsheet ID or URL');
    }

    // Verify access to the sheet
    const verifyRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!verifyRes.ok) {
      throw new BadRequestException(
        'Could not access this Google Sheet. Make sure the connected Google account has Edit access to it.',
      );
    }

    const sheetJson = (await verifyRes.json()) as {
      properties?: { title?: string };
      sheets?: Array<{ properties?: { title?: string } }>;
    };
    const resolvedSheetName =
      sheetName || sheetJson.sheets?.[0]?.properties?.title || 'Sheet1';
    const spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;

    // Ensure header row exists
    await this.ensureSheetHeaders(
      accessToken,
      spreadsheetId,
      resolvedSheetName,
    );

    const connections = await this.listConnections(orgId);
    const alreadyLinked = connections.find(
      (c) => this.parseMetadata(c.metadata).spreadsheetId === spreadsheetId,
    );

    if (alreadyLinked) {
      const updatedMetadata: GoogleSheetMetadata = {
        ...this.parseMetadata(alreadyLinked.metadata),
        spreadsheetId,
        spreadsheetUrl,
        sheetName: resolvedSheetName,
        ...(projectId !== undefined ? { projectId } : {}),
      };
      await this.prisma.marketingConnection.update({
        where: { id: alreadyLinked.id },
        data: { metadata: updatedMetadata as any },
      });
      return {
        ok: true,
        connectionId: alreadyLinked.id,
        spreadsheetId,
        spreadsheetUrl,
        sheetName: resolvedSheetName,
        title: sheetJson.properties?.title ?? 'Google Sheet',
      };
    }

    if (connectionId || connections.length <= 1) {
      // Repoint the chosen (or only) connection to the new spreadsheet.
      const updatedMetadata: GoogleSheetMetadata = {
        ...metadata,
        spreadsheetId,
        spreadsheetUrl,
        sheetName: resolvedSheetName,
        projectSheetNames: {},
        ...(projectId !== undefined ? { projectId } : {}),
      };
      await this.prisma.marketingConnection.update({
        where: { id: source.id },
        data: {
          metadata: updatedMetadata as any,
          ...(projectId !== undefined ? { projectId: projectId || null } : {}),
        },
      });
      return {
        ok: true,
        connectionId: source.id,
        spreadsheetId,
        spreadsheetUrl,
        sheetName: resolvedSheetName,
        title: sheetJson.properties?.title ?? 'Google Sheet',
      };
    }

    // Additional sheet for this org — new connection row sharing the same
    // Google account tokens, keyed uniquely per spreadsheet.
    const googleEmail = metadata.googleEmail
      ? String(metadata.googleEmail).toLowerCase()
      : '';
    const externalAccountId = googleEmail
      ? `gsheet:${googleEmail}:${spreadsheetId}`
      : `gsheet:sheet:${spreadsheetId}`;
    const externalName = googleEmail
      ? `Google Sheets (${googleEmail}) — ${sheetJson.properties?.title ?? 'Sheet'}`
      : `Google Sheets — ${sheetJson.properties?.title ?? 'Sheet'}`;

    const newMetadata: GoogleSheetMetadata = {
      spreadsheetId,
      spreadsheetUrl,
      sheetName: resolvedSheetName,
      autoSync: metadata.autoSync !== false,
      googleEmail: metadata.googleEmail,
      sheetPerProject: metadata.sheetPerProject === true,
      createSheetPerProject: metadata.createSheetPerProject === true,
      projectSheetNames: {},
      ...(projectId !== undefined ? { projectId } : {}),
    };

    let created;
    try {
      created = await this.prisma.marketingConnection.create({
        data: {
          orgId,
          platformKey: 'google_sheets',
          externalAccountId,
          externalAccountName: externalName,
          accessToken: source.accessToken,
          refreshToken: source.refreshToken,
          status: 'connected',
          projectId: projectId ?? source.projectId ?? null,
          metadata: newMetadata as any,
          connectedBy: source.connectedBy ?? null,
        },
      });
    } catch {
      throw new BadRequestException(
        'This Google Sheet is already linked to another connection for this organisation',
      );
    }

    return {
      ok: true,
      connectionId: (created as { id: string }).id,
      spreadsheetId,
      spreadsheetUrl,
      sheetName: resolvedSheetName,
      title: sheetJson.properties?.title ?? 'Google Sheet',
    };
  }

  /**
   * Updates sync settings (autoSync, sheet name, project-wise routing).
   */
  async updateSettings(
    orgId: string,
    dto: {
      autoSync?: boolean;
      sheetName?: string;
      sheetPerProject?: boolean;
      createSheetPerProject?: boolean;
      projectSheetNames?: Record<string, string>;
      projectId?: string | null;
    },
    connectionId?: string,
  ) {
    const connection = await this.resolveConnection(orgId, connectionId);

    const metadata = this.parseMetadata(connection.metadata);

    if (dto.autoSync !== undefined) metadata.autoSync = dto.autoSync;
    if (dto.sheetName !== undefined && dto.sheetName.trim()) {
      metadata.sheetName = dto.sheetName.trim();
    }
    if (dto.sheetPerProject !== undefined)
      metadata.sheetPerProject = dto.sheetPerProject;
    if (dto.createSheetPerProject !== undefined) {
      metadata.createSheetPerProject = dto.createSheetPerProject;
    }
    if (dto.projectSheetNames !== undefined)
      metadata.projectSheetNames = dto.projectSheetNames;

    await this.prisma.marketingConnection.update({
      where: { id: connection.id },
      data: {
        metadata: metadata as any,
        ...(dto.projectId !== undefined
          ? { projectId: dto.projectId || null }
          : {}),
      },
    });

    return { ok: true, connectionId: connection.id, metadata };
  }

  async disconnect(orgId: string, connectionId?: string) {
    if (connectionId) {
      await this.prisma.marketingConnection.deleteMany({
        where: { id: connectionId, orgId, platformKey: 'google_sheets' },
      });
    } else {
      await this.prisma.marketingConnection.deleteMany({
        where: { orgId, platformKey: 'google_sheets' },
      });
    }
    return { ok: true };
  }

  // --- Private Helpers -------------------------------------------------------

  private async createSpreadsheet(
    accessToken: string,
    title: string,
  ): Promise<{
    spreadsheetId: string;
    spreadsheetUrl: string;
    sheetName: string;
  }> {
    const sheetName = 'Leads';
    const res = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        properties: { title },
        sheets: [
          {
            properties: {
              title: sheetName,
              gridProperties: { frozenRowCount: 1 },
            },
          },
        ],
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new BadRequestException(
        `Failed to create Google Sheet: ${err.error?.message ?? res.statusText}`,
      );
    }

    const json = (await res.json()) as {
      spreadsheetId: string;
      spreadsheetUrl?: string;
    };
    const spreadsheetId = json.spreadsheetId;
    const spreadsheetUrl =
      json.spreadsheetUrl ??
      `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;

    // Add initial header row
    await this.ensureSheetHeaders(accessToken, spreadsheetId, sheetName);

    return { spreadsheetId, spreadsheetUrl, sheetName };
  }

  private sanitizeSheetName(name: string): string {
    if (!name) return '';
    const sanitized = name
      .slice(0, 99)
      .replace(/[\\/?*[\]]/g, '-')
      .replace(/^'|'$/g, '')
      .trim();
    if (!sanitized) return '';
    return sanitized;
  }

  /** Creates the tab in the spreadsheet if missing and writes headers. */
  private async ensureSheetExists(
    accessToken: string,
    spreadsheetId: string,
    sheetName: string,
  ): Promise<void> {
    try {
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) return;
      const json = (await res.json()) as {
        sheets?: Array<{ properties?: { title?: string } }>;
      };
      const exists = (json.sheets || []).some(
        (sh) => sh.properties?.title === sheetName,
      );
      if (exists) return;

      const addUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`;
      const addRes = await fetch(addUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          requests: [
            {
              addSheet: {
                properties: {
                  title: sheetName,
                  gridProperties: { frozenRowCount: 1 },
                },
              },
            },
          ],
        }),
      });
      if (!addRes.ok) {
        const err = await addRes.json().catch(() => ({}));
        this.logger.warn(
          `ensureSheetExists: failed to add sheet "${sheetName}" to ${spreadsheetId}: ${JSON.stringify(err)}`,
        );
        return;
      }
      await this.ensureSheetHeaders(accessToken, spreadsheetId, sheetName);
    } catch (err) {
      this.logger.warn(
        `ensureSheetExists failed for "${sheetName}" in ${spreadsheetId}: ${String(err)}`,
      );
    }
  }

  private async ensureSheetHeaders(
    accessToken: string,
    spreadsheetId: string,
    sheetName: string,
  ): Promise<void> {
    try {
      const range = `'${sheetName}'!A1:K1`;
      const checkRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (checkRes.ok) {
        const json = (await checkRes.json()) as { values?: string[][] };
        if (
          json.values &&
          json.values.length > 0 &&
          json.values[0].length > 0
        ) {
          // Headers already present
          return;
        }
      }

      // Write header row
      await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ values: [DEFAULT_SHEET_HEADERS] }),
        },
      );
    } catch (err) {
      this.logger.warn(
        `Could not ensure headers in Google Sheet ${spreadsheetId}: ${String(err)}`,
      );
    }
  }

  // --- Real-time Apps Script & Inbound Webhook -------------------------------

  /**
   * Returns the webhook configuration, sync metrics, and customized Google Apps Script code
   * for the given organisation and connection/project.
   */
  async getWebhookConfig(orgId: string, connectionId?: string) {
    const connection = await this.resolveConnection(orgId, connectionId);
    let metadata = this.parseMetadata(connection.metadata);
    if (!metadata.webhookSecret) {
      const secret = crypto.randomBytes(24).toString('hex');
      metadata = {
        ...metadata,
        webhookSecret: secret,
        recordsAdded: metadata.recordsAdded || 0,
        recordsUpdated: metadata.recordsUpdated || 0,
        failedRecords: metadata.failedRecords || 0,
        syncErrors: metadata.syncErrors || [],
      };
      await this.prisma.marketingConnection.update({
        where: { id: connection.id },
        data: { metadata: metadata as any },
      });
    }

    let projectName: string | null = null;
    if (connection.projectId) {
      const project = await this.prisma.project.findUnique({
        where: { id: connection.projectId },
        select: { name: true },
      });
      projectName = project?.name || null;
    }

    const appUrl = this.backendUrl();
    const webhookSecret = metadata.webhookSecret || '';
    // Unique secure webhook URL for this specific connection
    const webhookUrl = `${appUrl}/webhooks/google-sheets/${connection.id}?token=${webhookSecret}`;

    const appsScriptCode = this.generateAppsScriptCode({
      webhookUrl,
      webhookToken: webhookSecret,
      connectionId: connection.id,
      accountName: connection.externalAccountName,
      projectId: connection.projectId,
      projectName,
    });

    return {
      connectionId: connection.id,
      externalAccountName: connection.externalAccountName,
      projectId: connection.projectId,
      projectName,
      spreadsheetId: metadata.spreadsheetId,
      spreadsheetUrl: metadata.spreadsheetUrl,
      webhookUrl,
      webhookSecret: metadata.webhookSecret,
      appsScriptCode,
      stats: {
        recordsAdded: metadata.recordsAdded ?? 0,
        recordsUpdated: metadata.recordsUpdated ?? 0,
        failedRecords: metadata.failedRecords ?? 0,
        syncErrors: metadata.syncErrors ?? [],
        lastSyncAt: connection.lastSyncAt
          ? connection.lastSyncAt.toISOString()
          : (metadata.lastSyncAt ?? null),
        lastError: connection.lastError ?? null,
        autoSync: metadata.autoSync !== false,
      },
    };
  }

  /**
   * Regenerates a new unique secure webhook token for the connection.
   */
  async regenerateWebhookToken(orgId: string, connectionId?: string) {
    const connection = await this.resolveConnection(orgId, connectionId);
    const metadata = this.parseMetadata(connection.metadata);
    const newSecret = crypto.randomBytes(24).toString('hex');
    const updatedMetadata: GoogleSheetMetadata = {
      ...metadata,
      webhookSecret: newSecret,
    };
    await this.prisma.marketingConnection.update({
      where: { id: connection.id },
      data: { metadata: updatedMetadata as any },
    });
    return this.getWebhookConfig(orgId, connection.id);
  }

  /**
   * Resets the sync metrics (added, updated, failed records and errors) for a connection.
   */
  async resetSyncStats(orgId: string, connectionId?: string) {
    const connection = await this.resolveConnection(orgId, connectionId);
    const metadata = this.parseMetadata(connection.metadata);
    const updatedMetadata: GoogleSheetMetadata = {
      ...metadata,
      recordsAdded: 0,
      recordsUpdated: 0,
      failedRecords: 0,
      syncErrors: [],
    };
    await this.prisma.marketingConnection.update({
      where: { id: connection.id },
      data: {
        lastError: null,
        metadata: updatedMetadata as any,
      },
    });
    return { ok: true, message: 'Sync statistics reset successfully' };
  }

  /**
   * Normalizes human-entered lead statuses to valid Prisma LeadStatus enum values.
   */
  normalizeLeadStatus(statusStr?: string | null): LeadStatus {
    if (!statusStr) return LeadStatus.new;
    const clean = statusStr.trim().toLowerCase().replace(/[\s-]+/g, '_');
    switch (clean) {
      case 'contacted':
        return LeadStatus.contacted;
      case 'follow_up':
      case 'followup':
        return LeadStatus.follow_up;
      case 'site_visit':
      case 'sitevisit':
      case 'visit':
        return LeadStatus.site_visit;
      case 'negotiation':
      case 'negotiating':
        return LeadStatus.negotiation;
      case 'won':
      case 'closed_won':
      case 'booked':
        return LeadStatus.won;
      case 'lost':
      case 'closed_lost':
      case 'dropped':
        return LeadStatus.lost;
      default:
        return LeadStatus.new;
    }
  }

  /**
   * Handles incoming webhooks triggered by Google Apps Script on the connected sheet.
   */
  async handleWebhook(payload: {
    token?: string;
    secret?: string;
    connectionId?: string;
    action?: string;
    spreadsheetId?: string;
    sheetName?: string;
    sheetTabId?: string | number;
    rowNumber?: number;
    lead?: Record<string, unknown>;
    leads?: Array<Record<string, unknown>>;
    [key: string]: unknown;
  }) {
    const token = (payload.token || payload.secret || '').trim();
    if (!token) {
      throw new UnauthorizedException('Missing webhook authorization token');
    }

    let connection: any = null;
    if (payload.connectionId) {
      connection = await this.prisma.marketingConnection.findUnique({
        where: { id: payload.connectionId },
      });
      if (connection) {
        const meta = this.parseMetadata(connection.metadata);
        if (meta.webhookSecret !== token) {
          connection = null;
        }
      }
    }

    if (!connection) {
      const candidates = await this.prisma.marketingConnection.findMany({
        where: { platformKey: 'google_sheets' },
      });
      connection = candidates.find((c) => {
        const meta = this.parseMetadata(c.metadata);
        return meta.webhookSecret === token;
      });
    }

    if (!connection) {
      throw new UnauthorizedException('Invalid Google Sheets webhook token');
    }

    const metadata = this.parseMetadata(connection.metadata);

    // Ping / verification action
    if (payload.action === 'ping') {
      return {
        ok: true,
        message: 'Google Sheets webhook connected to CRM successfully!',
        connectionId: connection.id,
        accountName: connection.externalAccountName,
        projectId: connection.projectId,
      };
    }

    // Check if auto-sync is turned off
    const isAutoSyncOn = metadata.autoSync !== false;
    if (!isAutoSyncOn && payload.action !== 'manual_sync' && payload.action !== 'batch') {
      return {
        ok: false,
        paused: true,
        message: 'Real-time auto-sync is currently paused for this connection. Re-enable in CRM to sync leads.',
      };
    }

    let recordsAdded = metadata.recordsAdded ?? 0;
    let recordsUpdated = metadata.recordsUpdated ?? 0;
    let failedRecords = metadata.failedRecords ?? 0;
    let syncErrors = Array.isArray(metadata.syncErrors) ? [...metadata.syncErrors] : [];

    // Single row edit sync
    if (payload.lead) {
      const result = await this.syncSingleLeadFromSheet(
        connection,
        payload.lead,
        payload.spreadsheetId,
        payload.sheetName,
        payload.sheetTabId,
        payload.rowNumber,
      );

      if (result.action === 'created') {
        recordsAdded++;
      } else if (result.action === 'updated' || result.action === 'linked') {
        recordsUpdated++;
      } else if (!result.ok && result.action !== 'skipped') {
        failedRecords++;
        if (result.message) {
          syncErrors.unshift(`Row ${payload.rowNumber || '?'}: ${result.message}`);
          if (syncErrors.length > 10) syncErrors = syncErrors.slice(0, 10);
        }
      }

      await this.prisma.marketingConnection.update({
        where: { id: connection.id },
        data: {
          lastSyncAt: new Date(),
          lastError: syncErrors.length > 0 ? syncErrors[0] : null,
          metadata: {
            ...metadata,
            recordsAdded,
            recordsUpdated,
            failedRecords,
            syncErrors,
            lastSyncAt: new Date().toISOString(),
          } as any,
        },
      });

      return {
        ...result,
        stats: {
          recordsAdded,
          recordsUpdated,
          failedRecords,
        },
      };
    }

    // Batch sync from sheet menu
    if (Array.isArray(payload.leads)) {
      const results: Array<{
        rowNumber: number;
        leadId: string;
        action: string;
      }> = [];

      for (const item of payload.leads) {
        const itemRowNumber = Number(item.rowNumber) || 0;
        const res = await this.syncSingleLeadFromSheet(
          connection,
          item,
          payload.spreadsheetId,
          payload.sheetName || (item.sheetName as string),
          payload.sheetTabId || (item.sheetTabId as string | number),
          itemRowNumber,
        );

        if (res && res.leadId) {
          if (res.action === 'created') recordsAdded++;
          else if (res.action === 'updated' || res.action === 'linked') recordsUpdated++;
          results.push({
            rowNumber: itemRowNumber,
            leadId: res.leadId,
            action: res.action,
          });
        } else if (!res.ok && res.action !== 'skipped') {
          failedRecords++;
          if (res.message) {
            syncErrors.unshift(`Row ${itemRowNumber}: ${res.message}`);
            if (syncErrors.length > 10) syncErrors = syncErrors.slice(0, 10);
          }
        }
      }

      await this.prisma.marketingConnection.update({
        where: { id: connection.id },
        data: {
          lastSyncAt: new Date(),
          lastError: syncErrors.length > 0 ? syncErrors[0] : null,
          metadata: {
            ...metadata,
            recordsAdded,
            recordsUpdated,
            failedRecords,
            syncErrors,
            lastSyncAt: new Date().toISOString(),
          } as any,
        },
      });

      return {
        ok: true,
        synced: results.length,
        recordsAdded,
        recordsUpdated,
        failedRecords,
        results,
      };
    }

    return { ok: true, message: 'Payload received' };
  }

  /**
   * Upserts a lead captured or edited directly inside Google Sheet.
   * Performs deduplication:
   * 1. By explicit Lead ID (Column K)
   * 2. By Google Sheet coordinates (spreadsheetId + sheetName/tabId + rowNumber)
   * 3. By existing Lead Center duplicate check (phone / email within org/project)
   */
  private async syncSingleLeadFromSheet(
    connection: ConnectionRow,
    leadInput: Record<string, unknown>,
    spreadsheetId?: string,
    sheetName?: string,
    sheetTabId?: string | number,
    rowNumber?: number,
  ): Promise<{ leadId?: string; action: string; ok: boolean; message?: string }> {
    const orgId = connection.orgId;
    const name = String(leadInput.name || '').trim();
    const phone = String(leadInput.phone || '').trim();
    const email = String(leadInput.email || '').trim().toLowerCase();
    const leadId = String(leadInput.id || leadInput.leadId || '').trim();
    const status = this.normalizeLeadStatus(String(leadInput.status || ''));
    const notes = String(leadInput.notes || leadInput.message || '').trim();
    const projectStr = String(leadInput.project || '').trim();
    const source = String(leadInput.source || 'google_sheets').trim();
    const platform = String(leadInput.platform || 'google_sheets').trim();
    const campaign = String(leadInput.campaign || '').trim();

    // Skip empty lines with no identifying info
    if (!name && !phone && !email && !leadId) {
      return { ok: false, action: 'skipped', message: 'Empty lead row skipped' };
    }

    // Resolve project ID:
    // 1. By project name or ID specified in sheet column
    // 2. By sheetName matching a project name (multi-tab support)
    // 3. Fallback to connection.projectId
    let resolvedProjectId = connection.projectId;
    const projectLookupTarget = projectStr || sheetName;
    if (projectLookupTarget) {
      const matchedProject = await this.prisma.project.findFirst({
        where: {
          orgId,
          OR: [
            { name: { equals: projectLookupTarget, mode: 'insensitive' } },
            { id: projectLookupTarget },
          ],
        },
        select: { id: true },
      });
      if (matchedProject) {
        resolvedProjectId = matchedProject.id;
      }
    }

    let existingLead: any = null;

    // 1. Check by explicit Lead ID (Column K)
    if (leadId) {
      existingLead = await this.prisma.lead.findFirst({
        where: { id: leadId, orgId },
      });
    }

    // 2. Check by Google Sheet coordinates (same sheet + same tab + same row)
    if (!existingLead && spreadsheetId && rowNumber) {
      existingLead = await this.prisma.lead.findFirst({
        where: {
          orgId,
          AND: [
            { data: { path: ['googleSheetId'], equals: spreadsheetId } },
            { data: { path: ['googleSheetRow'], equals: rowNumber } },
            ...(sheetName
              ? [{ data: { path: ['googleSheetTabName'], equals: sheetName } }]
              : []),
          ],
        },
        orderBy: { createdAt: 'desc' },
      });
    }

    // 3. Check by contact deduplication (existing Lead Center logic)
    if (!existingLead && (phone || email)) {
      const orConditions: any[] = [];
      if (phone) {
        orConditions.push({ data: { path: ['phone'], equals: phone } });
      }
      if (email) {
        orConditions.push({ data: { path: ['email'], equals: email } });
      }
      if (orConditions.length > 0) {
        existingLead = await this.prisma.lead.findFirst({
          where: {
            orgId,
            ...(resolvedProjectId ? { projectId: resolvedProjectId } : {}),
            OR: orConditions,
          },
          orderBy: { createdAt: 'desc' },
        });
      }
    }

    // If existing lead found: UPDATE
    if (existingLead) {
      const existingData = (existingLead.data as Record<string, unknown>) ?? {};
      const updatedData = {
        ...existingData,
        ...(name ? { fullName: name, name } : {}),
        ...(phone ? { phone } : {}),
        ...(email ? { email } : {}),
        ...(notes ? { notes } : {}),
        googleSheetId: spreadsheetId || existingData.googleSheetId || null,
        googleSheetTabId:
          sheetTabId != null
            ? String(sheetTabId)
            : (existingData.googleSheetTabId || null),
        googleSheetTabName: sheetName || existingData.googleSheetTabName || null,
        googleSheetRow: rowNumber || existingData.googleSheetRow || null,
        projectId: resolvedProjectId || existingLead.projectId || null,
        lastSyncedFromSheetAt: new Date().toISOString(),
      };

      const updated = await this.prisma.lead.update({
        where: { id: existingLead.id },
        data: {
          data: updatedData,
          status,
          ...(resolvedProjectId ? { projectId: resolvedProjectId } : {}),
          ...(campaign ? { campaign } : {}),
        },
      });

      return { ok: true, leadId: updated.id, action: 'updated' };
    }

    // If not found: CREATE new lead
    const capturedAtStr = String(leadInput.capturedAt || '');
    const createdAt =
      capturedAtStr && !isNaN(Date.parse(capturedAtStr))
        ? new Date(capturedAtStr)
        : new Date();

    const leadData = {
      fullName: name || 'Google Sheets Lead',
      name: name || 'Google Sheets Lead',
      phone: phone || '',
      email: email || '',
      notes,
      source: 'google_sheets',
      firstTouchSource: 'google_sheets',
      lastTouchSource: 'google_sheets',
      googleSheetId: spreadsheetId || null,
      googleSheetTabId: sheetTabId != null ? String(sheetTabId) : null,
      googleSheetTabName: sheetName || null,
      googleSheetRow: rowNumber || null,
      projectId: resolvedProjectId || null,
      lastSyncedFromSheetAt: new Date().toISOString(),
    };

    const created = await this.prisma.lead.create({
      data: {
        orgId,
        projectId: resolvedProjectId || null,
        source: source || 'google_sheets',
        platform: platform || 'google_sheets',
        campaign: campaign || null,
        status,
        data: leadData,
        configurations: [],
        tags: [],
        createdAt,
      },
    });

    return { ok: true, leadId: created.id, action: 'created' };
  }

  /**
   * Generates production-ready Google Apps Script (Code.gs) for real-time sync
   * with automatic row detection, exponential backoff retries, and failed-queue management.
   */
  generateAppsScriptCode(params: {
    webhookUrl: string;
    webhookToken?: string;
    connectionId: string;
    accountName?: string;
    projectId?: string | null;
    projectName?: string | null;
  }): string {
    const {
      webhookUrl,
      webhookToken,
      connectionId,
      accountName,
      projectId,
      projectName,
    } = params;

    return `/**
 * ============================================================================
 * REAL-TIME GOOGLE SHEETS TO CRM LEAD SYNC (GOOGLE APPS SCRIPT)
 * Account: ${accountName || 'Google Sheets & Drive'}
 * Project: ${projectName || 'All Projects / Unassigned'}
 * ============================================================================
 * 
 * INSTRUCTIONS:
 * 1. In this Google Sheet, open Extensions > Apps Script in the top menu.
 * 2. Select and delete all existing code inside "Code.gs", then paste this script.
 * 3. Click the Save icon (💾) at the top.
 * 4. In the function dropdown, select "initialSetup" and click "Run".
 *    (Google will prompt for one-time permission to allow web requests - click Allow).
 * 5. Return to your Google Sheet and reload the page.
 *    A new menu "⚡ Lead Center CRM" will appear in the top toolbar!
 *
 * FEATURES:
 * - Real-time auto-sync on new row additions and edits.
 * - Deduplication: automatically writes CRM Lead ID back into Column K.
 * - Automatic exponential backoff retries on network failures.
 * - Multi-tab support: active tab name and sheet ID are transmitted.
 */

const CRM_CONFIG = {
  WEBHOOK_URL: '${webhookUrl}',
  WEBHOOK_TOKEN: '${webhookToken || ''}',
  CONNECTION_ID: '${connectionId}',
  PROJECT_ID: '${projectId || ''}',
  PROJECT_NAME: '${projectName || ''}',

  // Column Mapping (1-based index)
  COL_CAPTURED_AT: 1, // Col A: Captured At
  COL_NAME: 2,        // Col B: Name
  COL_PHONE: 3,       // Col C: Phone
  COL_EMAIL: 4,       // Col D: Email
  COL_SOURCE: 5,      // Col E: Source
  COL_PLATFORM: 6,    // Col F: Platform
  COL_CAMPAIGN: 7,    // Col G: Campaign
  COL_PROJECT: 8,     // Col H: Project
  COL_STATUS: 9,      // Col I: Status
  COL_NOTES: 10,      // Col J: Notes / Message
  COL_LEAD_ID: 11,    // Col K: Lead ID (Auto-populated by CRM)
};

/**
 * Creates custom CRM menu when spreadsheet is opened.
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('⚡ Lead Center CRM')
    .addItem('🚀 Setup Real-Time Auto-Sync', 'initialSetup')
    .addItem('🔄 Sync Entire Sheet to CRM', 'syncAllSheetLeads')
    .addItem('🎯 Sync Selected Row to CRM', 'syncSelectedRow')
    .addItem('⚠️ Retry Failed Rows', 'retryFailedRows')
    .addSeparator()
    .addItem('🔌 Test CRM Connection', 'testConnection')
    .addToUi();
}

/**
 * One-time setup: registers an installable trigger to catch all edits
 * and send them to the CRM webhook.
 */
function initialSetup() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet();

  // Clear existing triggers to prevent duplicate trigger executions
  const triggers = ScriptApp.getUserTriggers(sheet);
  for (let i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'handleSheetEdit') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }

  // Create an installable onEdit trigger (allows UrlFetchApp requests)
  ScriptApp.newTrigger('handleSheetEdit')
    .forSpreadsheet(sheet)
    .onEdit()
    .create();

  // Test connection to verify webhook
  const testRes = testConnection(true);

  if (testRes) {
    SpreadsheetApp.getUi().alert(
      '✅ Real-Time Auto-Sync Active!',
      'Auto-sync has been successfully enabled for this spreadsheet.\\n\\nEvery time a row is added or updated, it will automatically push to Lead Center CRM in real time.\\n\\nYou can also use the "⚡ Lead Center CRM" menu anytime to batch sync.',
      SpreadsheetApp.getUi().ButtonSet.OK
    );
  }
}

/**
 * Trigger handler executed automatically whenever any cell is edited.
 */
function handleSheetEdit(e) {
  if (!e || !e.range) return;
  const range = e.range;
  const sheet = range.getSheet();
  const row = range.getRow();

  // Skip header row
  if (row <= 1) return;

  // Don't loop if editing the Lead ID column itself
  if (range.getColumn() === CRM_CONFIG.COL_LEAD_ID) return;

  syncSingleRow(sheet, row);
}

/**
 * Performs HTTP fetch with exponential backoff retry for network resilience.
 */
function fetchWithRetry(url, options, maxRetries) {
  const retries = maxRetries || 3;
  let delay = 1000;
  for (let i = 0; i < retries; i++) {
    try {
      const response = UrlFetchApp.fetch(url, options);
      const code = response.getResponseCode();
      if (code >= 200 && code < 500) {
        return response;
      }
      Logger.log('Server response ' + code + ', retrying in ' + delay + 'ms...');
    } catch (e) {
      Logger.log('Fetch attempt ' + (i + 1) + ' failed: ' + e.toString());
      if (i === retries - 1) throw e;
    }
    Utilities.sleep(delay);
    delay *= 2;
  }
  throw new Error('Request failed after ' + retries + ' retries.');
}

/**
 * Reads row columns and sends to CRM webhook with retry support.
 */
function syncSingleRow(sheet, row) {
  const values = sheet.getRange(row, 1, 1, 11).getValues()[0];

  const leadData = {
    capturedAt: values[CRM_CONFIG.COL_CAPTURED_AT - 1] ? String(values[CRM_CONFIG.COL_CAPTURED_AT - 1]) : '',
    name: String(values[CRM_CONFIG.COL_NAME - 1] || '').trim(),
    phone: String(values[CRM_CONFIG.COL_PHONE - 1] || '').trim(),
    email: String(values[CRM_CONFIG.COL_EMAIL - 1] || '').trim(),
    source: String(values[CRM_CONFIG.COL_SOURCE - 1] || 'google_sheets').trim(),
    platform: String(values[CRM_CONFIG.COL_PLATFORM - 1] || 'google_sheets').trim(),
    campaign: String(values[CRM_CONFIG.COL_CAMPAIGN - 1] || '').trim(),
    project: String(values[CRM_CONFIG.COL_PROJECT - 1] || CRM_CONFIG.PROJECT_NAME || '').trim(),
    status: String(values[CRM_CONFIG.COL_STATUS - 1] || 'New').trim(),
    notes: String(values[CRM_CONFIG.COL_NOTES - 1] || '').trim(),
    id: String(values[CRM_CONFIG.COL_LEAD_ID - 1] || '').trim(),
  };

  // Skip completely empty rows
  if (!leadData.name && !leadData.phone && !leadData.email && !leadData.id) {
    return null;
  }

  const payload = {
    token: CRM_CONFIG.WEBHOOK_TOKEN,
    connectionId: CRM_CONFIG.CONNECTION_ID,
    spreadsheetId: sheet.getParent().getId(),
    sheetName: sheet.getName(),
    sheetTabId: sheet.getSheetId(),
    action: 'edit',
    rowNumber: row,
    lead: leadData,
  };

  try {
    const options = {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    };

    const response = fetchWithRetry(CRM_CONFIG.WEBHOOK_URL, options, 3);
    const code = response.getResponseCode();
    if (code >= 200 && code < 300) {
      const result = JSON.parse(response.getContentText());
      // If newly created in CRM, write back the generated Lead ID into Column K
      if (result.leadId && !leadData.id) {
        sheet.getRange(row, CRM_CONFIG.COL_LEAD_ID).setValue(result.leadId);
      }
      return result;
    } else {
      Logger.log('CRM Webhook error response: ' + response.getContentText());
      saveFailedRow(row);
    }
  } catch (err) {
    Logger.log('CRM Sync exception for row ' + row + ': ' + err.toString());
    saveFailedRow(row);
  }
  return null;
}

/**
 * Stores a failed row number in ScriptProperties for future retry.
 */
function saveFailedRow(rowNumber) {
  try {
    const props = PropertiesService.getScriptProperties();
    const existing = props.getProperty('FAILED_ROWS') || '';
    const set = new Set(existing ? existing.split(',').map(Number) : []);
    set.add(rowNumber);
    props.setProperty('FAILED_ROWS', Array.from(set).join(','));
  } catch (e) {}
}

/**
 * Retries all previously failed rows recorded in ScriptProperties.
 */
function retryFailedRows() {
  const sheet = SpreadsheetApp.getActiveSheet();
  const props = PropertiesService.getScriptProperties();
  const raw = props.getProperty('FAILED_ROWS') || '';
  if (!raw) {
    SpreadsheetApp.getUi().alert('No failed rows pending retry.');
    return;
  }

  const rows = raw.split(',').map(Number).filter(function(r) { return r > 1; });
  let succeeded = 0;
  const stillFailed = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const res = syncSingleRow(sheet, r);
    if (res && res.ok) {
      succeeded++;
    } else {
      stillFailed.push(r);
    }
  }

  props.setProperty('FAILED_ROWS', stillFailed.join(','));
  SpreadsheetApp.getUi().alert(
    'Retry Complete',
    'Retried ' + rows.length + ' rows. Succeeded: ' + succeeded + ', Remaining failed: ' + stillFailed.length,
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

/**
 * Manually syncs the currently selected row.
 */
function syncSelectedRow() {
  const sheet = SpreadsheetApp.getActiveSheet();
  const row = sheet.getActiveCell().getRow();
  if (row <= 1) {
    SpreadsheetApp.getUi().alert('Please select a lead row below the header (Row 2 or later).');
    return;
  }
  const result = syncSingleRow(sheet, row);
  if (result && result.ok) {
    SpreadsheetApp.getActiveSpreadsheet().toast('Row ' + row + ' synced to CRM successfully!', 'Sync Complete', 3);
  } else {
    SpreadsheetApp.getUi().alert('Sync completed or row had no lead contact data.');
  }
}

/**
 * Batch syncs all rows from Row 2 down to the CRM.
 */
function syncAllSheetLeads() {
  const sheet = SpreadsheetApp.getActiveSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) {
    SpreadsheetApp.getUi().alert('No leads found in this sheet.');
    return;
  }

  const range = sheet.getRange(2, 1, lastRow - 1, 11);
  const rows = range.getValues();
  const leadsToSync = [];

  for (let i = 0; i < rows.length; i++) {
    const values = rows[i];
    const rowNumber = i + 2;
    const name = String(values[CRM_CONFIG.COL_NAME - 1] || '').trim();
    const phone = String(values[CRM_CONFIG.COL_PHONE - 1] || '').trim();
    const email = String(values[CRM_CONFIG.COL_EMAIL - 1] || '').trim();
    const id = String(values[CRM_CONFIG.COL_LEAD_ID - 1] || '').trim();

    if (!name && !phone && !email && !id) continue;

    leadsToSync.push({
      rowNumber: rowNumber,
      id: id,
      capturedAt: values[CRM_CONFIG.COL_CAPTURED_AT - 1] ? String(values[CRM_CONFIG.COL_CAPTURED_AT - 1]) : '',
      name: name,
      phone: phone,
      email: email,
      source: String(values[CRM_CONFIG.COL_SOURCE - 1] || 'google_sheets').trim(),
      platform: String(values[CRM_CONFIG.COL_PLATFORM - 1] || 'google_sheets').trim(),
      campaign: String(values[CRM_CONFIG.COL_CAMPAIGN - 1] || '').trim(),
      project: String(values[CRM_CONFIG.COL_PROJECT - 1] || CRM_CONFIG.PROJECT_NAME || '').trim(),
      status: String(values[CRM_CONFIG.COL_STATUS - 1] || 'New').trim(),
      notes: String(values[CRM_CONFIG.COL_NOTES - 1] || '').trim(),
    });
  }

  if (leadsToSync.length === 0) {
    SpreadsheetApp.getUi().alert('No lead rows found to sync.');
    return;
  }

  const payload = {
    token: CRM_CONFIG.WEBHOOK_TOKEN,
    connectionId: CRM_CONFIG.CONNECTION_ID,
    spreadsheetId: sheet.getParent().getId(),
    sheetName: sheet.getName(),
    sheetTabId: sheet.getSheetId(),
    action: 'batch',
    leads: leadsToSync,
  };

  const options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  };

  try {
    const response = fetchWithRetry(CRM_CONFIG.WEBHOOK_URL, options, 3);
    const result = JSON.parse(response.getContentText());
    if (result && result.results) {
      for (let j = 0; j < result.results.length; j++) {
        const item = result.results[j];
        if (item.leadId && item.rowNumber) {
          sheet.getRange(item.rowNumber, CRM_CONFIG.COL_LEAD_ID).setValue(item.leadId);
        }
      }
      SpreadsheetApp.getUi().alert(
        'Sync Complete',
        'Successfully synced ' + result.synced + ' lead(s) to CRM!\\nAdded: ' + (result.recordsAdded || 0) + ', Updated: ' + (result.recordsUpdated || 0),
        SpreadsheetApp.getUi().ButtonSet.OK
      );
    } else {
      SpreadsheetApp.getUi().alert('Sync response: ' + response.getContentText());
    }
  } catch (err) {
    SpreadsheetApp.getUi().alert('Sync error: ' + err.toString());
  }
}

/**
 * Tests connection with the CRM webhook endpoint.
 */
function testConnection(silent) {
  const payload = {
    token: CRM_CONFIG.WEBHOOK_TOKEN,
    connectionId: CRM_CONFIG.CONNECTION_ID,
    action: 'ping',
  };

  try {
    const response = fetchWithRetry(CRM_CONFIG.WEBHOOK_URL, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    }, 2);

    const code = response.getResponseCode();
    if (code >= 200 && code < 300) {
      if (!silent) {
        SpreadsheetApp.getUi().alert(
          '✅ Connection OK!',
          'Your Google Sheet is successfully connected to Lead Center CRM.\\n\\n' + response.getContentText(),
          SpreadsheetApp.getUi().ButtonSet.OK
        );
      }
      return true;
    } else {
      if (!silent) {
        SpreadsheetApp.getUi().alert('❌ Connection Failed (HTTP ' + code + '):\\n' + response.getContentText());
      }
      return false;
    }
  } catch (err) {
    if (!silent) {
      SpreadsheetApp.getUi().alert('❌ Connection Error:\\n' + err.toString());
    }
    return false;
  }
}
`;
  }
}
