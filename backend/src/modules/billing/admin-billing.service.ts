import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import {
  billingNow,
  isBillingV2Server,
} from '../../common/utils/billing-clock.util';
import {
  applyOrgSubscriptionLifecycle,
  readReminderSettings,
  REMINDER_IDS,
} from '../../common/utils/subscription-lifecycle.util';
import { PlatformConfigService } from '../platform-config/platform-config.service';
import { RazorpaySettingsService } from '../payments/razorpay-settings.service';
import { BillingModeService } from './billing-mode.service';
import { expireStaleCheckouts } from './checkout-state';
import { readOnlinePayments } from './online-payments';
import {
  isFreePlan,
  planRanker,
  toBillingPlan,
  toBillingPlans,
} from './plan-modules';
import type {
  BillingPlanV2,
  BillingWarning,
  CompanyDetailsV2,
  LifecycleRunResultV2,
  LifecycleSettingsV2,
  OnlinePaymentsV2,
  SellerSettingsV2,
} from './billing.types';
import type { SaveAdminPlanDto } from './dto/save-admin-plan.dto';
import type {
  SaveCompanyDetailsDto,
  SaveLifecycleDto,
  SellerSettingsDto,
} from './dto/save-lifecycle.dto';
import { gstinProblem, isGstStateCode, normaliseGstin } from './gst';

/* --------------------------------------------------------- seller settings */

const blank = (v: string | null | undefined) => v?.trim() || null;

export function cleanSeller(s: SellerSettingsDto): SellerSettingsV2 {
  return {
    legalName: blank(s.legalName),
    gstin: normaliseGstin(s.gstin) || null,
    state: blank(s.state),
    addressLine1: blank(s.addressLine1),
    addressLine2: blank(s.addressLine2),
    city: blank(s.city),
    pincode: blank(s.pincode),
  };
}

/** Company tax settings check: all optional, but what's given must be valid. Pure. */
export function sellerProblem(s: SellerSettingsV2): string | null {
  if (s.state && !isGstStateCode(s.state)) return "Choose the company's state.";
  if (s.gstin && !s.state)
    return "Choose the company's state to go with the GSTIN.";
  if (s.pincode && !/^[1-9][0-9]{5}$/.test(s.pincode))
    return 'Enter a 6-digit PIN code.';
  return gstinProblem(s.gstin, s.state);
}

export function sellerWarnings(s: SellerSettingsV2): BillingWarning[] {
  if (s.state) return [];
  return [
    {
      code: 'seller_state_missing',
      message:
        "The company's state isn't set, so every checkout is charged IGST. Set it in Settings → Company & tax details.",
    },
  ];
}

const MAX_LIMIT = 100_000;
const LIMIT_LABEL = {
  users: 'Users',
  projects: 'Projects',
  landingPages: 'Landing pages',
  templates: 'Templates',
} as const;

/**
 * Semantic checks for a plan save (shape is checked by the DTO). Returns the
 * first problem as a customer-readable message, or null. Pure — unit-tested.
 */
export function validateAdminPlan(
  input: SaveAdminPlanDto,
  stored: {
    isSystem: boolean;
    priceMonthly: number;
    priceYearly: number;
    isActive?: boolean;
  },
): string | null {
  const storedFree = isFreePlan(stored);
  if (!input.name?.trim()) return 'Enter a plan name.';
  if (input.isFree !== storedFree)
    return storedFree
      ? 'The free plan must stay free.'
      : 'Only the default Basic plan can be the free plan.';
  for (const [label, v] of [
    ['Monthly price', input.priceMonthly],
    ['Yearly price', input.priceYearly],
  ] as const) {
    if (!Number.isInteger(v) || v < 0)
      return `${label} must be a whole number of rupees, 0 or more.`;
  }
  if (storedFree && (input.priceMonthly !== 0 || input.priceYearly !== 0))
    return "The free plan can't have a price.";
  // An inactive plan isn't offered, so it may stay ₹0 (an internal plan like
  // "Demo"); one organisations can pick needs a price.
  const offered = stored.isActive !== false;
  if (!storedFree && offered && input.priceMonthly <= 0)
    return 'A paid plan needs a monthly price.';
  if (!storedFree && offered && input.priceYearly <= 0)
    return 'A paid plan needs a yearly price.';
  for (const key of Object.keys(LIMIT_LABEL) as (keyof typeof LIMIT_LABEL)[]) {
    const v = input.limits?.[key];
    if (v === null || v === undefined) continue;
    if (!Number.isInteger(v) || v < 0 || v > MAX_LIMIT)
      return `${LIMIT_LABEL[key]} must be a whole number from 0 to ${MAX_LIMIT}, or empty for unlimited.`;
  }
  const pages = input.modules?.metaPages;
  if (
    input.modules?.metaLeadAds &&
    pages !== null &&
    pages !== undefined &&
    (!Number.isInteger(pages) || pages < 1 || pages > MAX_LIMIT)
  ) {
    return 'Meta lead ads needs at least 1 page, or empty for unlimited.';
  }
  return null;
}

