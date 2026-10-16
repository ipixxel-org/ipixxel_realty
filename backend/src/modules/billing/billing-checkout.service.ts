import { billingNow } from '../../common/utils/billing-clock.util';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  type OnModuleInit,
} from '@nestjs/common';
import type { BillingCheckoutStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { applyPlanChange } from '../../common/utils/plan-change.util';
import { assertPlanFitsCurrentUsage } from '../../common/utils/plan-quota.util';
import {
  applyOrgSubscriptionLifecycle,
  getBillingExpiryConfig,
} from '../../common/utils/subscription-lifecycle.util';
import { PlatformConfigService } from '../platform-config/platform-config.service';
import { PaymentsService } from '../payments/payments.service';
import {
  PaymentEventsService,
  type PaymentEvent,
} from '../payments/payment-events';
import { PackageChangeRequestsService } from '../package-change-requests/package-change-requests.service';
import { BillingModeService, type BillingMode } from './billing-mode.service';
import {
  MIN_ONLINE_PAISE,
  quoteCheckout,
  QuoteError,
  quoteRenewal,
  toRupees,
  type Interval,
  type Quote,
  type QuotePlan,
} from './checkout-quote';
import { expireStaleCheckouts } from './checkout-state';
import {
  checkCoupon,
  normaliseCouponCode,
  renewalsCoveredAfterFirst,
  withCoupon,
  type CouponRule,
} from './coupon-rules';
import { settleCoupon } from './coupon-settlement';
import { issueCheckoutInvoice } from './invoice.util';
import { BillingInvoiceMailer } from './billing-invoice-mailer.service';
import { isFreePlan, sortPlans } from './plan-modules';
import type {
  CheckoutPreviewV2,
  ConfirmCheckoutResultV2,
  StartCheckoutResultV2,
} from './billing.types';
import type {
  ConfirmCheckoutDto,
  PreviewCheckoutDto,
  StartCheckoutDto,
} from './dto/checkout.dto';

type NotifyDb = Pick<Prisma.TransactionClient, 'notification'>;

/** Tell all Super Admins (recipientId null) that a paid checkout needs a look. */
async function notifyNeedsReview(
  db: NotifyDb,
  orgId: string,
  checkoutId: string,
  planName: string,
  reason: string,
) {
  await db.notification.create({
    data: {
      orgId,
      // Existing Super Admin request type (no enum change); title says what it is.
      type: 'package_change_request',
      title: 'Plan payment needs review',
      body: `A payment for the "${planName}" plan was captured but the plan wasn't applied. ${reason}`.slice(
        0,
        1000,
      ),
      entity: 'BillingCheckout',
      entityId: checkoutId,
    },
  });
}

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
  /** Why the entered coupon can't be used; null when none or it applied. */
  couponError: string | null;
}

/** What a payment.captured did to its checkout (returned for tests / logs). */
export type FulfilOutcome =
  'paid' | 'needs_review' | 'already_done' | 'not_found';

const ONLINE_CHECKOUT_TTL_MS = 30 * 60 * 1000;

/**
 * Billing v2 checkout: price preview, starting a checkout (online → Razorpay
 * order; manual → package change request), confirming the Razorpay result,
 * and applying the plan when the payment is captured. The quote maths lives
 * in checkout-quote.ts; the plan change in common/utils/plan-change.util.ts.
 */
@Injectable()
export class BillingCheckoutService implements OnModuleInit {
  private readonly logger = new Logger(BillingCheckoutService.name);

  constructor(
    protected readonly prisma: PrismaService,
    protected readonly mode: BillingModeService,
    protected readonly platformConfig: PlatformConfigService,
    private readonly payments: PaymentsService,
    private readonly events: PaymentEventsService,
    private readonly requests: PackageChangeRequestsService,
    // Optional so unit tests can leave it out (then no invoice email).
    @Optional() private readonly invoiceMailer?: BillingInvoiceMailer,
  ) {}

  onModuleInit() {
    this.events.on('payment.captured', (e) => this.onCaptured(e));
    this.events.on('payment.failed', (e) => this.onFailed(e));
  }

  /* ------------------------------------------------------------- start */

