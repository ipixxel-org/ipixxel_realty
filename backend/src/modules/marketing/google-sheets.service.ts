import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
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
  // Per-project sheet behavior
  sheetPerProject?: boolean;
  createSheetPerProject?: boolean;
  projectSheetNames?: Record<string, string>; // projectId -> sheet/tab name
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
  connectedAt: Date;
  connectedBy?: string | null;
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
}
