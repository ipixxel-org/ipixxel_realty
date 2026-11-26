import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { JwtPayload } from '../../common/types/jwt-payload.interface';
import { McpSettingsService } from './mcp-settings.service';

export type McpServerConfig = {
  command: string;
  args: string[];
  env: Record<string, string>;
};

export type McpConnection = {
  serverName: string;
  token: string;
  expiresAt: string | null;
  config: { mcpServers: Record<string, McpServerConfig> };
  paths: {
    tsxCli: string;
    entry: string;
    apiBaseUrl: string;
    siteFile: string;
    brandKitDir: string;
  };
  claudeConfigPath: string;
};

const DEFAULT_SERVER_NAME = 'openpage';

/**
 * Builds a ready-to-paste Claude Desktop `mcpServers` entry for the OpenPage
 * MCP server. Paths, API URL and token lifetime come from the Super Admin
 * console (identity.mcp_settings) — no MCP_* env vars are involved. The token
 * is a normal access JWT (typ: 'access') so the MCP tools authenticate
 * against the existing /ai/* endpoints.
 */
@Injectable()
export class McpService {
  constructor(
    private readonly jwt: JwtService,
    private readonly settings: McpSettingsService,
  ) {}

  async connection(actor: JwtPayload): Promise<McpConnection> {
    if (!actor?.sub || !(actor.roles ?? []).includes('super_admin')) {
      throw new ForbiddenException('Super Admin access required');
    }

    const secret = process.env.JWT_SECRET?.trim();
    if (!secret) {
      throw new UnauthorizedException('Authentication is not configured');
    }

    const settings = await this.settings.getForConnection();

    const payload: JwtPayload = {
      sub: actor.sub,
      orgId: actor.orgId ?? null,
      roles: actor.roles ?? [],
      typ: 'access',
    };

    let token: string;
    try {
      token = await this.jwt.signAsync(
        payload as object,
        {
          secret,
          expiresIn: settings.tokenExpiresIn,
        } as Parameters<JwtService['signAsync']>[1],
      );
    } catch {
      throw new UnauthorizedException(
        'Could not issue an MCP token. Check the token lifetime in MCP settings.',
      );
    }

    const decoded: { exp?: number } | null = this.jwt.decode(token);
    const expiresAt = decoded?.exp
      ? new Date(decoded.exp * 1000).toISOString()
      : null;

    const env: Record<string, string> = {
      OP_API_BASE_URL: settings.backendUrl,
      OP_API_TOKEN: token,
      OP_SITE_FILE: settings.siteFile,
      OP_BRAND_KIT_DIR: settings.brandKitDir,
    };

    const config: McpConnection['config'] = {
      mcpServers: {
        [DEFAULT_SERVER_NAME]: {
          command: settings.command,
          args: [settings.tsxCli, settings.serverEntry],
          env,
        },
      },
    };

    return {
      serverName: DEFAULT_SERVER_NAME,
      token,
      expiresAt,
      config,
      paths: {
        tsxCli: settings.tsxCli,
        entry: settings.serverEntry,
        apiBaseUrl: settings.backendUrl,
        siteFile: settings.siteFile,
        brandKitDir: settings.brandKitDir,
      },
      claudeConfigPath: settings.claudeConfigPath,
    };
  }
}
