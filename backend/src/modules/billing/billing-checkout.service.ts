import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { PlatformConfigService } from '../platform-config/platform-config.service';
import { BillingModeService, type BillingMode } from './billing-mode.service';
import {
  quoteCheckout,
  QuoteError,
  toRupees,
  type Interval,
  type Quote,
  type QuotePlan,
} from './checkout-quote';
import { isFreePlan, sortPlans } from './plan-modules';
import type { CheckoutPreviewV2 } from './billing.types';
import type { PreviewCheckoutDto } from './dto/checkout.dto';

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

/** A 400 the UI can branch on: `{ statusCode, error, code, message }`. */
export function billingError(code: string, message: string) {
  return new BadRequestException({
    statusCode: 400,
    error: 'Bad Request',
    code,
    message,
  });
}

export interface QuoteContext {
  quote: Quote;
  mode: BillingMode;
  buyer: {
    legalName: string | null;
    state: string | null;
    country: string;
    gstin: string | null;
  };
  seller: Awaited<ReturnType<PlatformConfigService['getSellerSettings']>>;
  hasProfile: boolean;
}

/**
 * Billing v2 checkout: price preview (step 2 part 1). The quote maths lives
 * in checkout-quote.ts; this service gathers the real inputs.
 */
@Injectable()
export class BillingCheckoutService {
  constructor(
    protected readonly prisma: PrismaService,
    protected readonly mode: BillingModeService,
    protected readonly platformConfig: PlatformConfigService,
  ) {}

  /** Recompute the quote from the database. Never takes amounts from the client. */
  async quote(
    orgId: string,
    planId: string,
    interval: Interval,
    billingState?: string | null,
    now = new Date(),
  ): Promise<QuoteContext> {
    const [active, sub, profile, seller, mode] = await Promise.all([
      this.prisma.plan.findMany({ where: { isActive: true } }),
      this.prisma.subscription.findFirst({
        where: { orgId, status: { not: 'cancelled' } },
        include: { plan: true },
      }),
      this.prisma.billingProfile.findUnique({
        where: { organisationId: orgId },
      }),
      this.platformConfig.getSellerSettings(),
      this.mode.getMode(),
    ]);

    const ranked = sortPlans(active);
    const asQuotePlan = (p: (typeof active)[number]): QuotePlan => {
      const rank = ranked.findIndex((r) => r.id === p.id);
      return {
        id: p.id,
        name: p.name,
        priceMonthly: p.priceMonthly,
        priceYearly: p.priceYearly,
        rank: rank === -1 ? ranked.length : rank,
        isFree: isFreePlan(p),
      };
    };
    const target = active.find((p) => p.id === planId);
    if (!target) {
      throw billingError(
        'plan_not_found',
        'That plan is not available. Pick another one.',
      );
    }

    const buyer = {
      legalName: profile?.legalName ?? null,
      state: billingState?.trim() || profile?.state || null,
      country: profile?.country ?? 'IN',
      gstin: profile?.gstin ?? null,
    };
    try {
      const quote = quoteCheckout({
        now,
        target: asQuotePlan(target),
        interval,
        current: sub
          ? {
              plan: asQuotePlan(sub.plan),
              interval: sub.billingCycle,
              status: sub.status,
              renewsAt: sub.renewsAt,
            }
          : null,
        buyer: { state: buyer.state, country: buyer.country },
        seller: { state: seller.state },
      });
      return { quote, mode, buyer, seller, hasProfile: !!profile };
    } catch (e) {
      if (e instanceof QuoteError) throw billingError(e.code, e.message);
      throw e;
    }
  }

  async preview(
    orgId: string,
    dto: PreviewCheckoutDto,
  ): Promise<CheckoutPreviewV2> {
    // Coupons arrive in step 5: dto.couponCode is accepted and ignored.
    const ctx = await this.quote(
      orgId,
      dto.planId,
      dto.interval,
      dto.billingState,
    );
    return toPreview(ctx);
  }
}

export function toPreview(ctx: QuoteContext): CheckoutPreviewV2 {
  const q = ctx.quote;
  return {
    planId: q.toPlan.id,
    planName: q.toPlan.name,
    interval: q.toInterval,
    kind: q.kind,
    fromPlan:
      q.fromPlan && q.fromInterval
        ? { id: q.fromPlan.id, name: q.fromPlan.name, interval: q.fromInterval }
        : null,
    planPrice: toRupees(q.subtotalPaise),
    proration: q.proration
      ? {
          oldPrice: toRupees(q.proration.oldPricePaise),
          newPrice: toRupees(q.proration.newPricePaise),
          daysLeft: q.proration.daysLeft,
          daysInPeriod: q.proration.daysInCycle,
          charge: toRupees(q.taxablePaise),
          credit: toRupees(q.creditPaise),
        }
      : null,
    coupon: null,
    couponError: null,
    couponsEnabled: false,
    couponDiscount: 0,
    taxable: toRupees(q.taxablePaise),
    billingState: ctx.buyer.state,
    gst: {
      kind: q.gstKind,
      cgst: toRupees(q.cgstPaise),
      sgst: toRupees(q.sgstPaise),
      igst: toRupees(q.igstPaise),
      total: toRupees(q.cgstPaise + q.sgstPaise + q.igstPaise),
    },
    total: toRupees(q.totalPaise),
    periodEnd: isoDate(q.periodEnd),
    recurringPrice: toRupees(q.recurringPaise),
    couponRenewalsLeft: 0,
    paymentMode: ctx.mode.mode,
    paymentModeReason: ctx.mode.reason,
    warnings: q.warnings,
  };
}