  async start(
    orgId: string,
    userId: string,
    dto: StartCheckoutDto,
  ): Promise<StartCheckoutResultV2> {
    await expireStaleCheckouts(this.prisma, orgId);
    const renewal = dto.purpose === 'renewal';
    const ctx = await this.quote(
      orgId,
      dto.planId,
      dto.interval,
      null,
      billingNow(),
      renewal ? 'renewal' : 'purchase',
      renewal ? null : dto.couponCode,
    );
    if (!ctx.hasProfile) {
      throw billingError(
        'billing_profile_required',
        'Add your billing details first — they go on your GST invoice.',
      );
    }
    if (renewal && ctx.mode.mode === 'manual') {
      // No online payment: a Super Admin renews it (Subscriptions → Renew).
      throw billingError(
        'renewal_manual',
        "Online payment isn't available for your account, so our team renews your plan. We'll contact you before it's due.",
      );
    }
    // Never charge differently from what was shown: a bad code is refused.
    if (ctx.couponError) throw billingError('coupon_invalid', ctx.couponError);
    // Nothing to pay (a 100% coupon): apply it now, in either mode.
    if (ctx.quote.totalPaise === 0)
      return this.activateFree(orgId, userId, ctx);
    return ctx.mode.mode === 'manual'
      ? this.startManual(orgId, userId, ctx)
      : this.startOnline(orgId, userId, ctx);
  }

  /** ₹0 checkout: recorded and fulfilled like a payment of nothing. */
  private async activateFree(
    orgId: string,
    userId: string,
    ctx: QuoteContext,
  ): Promise<StartCheckoutResultV2> {
    const q = ctx.quote;
    const checkout = await this.prisma.billingCheckout.create({
      data: this.checkoutData(orgId, userId, ctx, ctx.mode.mode),
    });
    const outcome = await this.fulfil(checkout.id, 0);
    if (outcome !== 'paid') {
      throw billingError(
        'activation_failed',
        "We couldn't switch your plan just now. Our team has been told and will sort it out.",
      );
    }
    const sub = await this.prisma.subscription.findFirst({
      where: { orgId, status: { not: 'cancelled' } },
    });
    return {
      status: 'activated',
      receipt: {
        planId: q.toPlan.id,
        planName: q.toPlan.name,
        interval: q.toInterval,
        amount: 0,
        reference: 'free_coupon',
        activeUntil: sub?.renewsAt ? isoDate(sub.renewsAt) : '',
        couponCode: q.coupon?.code ?? null,
      },
    };
  }

  private async startManual(
    orgId: string,
    userId: string,
    ctx: QuoteContext,
  ): Promise<StartCheckoutResultV2> {
    const existing = await this.pendingRequest(orgId);
    if (existing) return existing;
    const q = ctx.quote;
    let requestId: string;
    try {
      // The existing request path: checks usage and "one pending request".
      const res = await this.requests.submitOrgRequest(orgId, userId, {
        targetPlanId: q.toPlan.id,
        billingCycle: q.toInterval,
      });
      requestId = res.request.id;
    } catch (e) {
      // Lost a race with another tab: return the request that won.
      const raced = await this.pendingRequest(orgId);
      if (raced) return raced;
      throw e;
    }
    const checkout = await this.prisma.billingCheckout.create({
      data: {
        ...this.checkoutData(orgId, userId, ctx, 'manual'),
        packageChangeRequestId: requestId,
      },
    });
    return {
      status: 'pending_approval',
      mode: 'manual',
      checkoutId: checkout.id,
      requestId,
    };
  }

  private async pendingRequest(
    orgId: string,
  ): Promise<StartCheckoutResultV2 | null> {
    const pending = await this.prisma.packageChangeRequest.findFirst({
      where: { orgId, status: 'pending' },
      include: { billingCheckout: { select: { id: true } } },
    });
    return pending
      ? {
          status: 'pending_approval',
          mode: 'manual',
          checkoutId: pending.billingCheckout?.id ?? null,
          requestId: pending.id,
        }
      : null;
  }

