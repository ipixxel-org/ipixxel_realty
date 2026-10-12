import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import Razorpay from 'razorpay';
import { PrismaService } from '../../database/prisma.service';
import { frontendBaseUrl } from '../../common/utils/app-url.util';
import {
  RAZORPAY_CONFIG,
  razorpayModeOf,
  webhookSecretProblem,
  type RazorpayConfig,
} from './razorpay.config';
import type {
  TestRazorpaySettingsDto,
  UpdateRazorpaySettingsDto,
} from './dto/razorpay-settings.dto';

/** What the API returns in place of a stored secret (same as SMTP). */
export const SECRET_MASK = '••••••••';

const SETTINGS_ID = 'default';
const CACHE_TTL_MS = 30_000;

export type RazorpaySource = 'database' | 'env' | null;

export interface ResolvedRazorpay {
  /** Usable config, or null when not configured / turned off. */
  config: RazorpayConfig | null;
  source: RazorpaySource;
  isActive: boolean;
}

function isBlankOrMask(value: string | undefined): boolean {
  const v = (value ?? '').trim();
  return v === '' || v === SECRET_MASK;
}

function errorText(err: unknown): string {
  const e = err as {
    statusCode?: number;
    error?: { description?: string };
    message?: string;
  };
  return e?.error?.description || e?.message || 'Unknown error';
}

/**
 * Resolves the Razorpay credentials (console row first, env fallback) and
 * manages the console row. Secrets never leave this service except to the
 * gateway: the admin view only gets masks and has* flags.
 */
