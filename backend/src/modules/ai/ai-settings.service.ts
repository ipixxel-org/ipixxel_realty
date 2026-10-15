import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { UpdateAiSettingsDto } from './dto/update-ai-settings.dto';
import type { AiProviderConfig } from './ai-provider';

const SETTINGS_ID = 'default';

/** Sent by the API in place of a stored secret; posting it back keeps it. */
export const AI_SECRET_MASK = '••••••••';

const ENV_KEYS = [
  'AI_PROVIDER',
  'GEMINI_API_KEY',
  'GEMINI_MODEL',
  'GEMINI_THINKING_BUDGET',
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_MODEL',
  'AI_GENERATE_API_URL',
  'AI_GENERATE_API_KEY',
] as const;

export const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash';
export const DEFAULT_ANTHROPIC_MODEL = 'claude-sonnet-4-20250514';

/**
 * Platform-wide AI provider credentials, editable from the Super Admin console
 * instead of the server .env. Stored in the runtime-bootstrapped single-row
 * table "identity"."ai_settings" (same pattern as marketing_settings).
 *
 * The database row is the source of truth. The generator calls
 * getProviderConfig() on every request, so a save applies immediately on
 * every server process — no restart, and no reliance on process.env being
 * patched in the one process that handled the save. .env values (captured at
 * boot) remain the fallback whenever a DB field is blank, and the console
 * shows exactly the values the generator will use.
 */
@Injectable()
export class AiSettingsService implements OnModuleInit {
  private readonly logger = new Logger(AiSettingsService.name);
  private readonly envFallback: Record<string, string> = {};

  constructor(private readonly prisma: PrismaService) {
    for (const key of ENV_KEYS) {
      this.envFallback[key] = (process.env[key] ?? '').trim();
    }
  }

  async onModuleInit() {
    await this.ensureTable();
  }