  private async startOnline(
    orgId: string,
    userId: string,
    ctx: QuoteContext,
  ): Promise<StartCheckoutResultV2> {
    const q = ctx.quote;
    if (q.totalPaise < MIN_ONLINE_PAISE) {
      throw billingError(
        'amount_too_small',
        "This change costs less than ₹1, so it can't be paid online. Contact us and we'll switch it for you.",
      );
    }
    // A waiting upgrade request doesn't stop a renewal: it keeps the org running.
    if (q.kind !== 'renewal' && (await this.pendingRequest(orgId))) {
      throw billingError(
        'request_pending',
        'You already have an upgrade request waiting for approval. Cancel it first to pay online instead.',
      );
    }

    // One open checkout per org: under a per-org lock, cancel older pending
    // online checkouts, then record this quote.
    const checkout = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`billing_checkout:${orgId}`}))`;
      await tx.billingCheckout.updateMany({
        where: { organisationId: orgId, status: 'pending', mode: 'online' },
        data: { status: 'cancelled' },
      });
      return tx.billingCheckout.create({
        data: {
          ...this.checkoutData(orgId, userId, ctx, 'online'),
          expiresAt: new Date(Date.now() + ONLINE_CHECKOUT_TTL_MS),
        },
      });
    });

    try {
      const order = await this.payments.createOrder({
        organisationId: orgId,
        amountPaise: q.totalPaise,
        purpose: 'plan_purchase',
        referenceType: 'billing_checkout',
        referenceId: checkout.id,
        notes: {
          plan: q.toPlan.name,
          interval: q.toInterval,
          kind: q.kind,
        },
        createdById: userId,
      });
      await this.prisma.billingCheckout.update({
        where: { id: checkout.id },
        data: { paymentId: order.paymentId },
      });
      return {
        status: 'payment_required',
        mode: 'online',
        checkoutId: checkout.id,
        amount: toRupees(q.totalPaise),
        razorpay: {
          keyId: order.keyId,
          orderId: order.orderId,
          amountPaise: order.amount,
          currency: 'INR',
          name: order.name,
          description:
            q.kind === 'renewal'
              ? `${q.toPlan.name} plan renewal (${q.toInterval})`
              : `${q.toPlan.name} plan (${q.toInterval})`,
          prefill: order.prefill,
        },
      };
    } catch (e) {
      await this.prisma.billingCheckout.update({
        where: { id: checkout.id },
        data: {
          status: 'failed',
          reviewReason: 'Could not create the payment order',
        },
      });
      throw e;
    }
  }

  private checkoutData(
    orgId: string,
    userId: string,
    ctx: QuoteContext,
    mode: 'online' | 'manual',
  ) {
    const q = ctx.quote;
    return {
      organisationId: orgId,
      fromPlanId: q.fromPlan?.id ?? null,
      toPlanId: q.toPlan.id,
      fromInterval: q.fromInterval,
      toInterval: q.toInterval,
      kind: q.kind,
      fromRenewsAt: q.fromRenewsAt,
      couponId: q.coupon?.id ?? null,
      couponDiscountPaise: q.couponDiscountPaise,
      subtotalPaise: q.subtotalPaise,
      creditPaise: q.creditPaise,
      taxablePaise: q.taxablePaise,
      cgstPaise: q.cgstPaise,
      sgstPaise: q.sgstPaise,
      igstPaise: q.igstPaise,
      totalPaise: q.totalPaise,
      buyerLegalName: ctx.buyer.legalName ?? '',
      buyerState: ctx.buyer.state ?? '',
      buyerGstin: ctx.buyer.gstin,
      sellerSnapshot: { ...ctx.seller },
      mode,
      status: 'pending' as const,
      createdById: userId,
    };
  }

  /* ----------------------------------------------------------- confirm */

  /**
   * Razorpay Checkout's success payload → the existing payments verify path.
   * If the payment is captured, verify fires payment.captured, whose handler
   * (below) applies the plan before this returns. The UI then polls the
   * overview until the plan changes.
   */
  async confirm(
    orgId: string,
    dto: ConfirmCheckoutDto,
  ): Promise<ConfirmCheckoutResultV2> {
    const payment = await this.prisma.payment.findFirst({
      where: {
        razorpayOrderId: dto.razorpay_order_id,
        organisationId: orgId,
        purpose: 'plan_purchase',
      },
      select: { id: true, referenceId: true },
    });
    if (!payment?.referenceId)
      throw new NotFoundException('Checkout not found');
    const verified = await this.payments.verifyCheckout(dto, orgId);
    const checkout = await this.prisma.billingCheckout.findFirstOrThrow({
      where: { id: payment.referenceId, organisationId: orgId },
    });
    return {
      checkoutId: checkout.id,
      checkoutStatus: checkout.status,
      paymentStatus: verified.status,
      toPlanId: checkout.toPlanId,
      toInterval: checkout.toInterval,
    };
  }

  /* -------------------------------------------------- payment events */

  private async onCaptured(e: PaymentEvent) {
    if (
      e.purpose !== 'plan_purchase' ||
      e.referenceType !== 'billing_checkout' ||
      !e.referenceId
    ) {
      return;
    }
    await this.fulfil(e.referenceId, e.amount);
  }

  private async onFailed(e: PaymentEvent) {
    if (e.purpose !== 'plan_purchase' || !e.referenceId) return;
    await this.prisma.billingCheckout.updateMany({
      where: { id: e.referenceId, status: { in: ['pending', 'expired'] } },
      data: { status: 'failed' },
    });
  }

  /**
   * Apply the plan for a captured payment. Runs once per checkout: the row is
   * locked and `fulfilledAt` is the marker, so /confirm and the webhook can
   * both arrive safely. Anything that stops the plan being applied leaves the
   * payment captured and puts the checkout in `needs_review` for a Super
   * Admin. Never throws (it runs inside the payment event handler).
   */
  async fulfil(checkoutId: string, paidPaise: number): Promise<FulfilOutcome> {
    const outcome = await this.applyPaid(checkoutId, paidPaise);
    // Once the plan is applied: the GST invoice by email (once per invoice,
    // so /confirm and the webhook can both get here). Not awaited — the
    // payment response doesn't wait for SMTP.
    if (outcome === 'paid' && this.invoiceMailer) {
      this.mailing = this.invoiceMailer.sendForCheckout(checkoutId);
    }
    return outcome;
  }

  /** The last invoice email started by fulfil (tests await it). */
  mailing: Promise<number> = Promise.resolve(0);

  private async applyPaid(
    checkoutId: string,
    paidPaise: number,
  ): Promise<FulfilOutcome> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "billing"."billing_checkouts" WHERE id = ${checkoutId} FOR UPDATE`;
        const c = await tx.billingCheckout.findUnique({
          where: { id: checkoutId },
          include: { toPlan: true },
        });
        if (!c) return 'not_found';
        if (
          c.fulfilledAt ||
          ['paid', 'approved', 'needs_review'].includes(c.status)
        ) {
          return 'already_done';
        }

        const review = async (reason: string): Promise<FulfilOutcome> => {
          await tx.billingCheckout.update({
            where: { id: c.id },
            data: { status: 'needs_review', reviewReason: reason },
          });
          await notifyNeedsReview(
            tx,
            c.organisationId,
            c.id,
            c.toPlan.name,
            reason,
          );
          return 'needs_review';
        };

        if (paidPaise !== c.totalPaise) {
          return review(
            `Amount mismatch: paid ${toRupees(paidPaise)}, quoted ${toRupees(c.totalPaise)}.`,
          );
        }
        // A late payment on an old quote must still match the org's plan.
        const sub = await tx.subscription.findFirst({
          where: { orgId: c.organisationId, status: { not: 'cancelled' } },
        });
        if (
          (sub?.planId ?? null) !== c.fromPlanId ||
          (c.fromInterval !== null && sub?.billingCycle !== c.fromInterval)
        ) {
          return review('The plan changed after this price was quoted.');
        }
        if (c.kind === 'renewal') {
          // Two paid renewals (two tabs, or a Super Admin renewed meanwhile)
          // must not extend twice: only the one quoted on today's renewsAt applies.
          if (
            (sub?.renewsAt?.getTime() ?? null) !==
            (c.fromRenewsAt?.getTime() ?? null)
          ) {
            return review(
              'The subscription was already renewed after this price was quoted.',
            );
          }
        }
        // A renewal on the same plan doesn't re-check usage (it's what the org
        // already has); one that applies a scheduled downgrade does.
        if (c.kind !== 'renewal' || c.toPlanId !== c.fromPlanId) {
          try {
            await assertPlanFitsCurrentUsage(tx, c.organisationId, c.toPlan);
          } catch (err) {
            return review(err instanceof Error ? err.message : String(err));
          }
        }

        await applyPlanChange(tx, {
          organisationId: c.organisationId,
          toPlanId: c.toPlanId,
          toInterval: c.toInterval,
          kind: c.kind,
          source: 'payment',
          actorId: null,
          checkoutId: c.id,
          requestedById: c.createdById,
        });
        await settleCoupon(tx, c);
        // GST tax invoice for what was paid (none for a ₹0 checkout).
        await issueCheckoutInvoice(tx, c);
        await tx.billingCheckout.update({
          where: { id: c.id },
          data: { status: 'paid', fulfilledAt: new Date() },
        });
        return 'paid';
      });
    } catch (err) {
      const reason = `Could not apply the plan: ${err instanceof Error ? err.message : String(err)}`;
      this.logger.error(`Checkout ${checkoutId}: ${reason}`);
      try {
        const { count } = await this.prisma.billingCheckout.updateMany({
          where: {
            id: checkoutId,
            fulfilledAt: null,
            status: { notIn: ['paid', 'approved'] },
          },
          data: { status: 'needs_review', reviewReason: reason.slice(0, 500) },
        });
        if (count > 0) {
          const c = await this.prisma.billingCheckout.findUnique({
            where: { id: checkoutId },
            include: { toPlan: { select: { name: true } } },
          });
          if (c)
            await notifyNeedsReview(
              this.prisma,
              c.organisationId,
              c.id,
              c.toPlan.name,
              reason,
            );
        }
      } catch {
        // Logged above; the payment stays captured and is visible to admins.
      }
      return 'needs_review';
    }
  }

  /* -------------------------------------------------------------- admin */

  /** Super Admin: checkouts in a status (default needs_review), newest first. */
  async adminList(status: BillingCheckoutStatus = 'needs_review') {
    const rows = await this.prisma.billingCheckout.findMany({
      where: { status },
      orderBy: { updatedAt: 'desc' },
      take: 100,
      include: {
        organisation: { select: { id: true, name: true } },
        fromPlan: { select: { name: true } },
        toPlan: { select: { name: true } },
        payment: {
          select: { razorpayPaymentId: true, amount: true, status: true },
        },
      },
    });
    return rows.map((c) => ({
      id: c.id,
      organisation: c.organisation,
      fromPlanName: c.fromPlan?.name ?? null,
      toPlanName: c.toPlan.name,
      toInterval: c.toInterval,
      kind: c.kind,
      mode: c.mode,
      status: c.status,
      total: toRupees(c.totalPaise),
      paid: c.payment ? toRupees(c.payment.amount) : null,
      razorpayPaymentId: c.payment?.razorpayPaymentId ?? null,
      buyerGstin: c.buyerGstin,
      reviewReason: c.reviewReason,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    }));
  }

  /** Recompute the quote from the database. Never takes amounts from the client. */
  async quote(
    orgId: string,
    planId: string,
    interval: Interval,
    billingState?: string | null,
    now = billingNow(),
    purpose: 'purchase' | 'renewal' = 'purchase',
    couponCode?: string | null,
  ): Promise<QuoteContext> {
    if (purpose === 'renewal') {
      // A lapsed term must read as past_due / expired before deciding.
      await applyOrgSubscriptionLifecycle(this.prisma, orgId);
    }
    const [active, sub, profile, seller, mode, expiry] = await Promise.all([
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
      getBillingExpiryConfig(this.prisma),
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
    const buyer = {
      legalName: profile?.legalName ?? null,
      state: billingState?.trim() || profile?.state || null,
      country: profile?.country ?? 'IN',
      gstin: profile?.gstin ?? null,
    };
    const scheduledRow = sub?.scheduledPlanId
      ? active.find((p) => p.id === sub.scheduledPlanId)
      : undefined;
    const current = sub
      ? {
          plan: asQuotePlan(sub.plan),
          interval: sub.billingCycle,
          status: sub.status,
          renewsAt: sub.renewsAt,
          cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
          scheduled: scheduledRow
            ? {
                plan: asQuotePlan(scheduledRow),
                interval: sub.scheduledInterval ?? sub.billingCycle,
              }
            : null,
        }
      : null;
    const parties = {
      buyer: { state: buyer.state, country: buyer.country },
      seller: { state: seller.state },
    };
    const base = { mode, buyer, seller, hasProfile: !!profile };
    try {
      if (purpose === 'renewal') {
        let quote = quoteRenewal({
          now,
          current,
          ...parties,
          notifyDays: expiry.notifyDays,
          requested: { planId, interval },
        });
        // A first_n / forever coupon still on the subscription discounts it,
        // while it covers the plan the next term is on.
        const left = sub?.couponRenewalsLeft ?? null;
        if (sub?.couponId && (left === null || left > 0)) {
          const coupon = await this.prisma.coupon.findUnique({
            where: { id: sub.couponId },
          });
          if (
            coupon &&
            coupon.planIds.includes(quote.toPlan.id) &&
            (coupon.interval === 'any' || coupon.interval === quote.toInterval)
          ) {
            quote = withCoupon(
              quote,
              coupon,
              parties,
              left === null ? null : left - 1,
            );
          }
        }
        return { ...base, quote, couponError: null };
      }
      const target = active.find((p) => p.id === planId);
      if (!target) {
        throw billingError(
          'plan_not_found',
          'That plan is not available. Pick another one.',
        );
      }
      let quote = quoteCheckout({
        now,
        target: asQuotePlan(target),
        interval,
        current,
        ...parties,
      });
      let couponError: string | null = null;
      const code = couponCode ? normaliseCouponCode(couponCode) : '';
      if (code) {
        const found = await this.findCoupon(code, orgId, quote, now, active);
        if ('error' in found) couponError = found.error;
        else
          quote = withCoupon(
            quote,
            found.coupon,
            parties,
            renewalsCoveredAfterFirst(found.coupon),
          );
      }
      return { ...base, quote, couponError };
    } catch (e) {
      if (e instanceof QuoteError) throw billingError(e.code, e.message);
      throw e;
    }
  }

  /** Look up and check an entered coupon for this org and quote. */
  private async findCoupon(
    code: string,
    orgId: string,
    quote: Quote,
    now: Date,
    plans: { id: string; name: string }[],
  ): Promise<
    { coupon: CouponRule & { description: string } } | { error: string }
  > {
    const coupon = await this.prisma.coupon.findUnique({ where: { code } });
    if (!coupon) {
      return { error: `There's no coupon called ${code}. Check the spelling.` };
    }
    const redeemers = await this.prisma.couponRedemption.findMany({
      where: { couponId: coupon.id },
      select: { organisationId: true },
      distinct: ['organisationId'],
    });
    const check = checkCoupon(coupon, {
      now,
      orgId,
      planId: quote.toPlan.id,
      interval: quote.toInterval,
      planNames: Object.fromEntries(plans.map((p) => [p.id, p.name])),
      usesSoFar: redeemers.length,
      orgHasUsed: redeemers.some((r) => r.organisationId === orgId),
    });
    return check.ok ? { coupon } : { error: check.reason };
  }

  async preview(
    orgId: string,
    dto: PreviewCheckoutDto,
  ): Promise<CheckoutPreviewV2> {
    const renewal = dto.purpose === 'renewal';
    const ctx = await this.quote(
      orgId,
      dto.planId,
      dto.interval,
      dto.billingState,
      billingNow(),
      renewal ? 'renewal' : 'purchase',
      renewal ? null : dto.couponCode,
    );
    return toPreview(ctx, renewal);
  }
}

export function toPreview(
  ctx: QuoteContext,
  renewal = false,
): CheckoutPreviewV2 {
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
          // Before the coupon: the coupon line comes after the proration.
          charge: toRupees(q.taxablePaise + q.couponDiscountPaise),
          credit: toRupees(q.creditPaise),
        }
      : null,
    coupon: q.coupon
      ? { code: q.coupon.code, description: q.coupon.description }
      : null,
    couponError: ctx.couponError,
    // A renewal's coupon comes from the subscription, not a code.
    couponsEnabled: !renewal,
    couponDiscount: toRupees(q.couponDiscountPaise),
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
    couponRenewalsLeft: q.coupon
      ? q.coupon.renewalsLeft === null
        ? 99
        : q.coupon.renewalsLeft
      : 0,
    paymentMode: ctx.mode.mode,
    paymentModeReason: ctx.mode.reason,
    warnings: q.warnings,
  };
}