@Injectable()
export class AdminBillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly platformConfig: PlatformConfigService,
    private readonly mode: BillingModeService,
    private readonly razorpay: RazorpaySettingsService,
  ) {}

  /* ------------------------------------------------------------------ plans */

  /** Every plan, inactive ones too (marked `isActive: false`), so they can be edited or deleted. */
  async listPlans(): Promise<BillingPlanV2[]> {
    const plans = await this.prisma.plan.findMany();
    return toBillingPlans(plans);
  }

  async savePlan(id: string, dto: SaveAdminPlanDto): Promise<BillingPlanV2> {
    const stored = await this.prisma.plan.findUnique({ where: { id } });
    if (!stored) throw new NotFoundException('Plan not found');
    const problem = validateAdminPlan(dto, stored);
    if (problem) throw new BadRequestException(problem);

    const oldLimits = (
      stored.limits && typeof stored.limits === 'object' ? stored.limits : {}
    ) as Record<string, unknown>;
    const oldCaps = (
      stored.capabilities && typeof stored.capabilities === 'object'
        ? stored.capabilities
        : {}
    ) as Record<string, unknown>;
    // Keep everything v2 doesn't edit (landingPagesCreate, catalog capabilities, WhatsApp).
    const limits = {
      ...oldLimits,
      users: dto.limits.users ?? null,
      projects: dto.limits.projects ?? null,
      landingPages: dto.limits.landingPages ?? null,
      templates: dto.limits.templates ?? null,
      metaPages: dto.modules.metaLeadAds ? (dto.modules.metaPages ?? null) : 0,
    };
    const capabilities = {
      ...oldCaps,
      teamChat: dto.modules.teamChat,
      metaLeadAds: dto.modules.metaLeadAds,
    };

    await this.prisma.plan.update({
      where: { id },
      data: {
        name: dto.name.trim(),
        description: dto.tagline?.trim() ?? stored.description,
        priceMonthly: dto.priceMonthly,
        priceYearly: dto.priceYearly,
        limits,
        capabilities,
      },
    });

    const active = await this.prisma.plan.findMany({
      where: { isActive: true },
    });
    const saved =
      active.find((p) => p.id === id) ??
      (await this.prisma.plan.findUniqueOrThrow({ where: { id } }));
    return toBillingPlan(saved, planRanker(active)(saved));
  }

  /* -------------------------------------------------------------- lifecycle */

  async getLifecycle(): Promise<LifecycleSettingsV2> {
    const [cfg, mode, seller, storedReminders] = await Promise.all([
      this.platformConfig.getConfig(),
      this.mode.getMode(),
      this.platformConfig.getSellerSettings(),
      this.platformConfig.getBillingReminders(),
    ]);
    const reminders = readReminderSettings(storedReminders);
    const v2Server = isBillingV2Server();
    return {
      notifyDaysBefore: Number(cfg.billingExpiryNotifyDays),
      graceDays: Number(cfg.billingGracePeriodDays),
      // Billing v2 (freemium): grace always ends in "fall back to Basic". A
      // stored legacy restrict / cancel only applies with v2 off on the server.
      afterGrace: v2Server
        ? 'fall_back_to_basic'
        : cfg.billingExpiryBehavior === 'cancel'
          ? 'cancel'
          : cfg.billingExpiryBehavior === 'fall_back_to_basic'
            ? 'fall_back_to_basic'
            : 'restrict',
      expiryMessage: String(cfg.billingExpiryMessage),
      reminders: REMINDER_IDS.map((id) => ({ id, enabled: reminders[id] })),
      onlinePaymentsEnabled: cfg.onlinePaymentsEnabled === true,
      paymentMode: mode.mode,
      paymentModeReason: mode.reason,
      supports: { fallBackToBasic: true, reminderSchedule: true },
      warnings: [
        ...sellerWarnings(seller),
        ...(v2Server
          ? []
          : [
              {
                code: 'billing_v2_server_off' as const,
                message:
                  'BILLING_V2=true isn\'t set on the server, so grace still ends with the old setting ("restrict" or "cancel"). Set it in the backend .env to fall back to Basic.',
              },
            ]),
      ],
    };
  }

  async saveLifecycle(dto: SaveLifecycleDto): Promise<LifecycleSettingsV2> {
    const seller = dto.seller ? cleanSeller(dto.seller) : null;
    const problem = seller ? sellerProblem(seller) : null;
    if (problem) throw new BadRequestException(problem);
    await this.platformConfig.updateConfig({
      billingExpiryNotifyDays: dto.notifyDaysBefore,
      billingGracePeriodDays: dto.graceDays,
      // afterGrace isn't written: v2 always falls back to Basic, and the
      // stored legacy value stays for the flag-off screens.
      billingExpiryMessage: dto.expiryMessage,
      // Omitted by the current UI (the switch lives in Integrations now) — unchanged.
      onlinePaymentsEnabled: dto.onlinePaymentsEnabled,
    });
    if (dto.reminders) {
      const current = readReminderSettings(
        await this.platformConfig.getBillingReminders(),
      );
      for (const r of dto.reminders) current[r.id] = r.enabled;
      await this.platformConfig.saveBillingReminders(current);
    }
    if (seller) await this.platformConfig.saveSellerSettings(seller);
    return this.getLifecycle();
  }

  /* ------------------------------------------------------ online payments */

  getOnlinePayments(): Promise<OnlinePaymentsV2> {
    return readOnlinePayments(this.platformConfig, this.razorpay);
  }

  /**
   * Integrations → Online payments switch. Turning it on needs a gateway with
   * usable keys; turning it off always works.
   */
  async saveOnlinePayments(enabled: boolean): Promise<OnlinePaymentsV2> {
    if (enabled) {
      const current = await this.getOnlinePayments();
      if (!current.gateway) {
        throw new BadRequestException(
          'No payment gateway is ready. Add Razorpay keys in Integrations → Online payments first.',
        );
      }
    }
    await this.platformConfig.updateConfig({ onlinePaymentsEnabled: enabled });
    return this.getOnlinePayments();
  }

  /* ----------------------------------------------- company & tax details */

  async getCompanyDetails(): Promise<CompanyDetailsV2> {
    const seller = await this.platformConfig.getSellerSettings();
    return { seller, warnings: sellerWarnings(seller) };
  }

  async saveCompanyDetails(
    dto: SaveCompanyDetailsDto,
  ): Promise<CompanyDetailsV2> {
    const seller = cleanSeller(dto.seller);
    const problem = sellerProblem(seller);
    if (problem) throw new BadRequestException(problem);
    await this.platformConfig.saveSellerSettings(seller);
    return this.getCompanyDetails();
  }

  /** "Run lifecycle check now" (Super Admin, for testing): one sweep, audited. */
  async runLifecycleNow(actorId: string): Promise<LifecycleRunResultV2> {
    await expireStaleCheckouts(this.prisma).catch(() => undefined);
    const ranAt = billingNow();
    const s = await applyOrgSubscriptionLifecycle(
      this.prisma,
      undefined,
      ranAt,
    );
    const result: LifecycleRunResultV2 = {
      ranAt: ranAt.toISOString(),
      scanned: s.scanned,
      movedToFreePlan: s.movedToFreePlan,
      scheduledPlanApplied: s.scheduledPlanApplied,
      newlyPastDue: s.newlyPastDue,
      newlyExpired: s.newlyExpired,
      newlyCancelled: s.newlyCancelled,
      remindersSent: s.expiringNotified + s.pastDueNotified + s.expiredNotified,
    };
    await this.prisma.auditLog.create({
      data: {
        actorId,
        action: 'billing_lifecycle_run',
        entity: 'PlatformConfig',
        entityId: 'platform',
        metadata: { ...result },
      },
    });
    return result;
  }
}
