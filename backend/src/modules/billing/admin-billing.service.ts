import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { PlatformConfigService } from '../platform-config/platform-config.service';
import { BillingModeService } from './billing-mode.service';
import {
  isFreePlan,
  sortPlans,
  toBillingPlan,
  toBillingPlans,
} from './plan-modules';
import type {
  BillingPlanV2,
  BillingWarning,
  LifecycleSettingsV2,
  SellerSettingsV2,
} from './billing.types';
import type { SaveAdminPlanDto } from './dto/save-admin-plan.dto';
import type {
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
        "The company's state isn't set, so every checkout is charged IGST. Set it under company tax settings.",
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
  stored: { isSystem: boolean; priceMonthly: number; priceYearly: number },
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
  if (!storedFree && input.priceMonthly <= 0)
    return 'A paid plan needs a monthly price.';
  if (!storedFree && input.priceYearly <= 0)
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
  ) {}

  /* ------------------------------------------------------------------ plans */

  async listPlans(): Promise<BillingPlanV2[]> {
    const plans = await this.prisma.plan.findMany({
      where: { isActive: true },
    });
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

    const active = sortPlans(
      await this.prisma.plan.findMany({ where: { isActive: true } }),
    );
    const saved =
      active.find((p) => p.id === id) ??
      (await this.prisma.plan.findUniqueOrThrow({ where: { id } }));
    const rank = active.findIndex((p) => p.id === id);
    return toBillingPlan(saved, rank === -1 ? active.length : rank);
  }

  /* -------------------------------------------------------------- lifecycle */

  async getLifecycle(): Promise<LifecycleSettingsV2> {
    const [cfg, mode, seller] = await Promise.all([
      this.platformConfig.getConfig(),
      this.mode.getMode(),
      this.platformConfig.getSellerSettings(),
    ]);
    return {
      notifyDaysBefore: Number(cfg.billingExpiryNotifyDays),
      graceDays: Number(cfg.billingGracePeriodDays),
      afterGrace:
        cfg.billingExpiryBehavior === 'cancel'
          ? 'cancel'
          : cfg.billingExpiryBehavior === 'fall_back_to_basic'
            ? 'fall_back_to_basic'
            : 'restrict',
      expiryMessage: String(cfg.billingExpiryMessage),
      // Fixed schedule until reminders are stored (later step).
      reminders: [
        { id: 'before_renewal', enabled: true },
        { id: 'payment_day', enabled: true },
        { id: 'mid_grace', enabled: true },
        { id: 'day_before_grace_ends', enabled: true },
      ],
      onlinePaymentsEnabled: cfg.onlinePaymentsEnabled === true,
      paymentMode: mode.mode,
      paymentModeReason: mode.reason,
      supports: { fallBackToBasic: true, reminderSchedule: false },
      seller,
      warnings: sellerWarnings(seller),
    };
  }

  async saveLifecycle(dto: SaveLifecycleDto): Promise<LifecycleSettingsV2> {
    const seller = dto.seller ? cleanSeller(dto.seller) : null;
    const problem = seller ? sellerProblem(seller) : null;
    if (problem) throw new BadRequestException(problem);
    await this.platformConfig.updateConfig({
      billingExpiryNotifyDays: dto.notifyDaysBefore,
      billingGracePeriodDays: dto.graceDays,
      billingExpiryBehavior: dto.afterGrace,
      billingExpiryMessage: dto.expiryMessage,
      onlinePaymentsEnabled: dto.onlinePaymentsEnabled,
    });
    if (seller) await this.platformConfig.saveSellerSettings(seller);
    return this.getLifecycle();
  }
}
