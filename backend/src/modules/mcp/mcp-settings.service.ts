import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PrismaService } from '../../database/prisma.service';
import { UpdateMcpSettingsDto } from './dto/update-mcp-settings.dto';

const SETTINGS_ID = 'default';
const DEFAULT_TOKEN_TTL = '90d';

export type McpSettingsView = {
  source: 'database' | 'defaults';
  command: string;
  backendUrl: string;
  tokenExpiresIn: string;
  tsxCli: string;
  serverEntry: string;
  siteFile: string;
  brandKitDir: string;
  claudeConfigPath: string;
  updatedAt: string | null;
};

type ResolvedMcpSettings = Omit<McpSettingsView, 'source' | 'updatedAt'>;

/**
 * Super Admin-editable MCP connection settings, stored in the runtime-
 * bootstrapped single-row table "identity"."mcp_settings" (same pattern as
 * ai_settings / marketing_settings). The database is the source of truth and
 * the console can change every path / URL / token lifetime without touching
 * the server .env; blank fields fall back to auto-detected defaults.
 */
@Injectable()
export class McpSettingsService implements OnModuleInit {
  private readonly logger = new Logger(McpSettingsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.ensureTable();
  }

  private async ensureTable() {
    try {
      await this.prisma.$executeRawUnsafe(
        `CREATE SCHEMA IF NOT EXISTS "identity";`,
      );
      await this.prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "identity"."mcp_settings" (
          "id" TEXT NOT NULL DEFAULT 'default',
          "command" TEXT,
          "backend_url" TEXT,
          "token_expires_in" TEXT,
          "tsx_cli" TEXT,
          "server_entry" TEXT,
          "site_file" TEXT,
          "brand_kit_dir" TEXT,
          "claude_config_path" TEXT,
          "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "mcp_settings_pkey" PRIMARY KEY ("id")
        );
      `);
    } catch (err: unknown) {
      this.logger.warn(
        `Could not verify mcp_settings table: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private async readRow(): Promise<Record<string, unknown> | null> {
    try {
      const rows = await this.prisma.$queryRawUnsafe<
        Array<Record<string, unknown>>
      >(
        `SELECT * FROM "identity"."mcp_settings" WHERE "id" = $1 LIMIT 1`,
        SETTINGS_ID,
      );
      return rows?.[0] ?? null;
    } catch (err: unknown) {
      this.logger.warn(
        `Could not read mcp_settings: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
  }

  /** Auto-detected values used wherever the saved row is blank. */
  private defaults(): ResolvedMcpSettings {
    const root = resolveBackendRoot();
    return {
      command: 'node',
      backendUrl: `http://127.0.0.1:${process.env.PORT || 3000}`,
      tokenExpiresIn: DEFAULT_TOKEN_TTL,
      tsxCli: toPosix(
        path.join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs'),
      ),
      serverEntry: toPosix(
        path.join(root, 'mcp-dev-template', 'src', 'index.ts'),
      ),
      siteFile: toPosix(path.join(root, 'mcp-dev-template', 'site.json')),
      brandKitDir: toPosix(path.join(root, 'mcp-dev-template', 'brand-kits')),
      claudeConfigPath: resolveClaudeConfigPath(),
    };
  }

  private resolve(row: Record<string, unknown> | null): ResolvedMcpSettings {
    const d = this.defaults();
    const pick = (value: unknown, fallback: string) =>
      typeof value === 'string' && value.trim() ? value.trim() : fallback;

    return {
      command: pick(row?.command, d.command),
      backendUrl: pick(row?.backend_url, d.backendUrl).replace(/\/+$/, ''),
      tokenExpiresIn: pick(row?.token_expires_in, d.tokenExpiresIn),
      tsxCli: toPosix(pick(row?.tsx_cli, d.tsxCli)),
      serverEntry: toPosix(pick(row?.server_entry, d.serverEntry)),
      siteFile: toPosix(pick(row?.site_file, d.siteFile)),
      brandKitDir: toPosix(pick(row?.brand_kit_dir, d.brandKitDir)),
      claudeConfigPath: toPosix(
        pick(row?.claude_config_path, d.claudeConfigPath),
      ),
    };
  }

  /** Settings for the connection generator (no source/updatedAt noise). */
  async getForConnection(): Promise<ResolvedMcpSettings> {
    return this.resolve(await this.readRow());
  }

  /** Effective settings + where they came from, shown in the console. */
  async getForAdmin(): Promise<McpSettingsView> {
    const row = await this.readRow();
    return {
      source: row ? 'database' : 'defaults',
      ...this.resolve(row),
      updatedAt: row?.updated_at
        ? new Date(row.updated_at as string).toISOString()
        : null,
    };
  }

  async update(dto: UpdateMcpSettingsDto): Promise<McpSettingsView> {
    await this.ensureTable();
    const existing = (await this.readRow()) ?? {};
    const str = (value: unknown) => (typeof value === 'string' ? value : '');
    const value = (field: string | undefined, current: unknown) =>
      (field !== undefined ? field.trim() : str(current)) || null;

    const command = value(dto.command, existing.command);
    const backendUrl = value(dto.backendUrl, existing.backend_url);
    const tokenExpiresIn = value(dto.tokenExpiresIn, existing.token_expires_in);
    const tsxCli = value(dto.tsxCli, existing.tsx_cli);
    const serverEntry = value(dto.serverEntry, existing.server_entry);
    const siteFile = value(dto.siteFile, existing.site_file);
    const brandKitDir = value(dto.brandKitDir, existing.brand_kit_dir);
    const claudeConfigPath = value(
      dto.claudeConfigPath,
      existing.claude_config_path,
    );

    await this.prisma.$executeRawUnsafe(
      `INSERT INTO "identity"."mcp_settings" (
        "id", "command", "backend_url", "token_expires_in", "tsx_cli",
        "server_entry", "site_file", "brand_kit_dir", "claude_config_path", "updated_at"
      ) VALUES ('default', $1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
      ON CONFLICT ("id") DO UPDATE SET
        "command" = EXCLUDED."command",
        "backend_url" = EXCLUDED."backend_url",
        "token_expires_in" = EXCLUDED."token_expires_in",
        "tsx_cli" = EXCLUDED."tsx_cli",
        "server_entry" = EXCLUDED."server_entry",
        "site_file" = EXCLUDED."site_file",
        "brand_kit_dir" = EXCLUDED."brand_kit_dir",
        "claude_config_path" = EXCLUDED."claude_config_path",
        "updated_at" = CURRENT_TIMESTAMP;`,
      command,
      backendUrl,
      tokenExpiresIn,
      tsxCli,
      serverEntry,
      siteFile,
      brandKitDir,
      claudeConfigPath,
    );

    return this.getForAdmin();
  }

  /** Drop every override and fall back to the auto-detected defaults. */
  async reset(): Promise<McpSettingsView> {
    await this.ensureTable();
    try {
      await this.prisma.$executeRawUnsafe(
        `DELETE FROM "identity"."mcp_settings" WHERE "id" = $1`,
        SETTINGS_ID,
      );
    } catch (err: unknown) {
      this.logger.warn(
        `Could not reset mcp_settings: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    return this.getForAdmin();
  }
}

/**
 * Locate the backend package root. PM2 and `npm start` run with cwd=backend;
 * if the API was started from the repo root, fall back to `<cwd>/backend`.
 */
function resolveBackendRoot(): string {
  const cwd = process.cwd();
  if (existsSync(path.join(cwd, 'mcp-dev-template'))) return cwd;
  if (existsSync(path.join(cwd, 'backend', 'mcp-dev-template'))) {
    return path.join(cwd, 'backend');
  }
  return cwd;
}

function toPosix(value: string): string {
  return value.replace(/\\/g, '/');
}

function resolveClaudeConfigPath(): string {
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA?.trim();
    if (appData) {
      return toPosix(
        path.join(appData, 'Claude', 'claude_desktop_config.json'),
      );
    }
    return '%APPDATA%/Claude/claude_desktop_config.json';
  }
  if (process.platform === 'darwin') {
    return toPosix(
      path.join(
        os.homedir(),
        'Library',
        'Application Support',
        'Claude',
        'claude_desktop_config.json',
      ),
    );
  }
  return toPosix(
    path.join(os.homedir(), '.config', 'Claude', 'claude_desktop_config.json'),
  );
}