  private async ensureTable() {
    try {
      await this.prisma.$executeRawUnsafe(
        `CREATE SCHEMA IF NOT EXISTS "identity";`,
      );
      await this.prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "identity"."ai_settings" (
          "id" TEXT NOT NULL DEFAULT 'default',
          "provider" TEXT,
          "gemini_api_key" TEXT,
          "gemini_model" TEXT,
          "gemini_thinking_budget" TEXT,
          "anthropic_api_key" TEXT,
          "anthropic_model" TEXT,
          "ai_generate_api_url" TEXT,
          "ai_generate_api_key" TEXT,
          "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "ai_settings_pkey" PRIMARY KEY ("id")
        );
      `);
    } catch (err: unknown) {
      this.logger.warn(`Could not verify ai_settings table: ${err}`);
    }
  }

  private async readRow(): Promise<Record<string, unknown> | null> {
    try {
      const rows = (await this.prisma.$queryRawUnsafe(
        `SELECT * FROM "identity"."ai_settings" WHERE "id" = $1 LIMIT 1`,
        SETTINGS_ID,
      )) as Array<Record<string, unknown>>;
      return rows?.[0] ?? null;
    } catch (err: unknown) {
      this.logger.warn(`Could not read ai_settings: ${err}`);
      return null;
    }
  }

  /** DB row value if set, otherwise the boot-time .env value. */
  private pick(dbValue: unknown, envKey: string): string {
    return typeof dbValue === 'string' && dbValue.trim()
      ? dbValue.trim()
      : (this.envFallback[envKey] ?? '');
  }

  /** Effective settings: saved DB values, .env for any blank field. */
  private resolveRow(row: Record<string, unknown>): AiProviderConfig {
    return {
      provider: this.pick(row.provider, 'AI_PROVIDER'),
      geminiApiKey: this.pick(row.gemini_api_key, 'GEMINI_API_KEY'),
      geminiModel:
        this.pick(row.gemini_model, 'GEMINI_MODEL') || DEFAULT_GEMINI_MODEL,
      geminiThinkingBudget: this.pick(
        row.gemini_thinking_budget,
        'GEMINI_THINKING_BUDGET',
      ),
      anthropicApiKey: this.pick(row.anthropic_api_key, 'ANTHROPIC_API_KEY'),
      anthropicModel:
        this.pick(row.anthropic_model, 'ANTHROPIC_MODEL') ||
        DEFAULT_ANTHROPIC_MODEL,
      aiGenerateApiUrl: this.pick(
        row.ai_generate_api_url,
        'AI_GENERATE_API_URL',
      ),
      aiGenerateApiKey: this.pick(
        row.ai_generate_api_key,
        'AI_GENERATE_API_KEY',
      ),
    };
  }

  /**
   * Settings the AI generator must use for this request. Read fresh from the
   * database each time so console saves take effect immediately.
   */
  async getProviderConfig(): Promise<AiProviderConfig> {
    return this.resolveRow((await this.readRow()) ?? {});
  }

  /** Masked view for the Super Admin console; secrets never leave in clear. */
  async getForAdmin() {
    const row = await this.readRow();
    const r = row ?? {};
    const resolved = this.resolveRow(r);

    return {
      source: row ? 'database' : 'env',
      provider: resolved.provider,
      geminiModel: resolved.geminiModel,
      geminiThinkingBudget: resolved.geminiThinkingBudget,
      geminiApiKey: resolved.geminiApiKey ? AI_SECRET_MASK : '',
      hasGeminiApiKey: Boolean(resolved.geminiApiKey),
      anthropicModel: resolved.anthropicModel,
      anthropicApiKey: resolved.anthropicApiKey ? AI_SECRET_MASK : '',
      hasAnthropicApiKey: Boolean(resolved.anthropicApiKey),
      aiGenerateApiUrl: resolved.aiGenerateApiUrl,
      aiGenerateApiKey: resolved.aiGenerateApiKey ? AI_SECRET_MASK : '',
      hasAiGenerateApiKey: Boolean(resolved.aiGenerateApiKey),
      updatedAt: (r.updated_at as string | undefined) ?? null,
    };
  }

  /** A blank / mask value keeps the stored secret; a new value replaces it. */
  private resolveSecret(field: string | undefined, existing: unknown): string {
    const stored = typeof existing === 'string' ? existing : '';
    if (field === undefined) return stored;
    const value = field.trim();
    if (value === '' || value === AI_SECRET_MASK) return stored;
    return value;
  }

  async update(dto: UpdateAiSettingsDto) {
    await this.ensureTable();
    const existing = (await this.readRow()) ?? {};
    const str = (v: unknown) => (typeof v === 'string' ? v : '');

    const provider =
      dto.provider !== undefined ? dto.provider.trim() : str(existing.provider);
    const geminiApiKey = this.resolveSecret(
      dto.geminiApiKey,
      existing.gemini_api_key,
    );
    const anthropicApiKey = this.resolveSecret(
      dto.anthropicApiKey,
      existing.anthropic_api_key,
    );
    const aiGenerateApiKey = this.resolveSecret(
      dto.aiGenerateApiKey,
      existing.ai_generate_api_key,
    );
    const geminiModel =
      dto.geminiModel !== undefined
        ? dto.geminiModel.trim()
        : str(existing.gemini_model);
    const geminiThinkingBudget =
      dto.geminiThinkingBudget !== undefined
        ? dto.geminiThinkingBudget.trim()
        : str(existing.gemini_thinking_budget);
    const anthropicModel =
      dto.anthropicModel !== undefined
        ? dto.anthropicModel.trim()
        : str(existing.anthropic_model);
    const aiGenerateApiUrl =
      dto.aiGenerateApiUrl !== undefined
        ? dto.aiGenerateApiUrl.trim()
        : str(existing.ai_generate_api_url);

    await this.prisma.$executeRawUnsafe(
      `INSERT INTO "identity"."ai_settings" (
        "id", "provider", "gemini_api_key", "gemini_model", "gemini_thinking_budget",
        "anthropic_api_key", "anthropic_model", "ai_generate_api_url", "ai_generate_api_key", "updated_at"
      ) VALUES ('default', $1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
      ON CONFLICT ("id") DO UPDATE SET
        "provider" = EXCLUDED."provider",
        "gemini_api_key" = EXCLUDED."gemini_api_key",
        "gemini_model" = EXCLUDED."gemini_model",
        "gemini_thinking_budget" = EXCLUDED."gemini_thinking_budget",
        "anthropic_api_key" = EXCLUDED."anthropic_api_key",
        "anthropic_model" = EXCLUDED."anthropic_model",
        "ai_generate_api_url" = EXCLUDED."ai_generate_api_url",
        "ai_generate_api_key" = EXCLUDED."ai_generate_api_key",
        "updated_at" = CURRENT_TIMESTAMP;`,
      provider || null,
      geminiApiKey || null,
      geminiModel || null,
      geminiThinkingBudget || null,
      anthropicApiKey || null,
      anthropicModel || null,
      aiGenerateApiUrl || null,
      aiGenerateApiKey || null,
    );

    return this.getForAdmin();
  }

  /** Remove console-stored credentials; .env values take over again. */
  async clear() {
    await this.ensureTable();
    try {
      await this.prisma.$executeRawUnsafe(
        `DELETE FROM "identity"."ai_settings" WHERE "id" = $1`,
        SETTINGS_ID,
      );
    } catch (err: unknown) {
      this.logger.warn(`Could not clear ai_settings: ${err}`);
    }
    return this.getForAdmin();
  }

  /** True when the selected (or auto-detected) agent has credentials. */
  async isConfigured(): Promise<boolean> {
    const v = await this.getProviderConfig();
    const requested = v.provider.toLowerCase();
    if (requested === 'gemini') return Boolean(v.geminiApiKey);
    if (requested === 'anthropic') return Boolean(v.anthropicApiKey);
    if (requested === 'external') return Boolean(v.aiGenerateApiUrl);
    return Boolean(v.geminiApiKey || v.anthropicApiKey || v.aiGenerateApiUrl);
  }
}