@Injectable()
export class RazorpaySettingsService {
  private readonly logger = new Logger(RazorpaySettingsService.name);
  private cache: { value: ResolvedRazorpay; at: number } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(RAZORPAY_CONFIG) private readonly envConfig: RazorpayConfig | null,
  ) {}

  /** Cached for a few seconds; saving through this service invalidates it. */
  async resolve(): Promise<ResolvedRazorpay> {
    if (this.cache && Date.now() - this.cache.at < CACHE_TTL_MS) {
      return this.cache.value;
    }
    const value = await this.load();
    this.cache = { value, at: Date.now() };
    return value;
  }

  async current(): Promise<RazorpayConfig | null> {
    return (await this.resolve()).config;
  }

  invalidate(): void {
    this.cache = null;
  }

  private async load(): Promise<ResolvedRazorpay> {
    const row = await this.prisma.razorpaySettings.findUnique({
      where: { id: SETTINGS_ID },
    });
    const isActive = row?.isActive ?? true;

    if (row?.keyId) {
      const mode = razorpayModeOf(row.keyId);
      const complete = Boolean(
        mode &&
        row.keySecret &&
        row.webhookSecret &&
        !webhookSecretProblem(row.keyId, row.keySecret, row.webhookSecret),
      );
      if (!complete) {
        this.logger.warn(
          'Razorpay settings in the console are incomplete; payments are unavailable until they are fixed.',
        );
      }
      return {
        source: 'database',
        isActive,
        config:
          complete && isActive
            ? {
                keyId: row.keyId,
                keySecret: row.keySecret!,
                webhookSecret: row.webhookSecret!,
                mode: mode!,
              }
            : null,
      };
    }

    if (this.envConfig) {
      return {
        source: 'env',
        isActive,
        config: isActive ? this.envConfig : null,
      };
    }
    return { source: null, isActive, config: null };
  }

  // -------------------------------------------------------------------------
  // Admin view / edit
  // -------------------------------------------------------------------------

  async getForAdmin() {
    const row = await this.prisma.razorpaySettings.findUnique({
      where: { id: SETTINGS_ID },
    });
    const resolved = await this.resolve();

    // Show the console row if it has a key id; otherwise the env fallback's
    // public key id (secrets are never exposed from either source).
    const fromDb = Boolean(row?.keyId);
    const keyId = fromDb ? row!.keyId! : (this.envConfig?.keyId ?? '');
    const hasKeySecret = fromDb
      ? Boolean(row!.keySecret)
      : Boolean(this.envConfig);
    const hasWebhookSecret = fromDb
      ? Boolean(row!.webhookSecret)
      : Boolean(this.envConfig);

    return {
      source: resolved.source,
      isActive: resolved.isActive,
      configured: Boolean(keyId && hasKeySecret && hasWebhookSecret),
      ready: resolved.config !== null,
      mode: keyId ? razorpayModeOf(keyId) : null,
      keyId,
      keySecret: hasKeySecret ? SECRET_MASK : '',
      hasKeySecret,
      webhookSecret: hasWebhookSecret ? SECRET_MASK : '',
      hasWebhookSecret,
      envFallbackAvailable: this.envConfig !== null,
      webhookUrl: `${apiPublicUrl()}/webhooks/razorpay`,
      updatedAt: row?.updatedAt ?? null,
    };
  }

  /**
   * Save console credentials. Secrets left blank or as the mask keep their
   * stored value; a new key id must come with its own key secret (a secret
   * belongs to exactly one key).
   */
  async update(dto: UpdateRazorpaySettingsDto, actorId: string) {
    const existing = await this.prisma.razorpaySettings.findUnique({
      where: { id: SETTINGS_ID },
    });

    const keyId = (dto.keyId ?? existing?.keyId ?? '').trim();
    if (!keyId) {
      throw new BadRequestException('Razorpay Key ID is required.');
    }
    if (!razorpayModeOf(keyId)) {
      throw new BadRequestException(
        'Key ID looks wrong: it should start with rzp_test_ or rzp_live_.',
      );
    }

    const keyIdChanged = keyId !== (existing?.keyId ?? '');
    let keySecret = existing?.keySecret ?? null;
    if (!isBlankOrMask(dto.keySecret)) {
      keySecret = dto.keySecret!.trim();
    } else if (keyIdChanged) {
      throw new BadRequestException(
        'Enter the Key Secret that belongs to this Key ID.',
      );
    }
    let webhookSecret = existing?.webhookSecret ?? null;
    if (!isBlankOrMask(dto.webhookSecret)) {
      webhookSecret = dto.webhookSecret!.trim();
    }
    if (!keySecret) throw new BadRequestException('Key Secret is required.');
    if (!webhookSecret) {
      throw new BadRequestException('Webhook Secret is required.');
    }
    const problem = webhookSecretProblem(keyId, keySecret, webhookSecret);
    if (problem) throw new BadRequestException(problem);

    const isActive = dto.isActive ?? existing?.isActive ?? true;
    const changed = {
      keyId: keyIdChanged,
      keySecret: keySecret !== (existing?.keySecret ?? null),
      webhookSecret: webhookSecret !== (existing?.webhookSecret ?? null),
      isActive: isActive !== (existing?.isActive ?? true),
    };

    await this.prisma.$transaction(async (tx) => {
      await tx.razorpaySettings.upsert({
        where: { id: SETTINGS_ID },
        create: {
          id: SETTINGS_ID,
          keyId,
          keySecret,
          webhookSecret,
          isActive,
          updatedById: actorId,
        },
        update: {
          keyId,
          keySecret,
          webhookSecret,
          isActive,
          updatedById: actorId,
        },
      });
      // Never log secret values — only which fields changed.
      await tx.auditLog.create({
        data: {
          actorId,
          action: 'razorpay_settings_updated',
          entity: 'RazorpaySettings',
          entityId: SETTINGS_ID,
          metadata: { keyId, mode: razorpayModeOf(keyId), changed },
        },
      });
    });

    this.invalidate();
    return this.getForAdmin();
  }

  /** Remove console credentials; the env fallback (if any) takes over. */
  async clear(actorId: string) {
    await this.prisma.$transaction(async (tx) => {
      await tx.razorpaySettings.deleteMany({ where: { id: SETTINGS_ID } });
      await tx.auditLog.create({
        data: {
          actorId,
          action: 'razorpay_settings_cleared',
          entity: 'RazorpaySettings',
          entityId: SETTINGS_ID,
        },
      });
    });
    this.invalidate();
    return this.getForAdmin();
  }

  /**
   * Check a key id + secret against Razorpay (lists one order). Uses the
   * values typed in the form, falling back to the stored secret when the
   * field still shows the mask.
   */
  async testCredentials(dto: TestRazorpaySettingsDto) {
    const stored = await this.resolveStoredPair();
    const keyId = (dto.keyId ?? '').trim() || stored.keyId;
    let keySecret = isBlankOrMask(dto.keySecret) ? null : dto.keySecret!.trim();
    if (!keySecret && keyId === stored.keyId) keySecret = stored.keySecret;

    if (!keyId || !razorpayModeOf(keyId)) {
      throw new BadRequestException(
        'Enter a Key ID starting with rzp_test_ or rzp_live_.',
      );
    }
    if (!keySecret) {
      throw new BadRequestException('Enter the Key Secret to test.');
    }

    const result = await probeRazorpayCredentials(keyId, keySecret);
    if (result !== 'ok') throw new BadRequestException(result);
    return { ok: true, mode: razorpayModeOf(keyId) };
  }

  private async resolveStoredPair(): Promise<{
    keyId: string;
    keySecret: string | null;
  }> {
    const row = await this.prisma.razorpaySettings.findUnique({
      where: { id: SETTINGS_ID },
    });
    if (row?.keyId) return { keyId: row.keyId, keySecret: row.keySecret };
    if (this.envConfig) {
      return {
        keyId: this.envConfig.keyId,
        keySecret: this.envConfig.keySecret,
      };
    }
    return { keyId: '', keySecret: null };
  }
}

/**
 * Check credentials with a cheap authenticated call: fetch a payment id that
 * can't exist. Bad credentials get 401; good ones get a 400 "does not exist"
 * (or, improbably, the payment). Returns 'ok' or a message for the admin.
 */
export async function probeRazorpayCredentials(
  keyId: string,
  keySecret: string,
): Promise<'ok' | string> {
  const client = new Razorpay({ key_id: keyId, key_secret: keySecret });
  try {
    await client.payments.fetch('pay_00000000000000');
    return 'ok';
  } catch (err) {
    const status = (err as { statusCode?: number })?.statusCode;
    if (status === 401) {
      return 'Razorpay rejected these credentials: the Key ID and Key Secret do not match.';
    }
    if (status === 429) {
      return 'Razorpay is rate-limiting requests right now. Wait a minute and test again.';
    }
    if (status === 400 || status === 404) return 'ok';
    return `Could not reach Razorpay: ${errorText(err)}`;
  }
}

/** Public API base Razorpay posts webhooks to (same rule as Meta). */
function apiPublicUrl(): string {
  const explicit = (process.env.BACKEND_PUBLIC_URL ?? '').trim();
  if (explicit) return explicit.replace(/\/$/, '');
  return `${frontendBaseUrl()}/api`;
}
