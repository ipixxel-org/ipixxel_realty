import {
  BadRequestException,
  Injectable,
  Logger,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { normalizeDomain } from '../../common/utils/domain.util';
import { UpdatePlatformConfigDto } from './dto/update-platform-config.dto';

// The single global config row id. Only one row is ever used.
const PLATFORM_CONFIG_ID = 'platform';

const SELLER_COLUMNS = [
  'seller_legal_name',
  'seller_gstin',
  'seller_state',
  'seller_address_line1',
  'seller_address_line2',
  'seller_city',
  'seller_pincode',
] as const;

/** Billing v2: the platform as GST seller. `state` is the 2-digit GST state code. */
export interface SellerSettings {
  legalName: string | null;
  gstin: string | null;
  state: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  pincode: string | null;
}

function migrateLegacyBase(base: string | null | undefined): string {
  const normalized = base ? normalizeDomain(base) : '';
  if (!normalized || normalized === 'ipixxel.in') return 'ipixxel.ae';
  return normalized;
}

// Environment keys patched live from the DB row so the existing sync
// domain.utils (subdomainHost / extractSubdomainFromHost / DNS generators)
// pick up Super Admin console changes without a redeploy or process restart.
function patchEnv(patch: Record<string, string | null>) {
  for (const [key, value] of Object.entries(patch)) {
    if (value === null || value === '') {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

@Injectable()
export class PlatformConfigService implements OnApplicationBootstrap {
  private readonly logger = new Logger(PlatformConfigService.name);

  constructor(private readonly prisma: PrismaService) {}

  private async ensureTable() {
    await this.prisma.$executeRawUnsafe(
      `CREATE SCHEMA IF NOT EXISTS "identity";`,
    );
    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "identity"."platform_configs" (
        "id" TEXT NOT NULL,
        "subdomain_mode" TEXT NOT NULL DEFAULT 'production',
        "subdomain_base" TEXT,
        "dns_mode" TEXT NOT NULL DEFAULT 'a',
        "infra_ip" TEXT,
        "infra_ipv6" TEXT,
        "infra_cname" TEXT,
        "infra_ns1" TEXT,
        "infra_ns2" TEXT,
        "billing_expiry_notify_days" INTEGER NOT NULL DEFAULT 3,
        "billing_grace_period_days" INTEGER NOT NULL DEFAULT 7,
        "billing_expiry_behavior" TEXT NOT NULL DEFAULT 'restrict',
        "billing_expiry_message" TEXT NOT NULL DEFAULT 'Your subscription is due for renewal soon. Renew to keep your landing pages and features running without interruption.',
        "primary_color" TEXT NOT NULL DEFAULT '#0f1424',
        "secondary_color" TEXT NOT NULL DEFAULT '#2a3348',
        "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "platform_configs_pkey" PRIMARY KEY ("id")
      );
    `);
    try {
      await this.prisma.$executeRawUnsafe(
        `ALTER TABLE "identity"."platform_configs" ADD COLUMN IF NOT EXISTS "primary_color" TEXT NOT NULL DEFAULT '#0f1424';`,
      );
    } catch {}
    try {
      await this.prisma.$executeRawUnsafe(
        `ALTER TABLE "identity"."platform_configs" ADD COLUMN IF NOT EXISTS "secondary_color" TEXT NOT NULL DEFAULT '#2a3348';`,
      );
    } catch {}
    // Billing v2 payment switch (also in migration 20261014090925).
    try {
      await this.prisma.$executeRawUnsafe(
        `ALTER TABLE "identity"."platform_configs" ADD COLUMN IF NOT EXISTS "online_payments_enabled" BOOLEAN NOT NULL DEFAULT false;`,
      );
    } catch {}
    // Billing v2 reminder switches (also in migration 20261015114705).
    try {
      await this.prisma.$executeRawUnsafe(
        `ALTER TABLE "identity"."platform_configs" ADD COLUMN IF NOT EXISTS "billing_reminders" JSONB;`,
      );
    } catch {
      // Column already there, or no rights to alter: reads fall back to "all on".
    }
    // Billing v2 seller (GST) settings (also in migration 20261014110220).
    for (const col of SELLER_COLUMNS) {
      try {
        await this.prisma.$executeRawUnsafe(
          `ALTER TABLE "identity"."platform_configs" ADD COLUMN IF NOT EXISTS "${col}" TEXT;`,
        );
      } catch {}
    }
  }

  /** Billing v2: which renewal reminders are on (stored JSON; null = all on). */
  async getBillingReminders(): Promise<unknown> {
    try {
      await this.ensureTable();
      const rows: { billing_reminders: unknown }[] = await this.prisma
        .$queryRaw`
        SELECT "billing_reminders" FROM "identity"."platform_configs"
        WHERE "id" = ${PLATFORM_CONFIG_ID} LIMIT 1
      `;
      return rows?.[0]?.billing_reminders ?? null;
    } catch (err) {
      this.logger.warn(
        `Could not read billing reminders: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
  }

  /** Billing v2: save which renewal reminders are on. */
  async saveBillingReminders(
    reminders: Record<string, boolean>,
  ): Promise<void> {
    await this.ensureTable();
    await this.prisma.$executeRaw`
      INSERT INTO "identity"."platform_configs" ("id", "updated_at")
      VALUES (${PLATFORM_CONFIG_ID}, CURRENT_TIMESTAMP)
      ON CONFLICT ("id") DO NOTHING
    `;
    await this.prisma.$executeRaw`
      UPDATE "identity"."platform_configs" SET
        "billing_reminders" = ${JSON.stringify(reminders)}::jsonb,
        "updated_at" = CURRENT_TIMESTAMP
      WHERE "id" = ${PLATFORM_CONFIG_ID}
    `;
  }

  /** Billing v2: the platform as GST seller. Every field null until set. */
  async getSellerSettings(): Promise<SellerSettings> {
    const empty: SellerSettings = {
      legalName: null,
      gstin: null,
      state: null,
      addressLine1: null,
      addressLine2: null,
      city: null,
      pincode: null,
    };
    try {
      await this.ensureTable();
      const rows: any[] = await this.prisma.$queryRaw`
        SELECT "seller_legal_name", "seller_gstin", "seller_state", "seller_address_line1",
               "seller_address_line2", "seller_city", "seller_pincode"
        FROM "identity"."platform_configs" WHERE "id" = ${PLATFORM_CONFIG_ID} LIMIT 1
      `;
      const r = rows?.[0];
      if (!r) return empty;
      return {
        legalName: r.seller_legal_name ?? null,
        gstin: r.seller_gstin ?? null,
        state: r.seller_state ?? null,
        addressLine1: r.seller_address_line1 ?? null,
        addressLine2: r.seller_address_line2 ?? null,
        city: r.seller_city ?? null,
        pincode: r.seller_pincode ?? null,
      };
    } catch (err: any) {
      this.logger.warn(`Could not read seller settings: ${err.message}`);
      return empty;
    }
  }

  /** Billing v2: save the seller fields (validated by the caller). */
  async saveSellerSettings(s: SellerSettings): Promise<SellerSettings> {
    await this.ensureTable();
    // Make sure the single row exists (all other columns have defaults).
    await this.prisma.$executeRaw`
      INSERT INTO "identity"."platform_configs" ("id", "updated_at")
      VALUES (${PLATFORM_CONFIG_ID}, CURRENT_TIMESTAMP)
      ON CONFLICT ("id") DO NOTHING
    `;
    await this.prisma.$executeRaw`
      UPDATE "identity"."platform_configs" SET
        "seller_legal_name" = ${s.legalName},
        "seller_gstin" = ${s.gstin},
        "seller_state" = ${s.state},
        "seller_address_line1" = ${s.addressLine1},
        "seller_address_line2" = ${s.addressLine2},
        "seller_city" = ${s.city},
        "seller_pincode" = ${s.pincode},
        "updated_at" = CURRENT_TIMESTAMP
      WHERE "id" = ${PLATFORM_CONFIG_ID}
    `;
    return this.getSellerSettings();
  }

  /**
   * Billing v2: is online (Razorpay) plan payment switched on by Super Admin?
   * Off by default and on any read failure — manual approval is the safe side.
   */
  async getOnlinePaymentsEnabled(): Promise<boolean> {
    try {
      await this.ensureTable();
      const rows: any[] = await this.prisma.$queryRaw`
        SELECT "online_payments_enabled" FROM "identity"."platform_configs" WHERE "id" = ${PLATFORM_CONFIG_ID} LIMIT 1
      `;
      return rows?.[0]?.online_payments_enabled === true;
    } catch (err: any) {
      this.logger.warn(`Could not read online payments switch: ${err.message}`);
      return false;
    }
  }

  async onApplicationBootstrap() {
    try {
      await this.ensureTable();
      await this.applySavedConfigToEnv();
    } catch (err: any) {
      this.logger.warn(`Could not load PlatformConfig on boot: ${err.message}`);
    }
  }

  // Load the saved row (if any) and patch process.env so the whole app uses it.
  private async applySavedConfigToEnv() {
    let row: any = null;
    try {
      const rows: any[] = await this.prisma.$queryRaw`
        SELECT * FROM "identity"."platform_configs" WHERE "id" = ${PLATFORM_CONFIG_ID} LIMIT 1
      `;
      if (rows && rows.length > 0) {
        row = rows[0];
      }
    } catch (err: any) {
      this.logger.warn(`Could not read PlatformConfig row: ${err.message}`);
    }
    if (!row) return;
    const rawBase = row.subdomain_base || row.subdomainBase;
    const subdomainBase = migrateLegacyBase(rawBase);
    if (subdomainBase && subdomainBase !== rawBase) {
      try {
        await this.prisma.$executeRaw`
          UPDATE "identity"."platform_configs" SET "subdomain_base" = ${subdomainBase} WHERE "id" = ${PLATFORM_CONFIG_ID}
        `;
        this.logger.log(`Updated platform subdomain base to ${subdomainBase}`);
      } catch (err: any) {
        this.logger.warn(`Could not persist subdomain base: ${err.message}`);
      }
    }
    patchEnv({
      SUBDOMAIN_MODE: (row.subdomain_mode || row.subdomainMode) || null,
      SUBDOMAIN_BASE_DOMAIN: subdomainBase
        ? normalizeDomain(subdomainBase)
        : null,
      DNS_MODE: 'a',
      INFRA_IP: (row.infra_ip || row.infraIp) || null,
      INFRA_IPV6: (row.infra_ipv6 || row.infraIpv6) || null,
      INFRA_CNAME_TARGET: (row.infra_cname || row.infraCname) || null,
      INFRA_NS1: (row.infra_ns1 || row.infraNs1) || null,
      INFRA_NS2: (row.infra_ns2 || row.infraNs2) || null,
      PLATFORM_PRIMARY_COLOR: (row.primary_color || row.primaryColor) || null,
      PLATFORM_SECONDARY_COLOR: (row.secondary_color || row.secondaryColor) || null,
    });
  }

  async getConfig() {
    try {
      await this.ensureTable();
      const rows: any[] = await this.prisma.$queryRaw`
        SELECT * FROM "identity"."platform_configs" WHERE "id" = ${PLATFORM_CONFIG_ID} LIMIT 1
      `;
      if (rows && rows.length > 0) {
        const r = rows[0];
        return {
          id: r.id,
          subdomainMode: r.subdomain_mode || r.subdomainMode || 'production',
          subdomainBase: migrateLegacyBase(r.subdomain_base || r.subdomainBase),
          dnsMode: 'a',
          infraIp: r.infra_ip || r.infraIp || null,
          infraIpv6: r.infra_ipv6 || r.infraIpv6 || null,
          infraCname: r.infra_cname || r.infraCname || null,
          infraNs1: r.infra_ns1 || r.infraNs1 || null,
          infraNs2: r.infra_ns2 || r.infraNs2 || null,
          billingExpiryNotifyDays: r.billing_expiry_notify_days ?? r.billingExpiryNotifyDays ?? 3,
          billingGracePeriodDays: r.billing_grace_period_days ?? r.billingGracePeriodDays ?? 7,
          billingExpiryBehavior: r.billing_expiry_behavior || r.billingExpiryBehavior || 'restrict',
          billingExpiryMessage: r.billing_expiry_message || r.billingExpiryMessage || 'Your subscription is due for renewal soon. Renew to keep your landing pages and features running without interruption.',
          onlinePaymentsEnabled: (r.online_payments_enabled ?? r.onlinePaymentsEnabled) === true,
          primaryColor: r.primary_color || r.primaryColor || '#0f1424',
          secondaryColor: r.secondary_color || r.secondaryColor || '#2a3348',
          updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : null,
        };
      }
    } catch (err: any) {
      this.logger.warn(`Could not read PlatformConfig from DB: ${err.message}`);
    }

    // Fallback from environment variables (what local dev / pre-console deploys use).
    return {
      id: null,
      subdomainMode:
        process.env.SUBDOMAIN_MODE === 'localhost' ? 'localhost' : 'production',
      subdomainBase: process.env.SUBDOMAIN_BASE_DOMAIN || 'ipixxel.ae',
      dnsMode: 'a',
      infraIp: process.env.INFRA_IP || null,
      infraIpv6: process.env.INFRA_IPV6 || null,
      infraCname: process.env.INFRA_CNAME_TARGET || null,
      infraNs1: process.env.INFRA_NS1 || null,
      infraNs2: process.env.INFRA_NS2 || null,
      billingExpiryNotifyDays: 3,
      billingGracePeriodDays: 7,
      billingExpiryBehavior: 'restrict',
      billingExpiryMessage:
        'Your subscription is due for renewal soon. Renew to keep your landing pages and features running without interruption.',
      onlinePaymentsEnabled: false,
      primaryColor: process.env.PLATFORM_PRIMARY_COLOR || '#0f1424',
      secondaryColor: process.env.PLATFORM_SECONDARY_COLOR || '#2a3348',
      updatedAt: null,
    };
  }

  async getPublicTheme() {
    try {
      await this.ensureTable();
      const rows: any[] = await this.prisma.$queryRaw`
        SELECT "primary_color", "secondary_color" FROM "identity"."platform_configs" WHERE "id" = ${PLATFORM_CONFIG_ID} LIMIT 1
      `;
      if (rows && rows.length > 0) {
        return {
          primaryColor: rows[0].primary_color || '#0f1424',
          secondaryColor: rows[0].secondary_color || '#2a3348',
        };
      }
    } catch (err: any) {
      this.logger.warn(`Could not read platform theme from DB: ${err.message}`);
    }

    return {
      primaryColor: process.env.PLATFORM_PRIMARY_COLOR || '#0f1424',
      secondaryColor: process.env.PLATFORM_SECONDARY_COLOR || '#2a3348',
    };
  }

  async updateConfig(dto: UpdatePlatformConfigDto) {
    await this.ensureTable();

    // Read current row directly from SQL so it never fails if Prisma client is stale
    let existing: any = null;
    try {
      const rows: any[] = await this.prisma.$queryRaw`
        SELECT * FROM "identity"."platform_configs" WHERE "id" = ${PLATFORM_CONFIG_ID} LIMIT 1
      `;
      if (rows && rows.length > 0) {
        existing = rows[0];
      }
    } catch (err: any) {
      this.logger.warn(`Could not read existing config: ${err.message}`);
    }

    const subdomainMode = dto.subdomainMode ?? existing?.subdomain_mode ?? existing?.subdomainMode ?? 'production';
    const rawSubdomainBase = dto.subdomainBase !== undefined
      ? (dto.subdomainBase?.trim() ? normalizeDomain(dto.subdomainBase) : null)
      : (existing?.subdomain_base ?? existing?.subdomainBase ?? null);
    const subdomainBase = rawSubdomainBase ? normalizeDomain(rawSubdomainBase) : null;
    const dnsMode = 'a';
    const infraIp = dto.infraIp !== undefined ? (dto.infraIp?.trim() || null) : (existing?.infra_ip ?? existing?.infraIp ?? null);
    const infraIpv6 = dto.infraIpv6 !== undefined ? (dto.infraIpv6?.trim() || null) : (existing?.infra_ipv6 ?? existing?.infraIpv6 ?? null);
    const infraCname = dto.infraCname !== undefined ? (dto.infraCname?.trim() || null) : (existing?.infra_cname ?? existing?.infraCname ?? null);
    const infraNs1 = dto.infraNs1 !== undefined ? (dto.infraNs1?.trim() || null) : (existing?.infra_ns1 ?? existing?.infraNs1 ?? null);
    const infraNs2 = dto.infraNs2 !== undefined ? (dto.infraNs2?.trim() || null) : (existing?.infra_ns2 ?? existing?.infraNs2 ?? null);
    const billingExpiryNotifyDays = dto.billingExpiryNotifyDays ?? existing?.billing_expiry_notify_days ?? existing?.billingExpiryNotifyDays ?? 3;
    const billingGracePeriodDays = dto.billingGracePeriodDays ?? existing?.billing_grace_period_days ?? existing?.billingGracePeriodDays ?? 7;
    const billingExpiryBehavior = dto.billingExpiryBehavior ?? existing?.billing_expiry_behavior ?? existing?.billingExpiryBehavior ?? 'restrict';
    const billingExpiryMessage = dto.billingExpiryMessage !== undefined
      ? dto.billingExpiryMessage.trim()
      : (existing?.billing_expiry_message ?? existing?.billingExpiryMessage ?? 'Your subscription is due for renewal soon. Renew to keep your landing pages and features running without interruption.');
    const onlinePaymentsEnabled = dto.onlinePaymentsEnabled !== undefined
      ? dto.onlinePaymentsEnabled
      : (existing?.online_payments_enabled ?? existing?.onlinePaymentsEnabled ?? false) === true;
    const primaryColor = dto.primaryColor !== undefined
      ? dto.primaryColor.trim()
      : (existing?.primary_color ?? existing?.primaryColor ?? '#0f1424');
    const secondaryColor = dto.secondaryColor !== undefined
      ? dto.secondaryColor.trim()
      : (existing?.secondary_color ?? existing?.secondaryColor ?? '#2a3348');

    if (dnsMode === 'a' && !infraIp && dto.dnsMode) {
      throw new BadRequestException(
        'DNS mode "A record" requires the server IP (infraIp).',
      );
    }
    const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (dnsMode === 'a' && infraIp && !ipv4Regex.test(infraIp)) {
      throw new BadRequestException(
        'Origin IPv4 must be a valid numeric IP address (e.g. 187.126.119.156), not a domain name.',
      );
    }

    try {
      await this.prisma.$executeRaw`
        INSERT INTO "identity"."platform_configs" (
          "id", "subdomain_mode", "subdomain_base", "dns_mode", "infra_ip", "infra_ipv6",
          "infra_cname", "infra_ns1", "infra_ns2", "billing_expiry_notify_days",
          "billing_grace_period_days", "billing_expiry_behavior", "billing_expiry_message",
          "online_payments_enabled", "primary_color", "secondary_color", "updated_at"
        ) VALUES (
          ${PLATFORM_CONFIG_ID},
          ${subdomainMode},
          ${subdomainBase},
          ${dnsMode},
          ${infraIp},
          ${infraIpv6},
          ${infraCname},
          ${infraNs1},
          ${infraNs2},
          ${billingExpiryNotifyDays},
          ${billingGracePeriodDays},
          ${billingExpiryBehavior},
          ${billingExpiryMessage},
          ${onlinePaymentsEnabled},
          ${primaryColor},
          ${secondaryColor},
          CURRENT_TIMESTAMP
        )
        ON CONFLICT ("id") DO UPDATE SET
          "subdomain_mode" = EXCLUDED."subdomain_mode",
          "subdomain_base" = EXCLUDED."subdomain_base",
          "dns_mode" = EXCLUDED."dns_mode",
          "infra_ip" = EXCLUDED."infra_ip",
          "infra_ipv6" = EXCLUDED."infra_ipv6",
          "infra_cname" = EXCLUDED."infra_cname",
          "infra_ns1" = EXCLUDED."infra_ns1",
          "infra_ns2" = EXCLUDED."infra_ns2",
          "billing_expiry_notify_days" = EXCLUDED."billing_expiry_notify_days",
          "billing_grace_period_days" = EXCLUDED."billing_grace_period_days",
          "billing_expiry_behavior" = EXCLUDED."billing_expiry_behavior",
          "billing_expiry_message" = EXCLUDED."billing_expiry_message",
          "online_payments_enabled" = EXCLUDED."online_payments_enabled",
          "primary_color" = EXCLUDED."primary_color",
          "secondary_color" = EXCLUDED."secondary_color",
          "updated_at" = CURRENT_TIMESTAMP;
      `;
    } catch (err: any) {
      this.logger.error(`PlatformConfig SQL upsert failed: ${err.message}`, err.stack);
      throw err;
    }

    // Live-apply so subdomainHost()/extractSubdomainFromHost()/DNS helpers
    // immediately reflect the new base domain / origin without a redeploy.
    patchEnv({
      SUBDOMAIN_MODE: subdomainMode || null,
      SUBDOMAIN_BASE_DOMAIN: subdomainBase || null,
      DNS_MODE: 'a',
      INFRA_IP: infraIp || null,
      INFRA_IPV6: infraIpv6 || null,
      INFRA_CNAME_TARGET: infraCname || null,
      INFRA_NS1: infraNs1 || null,
      INFRA_NS2: infraNs2 || null,
      PLATFORM_PRIMARY_COLOR: primaryColor || null,
      PLATFORM_SECONDARY_COLOR: secondaryColor || null,
    });

    return {
      id: PLATFORM_CONFIG_ID,
      subdomainMode,
      subdomainBase: migrateLegacyBase(subdomainBase),
      dnsMode,
      infraIp,
      infraIpv6,
      infraCname,
      infraNs1,
      infraNs2,
      billingExpiryNotifyDays,
      billingGracePeriodDays,
      billingExpiryBehavior,
      billingExpiryMessage,
      onlinePaymentsEnabled,
      primaryColor,
      secondaryColor,
      updatedAt: new Date().toISOString(),
    };
  }
}
