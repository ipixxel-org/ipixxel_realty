import { billingNow } from '../../common/utils/billing-clock.util';
import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import type { Plan } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { applyPlanChange } from '../../common/utils/plan-change.util';
import {
  applyOrgSubscriptionLifecycle,
  getBillingExpiryConfig,
  graceEndFor,
  moveToFreePlan,
} from '../../common/utils/subscription-lifecycle.util';
import { PaymentsService } from '../payments/payments.service';
import { BillingInvoiceMailer } from './billing-invoice-mailer.service';
import { PlatformConfigService } from '../platform-config/platform-config.service';
import { AdminCouponsService } from './admin-coupons.service';
import { billingError } from './billing-checkout.service';
import { deriveStatus } from './billing-overview';
import { BillingLedgerService, type Paged } from './billing-ledger.service';
import { BillingModeService } from './billing-mode.service';
import { BillingPlanChangeService } from './billing-plan-change.service';
import {
  checkCoupon,
  describeCouponV2,
  normaliseCouponCode,
} from './coupon-rules';
import { GST_STATES } from './gst';
import { issueCreditNote, issueOfflineInvoice } from './invoice.util';
import { OrgBillingV2Service } from './org-billing-v2.service';
import {
  isFreePlan,
  planRanker,
  sortPlans,
  toBillingPlan,
} from './plan-modules';
import type {
  BillingInterval,
  BillingPlanV2,
  SubscriptionStatusV2,
} from './billing.types';

const isoDate = (d: Date) => d.toISOString().slice(0, 10);
const dateLabel = (d: Date) =>
  d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
const inr = (rupees: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(rupees);

const ALL_STATUSES: SubscriptionStatusV2[] = [
  'free',
  'active',
  'renewal_due',
  'past_due',
  'grace_ending',
  'expired',
  'moved_to_basic',
  'cancellation_scheduled',
  'downgrade_scheduled',
];

export interface SubscriptionRowV2 {
  orgId: string;
  orgName: string;
  city: string;
  state: string;
  plan: BillingPlanV2;
  interval: BillingInterval;
  status: SubscriptionStatusV2;
  renewalMode: 'manual';
  keyDate: string | null;
  users: number;
  couponCode: string | null;
}

export interface TimelineEventV2 {
  at: string;
  kind:
    | 'bought'
    | 'renewed'
    | 'payment_failed'
    | 'grace'
    | 'moved_to_basic'
    | 'coupon'
    | 'plan_change'
    | 'cancel';
  text: string;
}

/**
 * Billing v2 step 7 — Super Admin: every organisation's subscription, one
 * organisation's billing (timeline, payments, coupon), and the actions on it:
 * extend grace, record an offline payment, apply a coupon, cancel, refund.
 */
@Injectable()
export class AdminSubscriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly overview: OrgBillingV2Service,
    private readonly ledger: BillingLedgerService,
    private readonly coupons: AdminCouponsService,
    private readonly changes: BillingPlanChangeService,
    private readonly payments: PaymentsService,
    private readonly platformConfig: PlatformConfigService,
    // Optional so unit tests can leave it out (then no invoice email).
    @Optional() private readonly invoiceMailer?: BillingInvoiceMailer,
    // Optional so unit tests can leave it out (then treated as online).
    @Optional() private readonly mode?: BillingModeService,
  ) {}

  /**
   * Manual mode: payments and discounts go through the org's request (Mark as
   * paid → Approve, and its coupon), so these org-level actions are refused.
   */
  private async refuseInManualMode(what: 'payment' | 'coupon') {
    if (!this.mode || (await this.mode.getMode()).mode !== 'manual') return;
    throw billingError(
      'use_request',
      what === 'payment'
        ? "Online payments are off, so payments are recorded on the organisation's request. Use the pending request instead (Package requests → Mark as paid)."
        : "Online payments are off, so coupons are added on the organisation's request. Use the pending request instead (Package requests → Mark as paid → Coupon).",
    );
  }

  /* --------------------------------------------------------------- list */

  async list(q: {
    status?: SubscriptionStatusV2;
    planId?: string;
    q?: string;
    page?: number;
    pageSize?: number;
  }): Promise<
    Paged<SubscriptionRowV2> & {
      countsByStatus: Record<SubscriptionStatusV2, number>;
    }
  > {
    await applyOrgSubscriptionLifecycle(this.prisma);
    const now = billingNow();
    const [orgs, active, cfg, seats, coupons] = await Promise.all([
      this.prisma.organisation.findMany({
        where: { status: { in: ['active', 'pending'] } },
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          city: true,
          state: true,
          subscriptions: {
            where: { status: { not: 'cancelled' } },
            include: { plan: true },
            take: 1,
          },
        },
      }),
      this.prisma.plan.findMany({ where: { isActive: true } }),
      getBillingExpiryConfig(this.prisma),
      this.prisma.user.groupBy({
        by: ['orgId'],
        where: {
          status: { in: ['active', 'pending'] },
          billingPausedAt: null,
          orgId: { not: null },
        },
        _count: { _all: true },
      }),
      this.prisma.coupon.findMany({ select: { id: true, code: true } }),
    ]);
    const ranked = sortPlans(active);
    const rankOf = planRanker(active);
    const free = ranked.find(isFreePlan) ?? null;
    const seatsBy = new Map(seats.map((s) => [s.orgId, s._count._all]));
    const codeOf = new Map(coupons.map((c) => [c.id, c.code]));
    const planById = new Map(active.map((p) => [p.id, p]));

    const rows: SubscriptionRowV2[] = [];
    for (const o of orgs) {
      const sub = o.subscriptions[0] ?? null;
      const planRow: Plan | null = sub?.plan ?? free;
      if (!planRow) continue;
      const plan = toBillingPlan(planRow, rankOf(planRow));
      const scheduled = sub?.scheduledPlanId
        ? planById.get(sub.scheduledPlanId)
        : undefined;
      const moved = !!sub?.movedToBasicAt && plan.isFree;
      const status = deriveStatus({
        now,
        notifyDays: cfg.notifyDays,
        plan,
        movedToBasic: moved
          ? {
              at: sub.movedToBasicAt!,
              plan,
              interval: sub.previousInterval ?? 'monthly',
            }
          : null,
        subscription: sub
          ? {
              status: sub.status as never,
              billingCycle: sub.billingCycle,
              renewsAt: sub.renewsAt,
              graceEndsAt: sub.graceEndsAt,
              cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
              scheduled: scheduled
                ? {
                    plan: toBillingPlan(scheduled, rankOf(scheduled)),
                    interval: sub.scheduledInterval ?? sub.billingCycle,
                  }
                : null,
            }
          : null,
      });
      const keyDate =
        status === 'moved_to_basic'
          ? sub?.movedToBasicAt
          : status === 'past_due' || status === 'grace_ending'
            ? sub?.graceEndsAt
            : status === 'cancellation_scheduled' && sub?.status === 'past_due'
              ? sub.graceEndsAt
              : status === 'free'
                ? null
                : sub?.renewsAt;
      const stateCode = o.state ?? null;
      rows.push({
        orgId: o.id,
        orgName: o.name,
        city: o.city ?? '',
        state: stateCode ? (GST_STATES[stateCode] ?? stateCode) : '',
        plan,
        interval: sub?.billingCycle ?? 'monthly',
        status,
        renewalMode: 'manual',
        keyDate: keyDate ? isoDate(keyDate) : null,
        users: seatsBy.get(o.id) ?? 0,
        couponCode: sub?.couponId ? (codeOf.get(sub.couponId) ?? null) : null,
      });
    }

    const countsByStatus = Object.fromEntries(
      ALL_STATUSES.map((s) => [s, rows.filter((r) => r.status === s).length]),
    ) as Record<SubscriptionStatusV2, number>;
    const text = (q.q ?? '').trim().toLowerCase();
    const filtered = rows.filter(
      (r) =>
        (!q.status || r.status === q.status) &&
        (!q.planId || r.plan.id === q.planId) &&
        (!text || r.orgName.toLowerCase().includes(text)),
    );
    const pageSize = Math.min(Math.max(1, q.pageSize ?? 10), 100);
    const pageNo = Math.max(1, q.page ?? 1);
    return {
      data: filtered.slice((pageNo - 1) * pageSize, pageNo * pageSize),
      total: filtered.length,
      page: pageNo,
      pageSize,
      countsByStatus,
    };
  }

  /* ------------------------------------------------------------- detail */

  async detail(orgId: string) {
    const org = await this.prisma.organisation.findUnique({
      where: { id: orgId },
      select: { id: true, name: true, city: true, state: true },
    });
    if (!org) throw new NotFoundException('Organisation not found');
    const [ov, sub, payments, audits] = await Promise.all([
      this.overview.getOverview(orgId),
      this.prisma.subscription.findFirst({
        where: { orgId, status: { not: 'cancelled' } },
      }),
      this.ledger.payments(orgId),
      this.prisma.auditLog.findMany({
        where: { orgId, action: { in: TIMELINE_ACTIONS } },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    ]);
    const users = ov.usage.find((u) => u.key === 'users')?.used ?? 0;
    const coupon = sub?.couponId
      ? await this.prisma.coupon.findUnique({ where: { id: sub.couponId } })
      : null;
    const keyDate =
      ov.status === 'moved_to_basic'
        ? ov.movedToBasicAt
        : ov.status === 'past_due' || ov.status === 'grace_ending'
          ? ov.graceEndsAt
          : ov.status === 'cancellation_scheduled'
            ? ov.cancelAt
            : ov.status === 'free'
              ? null
              : ov.periodEnd;
    const timeline: TimelineEventV2[] = [
      ...audits
        .map((a) => toTimeline(a))
        .filter((e): e is TimelineEventV2 => !!e),
      ...payments
        .filter((p) => p.status === 'failed')
        .map((p) => ({
          at: p.createdAt,
          kind: 'payment_failed' as const,
          text: `Payment of ${inr(p.amount)} failed${p.failureReason ? ` — ${p.failureReason}` : ''}`,
        })),
    ].sort((a, b) => b.at.localeCompare(a.at));
    return {
      orgId: org.id,
      orgName: org.name,
      city: org.city ?? '',
      state: org.state ? (GST_STATES[org.state] ?? org.state) : '',
      plan: ov.plan,
      interval: ov.interval,
      status: ov.status,
      renewalMode: 'manual' as const,
      keyDate,
      users,
      couponCode: coupon?.code ?? null,
      renewalAmount: ov.renewalAmount ?? 0,
      graceDays: ov.graceDays,
      // Manual mode hides "Mark paid offline" and "Apply coupon" (requests do both).
      paymentMode: ov.paymentMode,
      timeline,
      payments,
      coupon: coupon
        ? ((await this.coupons.list()).find(
            (r) => r.coupon.code === coupon.code,
          ) ?? null)
        : null,
    };
  }

  /* ------------------------------------------------------------ actions */

  private async sub(orgId: string) {
    await applyOrgSubscriptionLifecycle(this.prisma, orgId);
    const sub = await this.prisma.subscription.findFirst({
      where: { orgId, status: { not: 'cancelled' } },
      include: { plan: true },
    });
    if (!sub)
      throw billingError(
        'no_subscription',
        'This organisation has no subscription.',
      );
    return sub;
  }

  private audit(
    orgId: string,
    actorId: string,
    action: string,
    metadata: Record<string, unknown>,
  ) {
    return this.prisma.auditLog
      .create({
        data: {
          orgId,
          actorId,
          action,
          entity: 'Subscription',
          entityId: orgId,
          metadata: metadata as never,
        },
      })
      .catch(() => undefined);
  }

  /** More grace days for an organisation that hasn't renewed yet. */
  async extendGrace(
    orgId: string,
    actorId: string,
    days: number,
    note?: string,
  ) {
    const sub = await this.sub(orgId);
    if (sub.status !== 'past_due' || !sub.renewsAt) {
      throw billingError(
        'not_in_grace',
        'Only an organisation in its grace period can get more time.',
      );
    }
    // Stored as extra days on top of the grace rule (renewsAt + grace days),
    // so the sweep keeps honouring it when it re-derives the grace end.
    const cfg = await getBillingExpiryConfig(this.prisma);
    const extension = (sub.graceExtensionDays ?? 0) + days;
    const until = graceEndFor(
      { renewsAt: sub.renewsAt, graceExtensionDays: extension },
      cfg.gracePeriodDays,
    );
    await this.prisma.subscription.update({
      where: { id: sub.id },
      data: { graceExtensionDays: extension, graceEndsAt: until },
    });
    await this.audit(orgId, actorId, 'grace_extended', {
      days,
      until: isoDate(until),
      note: note ?? null,
    });
    return this.detail(orgId);
  }

  /**
   * A payment received outside Razorpay: recorded, invoiced, and applied as
   * the renewal of the plan (or, on Basic after a paid plan, as buying that
   * plan back).
   */
  async markPaidOffline(
    orgId: string,
    actorId: string,
    dto: {
      amount: number;
      method: string;
      reference: string;
      receivedOn: string;
    },
  ) {
    await this.refuseInManualMode('payment');
    const sub = await this.sub(orgId);
    // Only for renewals the org didn't request: a waiting request is paid
    // through its own Mark as paid, so it can't be applied twice.
    const waiting = await this.prisma.packageChangeRequest.findFirst({
      where: { orgId, status: 'pending' },
      select: { id: true },
    });
    if (waiting) {
      throw billingError(
        'request_pending',
        'This organisation has a pending plan change request. Use Mark as paid on the pending request (Package requests) instead.',
      );
    }
    const amountPaise = Math.round(dto.amount * 100);
    if (!(amountPaise > 0))
      throw billingError('amount_required', 'Enter the amount received.');
    let toPlanId = sub.scheduledPlanId ?? sub.planId;
    let toInterval = sub.scheduledInterval ?? sub.billingCycle;
    let kind: 'renewal' | 'new' = 'renewal';
    if (isFreePlan(sub.plan)) {
      if (!sub.previousPlanId) {
        throw billingError(
          'nothing_to_renew',
          'This organisation is on the free plan. Approve or create an upgrade for it instead.',
        );
      }
      toPlanId = sub.previousPlanId;
      toInterval = sub.previousInterval ?? 'monthly';
      kind = 'new';
    }
    const plan = await this.prisma.plan.findUniqueOrThrow({
      where: { id: toPlanId },
    });
    const seller = await this.platformConfig.getSellerSettings();
    const receivedOn = new Date(`${dto.receivedOn}T00:00:00.000Z`);
    const result = await this.prisma.$transaction(async (tx) => {
      const payment = await tx.offlinePayment.create({
        data: {
          organisationId: orgId,
          amountPaise,
          method: dto.method.trim(),
          reference: dto.reference.trim(),
          receivedOn,
          status: 'received',
          recordedById: actorId,
        },
      });
      const invoice = await issueOfflineInvoice(tx, {
        organisationId: orgId,
        offlinePaymentId: payment.id,
        totalPaise: amountPaise,
        description: `${plan.name} · ${toInterval} · ${kind === 'renewal' ? 'renewal' : 'purchase'} (paid offline)`,
        seller: { ...seller, legalName: seller.legalName ?? '' },
        at: receivedOn,
      });
      await applyPlanChange(tx, {
        organisationId: orgId,
        toPlanId,
        toInterval,
        kind,
        source: 'super_admin',
        actorId,
      });
      return { payment, invoice };
    });
    await this.audit(orgId, actorId, 'offline_payment_recorded', {
      amount: dto.amount,
      method: dto.method,
      reference: dto.reference,
      receivedOn: dto.receivedOn,
      planName: plan.name,
      invoiceNumber: result.invoice.number,
    });
    // The GST invoice by email to the owner and admins (not awaited).
    void this.invoiceMailer?.sendForInvoice(result.invoice.id);
    return this.detail(orgId);
  }

  /** Attach a coupon to the organisation's next renewals. */
  async applyCoupon(orgId: string, actorId: string, rawCode: string) {
    await this.refuseInManualMode('coupon');
    const sub = await this.sub(orgId);
    if (isFreePlan(sub.plan)) {
      throw billingError(
        'nothing_to_renew',
        "The organisation is on the free plan — there's nothing for a coupon to discount.",
      );
    }
    const code = normaliseCouponCode(rawCode);
    const coupon = await this.prisma.coupon.findUnique({ where: { code } });
    if (!coupon)
      throw billingError('coupon_invalid', `There's no coupon called ${code}.`);
    const nextPlanId = sub.scheduledPlanId ?? sub.planId;
    const plans = await this.prisma.plan.findMany({
      select: { id: true, name: true },
    });
    const redeemers = await this.prisma.couponRedemption.findMany({
      where: { couponId: coupon.id },
      select: { organisationId: true },
      distinct: ['organisationId'],
    });
    const check = checkCoupon(coupon, {
      now: billingNow(),
      orgId,
      planId: nextPlanId,
      interval: sub.scheduledInterval ?? sub.billingCycle,
      planNames: Object.fromEntries(plans.map((p) => [p.id, p.name])),
      usesSoFar: redeemers.length,
      orgHasUsed: redeemers.some((r) => r.organisationId === orgId),
    });
    if (!check.ok) throw billingError('coupon_invalid', check.reason);
    // Counted in renewals from the next one: first payment = the next renewal only.
    const left =
      coupon.duration === 'forever'
        ? null
        : coupon.duration === 'first_n'
          ? (coupon.durationCount ?? 1)
          : 1;
    await this.prisma.subscription.update({
      where: { id: sub.id },
      data: { couponId: coupon.id, couponRenewalsLeft: left },
    });
    await this.audit(orgId, actorId, 'coupon_applied', {
      code: coupon.code,
      description: describeCouponV2(coupon),
    });
    return this.detail(orgId);
  }

  /** Cancel at the end of the period (like the org would), or now (straight to Basic). */
  async cancel(
    orgId: string,
    actorId: string,
    when: 'period_end' | 'now',
    note?: string,
  ) {
    const sub = await this.sub(orgId);
    if (isFreePlan(sub.plan)) {
      throw billingError(
        'nothing_to_cancel',
        "The organisation is on the free plan — there's no paid plan to cancel.",
      );
    }
    if (when === 'period_end') {
      await this.changes.cancel(orgId, actorId, { reason: note });
    } else {
      await moveToFreePlan(
        this.prisma,
        { ...sub, cancelReason: note ?? null },
        'cancelled',
      );
    }
    await this.audit(orgId, actorId, 'subscription_cancelled_by_admin', {
      when,
      note: note ?? null,
    });
    return this.detail(orgId);
  }

  /** Refund a plan payment in full (Razorpay or offline) and issue a credit note. */
  async refund(paymentId: string, actorId: string, reason?: string) {
    const online = await this.prisma.payment.findUnique({
      where: { id: paymentId },
    });
    const offline = online
      ? null
      : await this.prisma.offlinePayment.findUnique({
          where: { id: paymentId },
        });
    if (!online && !offline) throw new NotFoundException('Payment not found');
    const orgId = (online?.organisationId ?? offline?.organisationId)!;

    if (online) {
      if (online.purpose !== 'plan_purchase') {
        throw billingError(
          'not_a_plan_payment',
          'Only plan payments are refunded here.',
        );
      }
      if (online.status !== 'captured') {
        throw billingError(
          'not_refundable',
          'Only a paid payment can be refunded.',
        );
      }
      await this.payments.refundInFull(online.id, {
        reason: reason ?? '',
        by: actorId,
      });
    } else {
      if (offline!.status !== 'received') {
        throw billingError(
          'not_refundable',
          'This payment has already been refunded.',
        );
      }
      await this.prisma.offlinePayment.update({
        where: { id: offline!.id },
        data: { status: 'refunded' },
      });
    }

    const invoice = await this.prisma.invoice.findFirst({
      where: {
        kind: 'invoice',
        ...(online
          ? { paymentId: online.id }
          : { offlinePaymentId: offline!.id }),
      },
    });
    const note = invoice
      ? await this.prisma.$transaction((tx) => issueCreditNote(tx, invoice))
      : null;
    await this.audit(orgId, actorId, 'payment_refunded', {
      paymentId,
      amount: (online?.amount ?? offline!.amountPaise) / 100,
      reason: reason ?? null,
      creditNoteNumber: note?.number ?? null,
    });
    // The credit note by email to the owner and admins (not awaited).
    if (note) void this.invoiceMailer?.sendForInvoice(note.id);
    const row = (await this.ledger.payments(orgId)).find(
      (p) => p.id === paymentId,
    )!;
    return { payment: row, creditNoteNumber: note?.number ?? '' };
  }
}

const TIMELINE_ACTIONS = [
  'plan_purchased',
  'subscription_renewed',
  'package_change_request_approved',
  'subscription_cancellation_scheduled',
  'subscription_cancellation_undone',
  'subscription_downgrade_scheduled',
  'subscription_downgrade_undone',
  'subscription_downgraded',
  'subscription_cancelled',
  'subscription_cancelled_by_admin',
  'grace_extended',
  'coupon_applied',
  'offline_payment_recorded',
  'payment_refunded',
];

function toTimeline(a: {
  createdAt: Date;
  action: string;
  metadata: unknown;
}): TimelineEventV2 | null {
  const m = (a.metadata ?? {}) as Record<string, unknown>;
  const s = (v: unknown) =>
    typeof v === 'string' || typeof v === 'number' ? String(v) : '';
  const at = a.createdAt.toISOString();
  const plan = typeof m.planName === 'string' ? m.planName : 'the plan';
  const cycle =
    typeof m.billingCycle === 'string' ? ` (${m.billingCycle})` : '';
  const until =
    typeof m.renewsAt === 'string'
      ? ` until ${dateLabel(new Date(m.renewsAt))}`
      : '';
  switch (a.action) {
    case 'plan_purchased':
      return {
        at,
        kind: m.kind === 'new' ? 'bought' : 'plan_change',
        text:
          m.kind === 'new'
            ? `Bought ${plan}${cycle}`
            : `Changed to ${plan}${cycle} — paid online`,
      };
    case 'subscription_renewed':
      // An offline renewal shows as its own line (offline_payment_recorded).
      return m.source === 'super_admin'
        ? null
        : { at, kind: 'renewed', text: `Renewed ${plan}${until}` };
    case 'package_change_request_approved':
      return {
        at,
        kind: 'plan_change',
        text: `Upgrade request approved — ${plan}${cycle}`,
      };
    case 'subscription_cancellation_scheduled':
      return {
        at,
        kind: 'cancel',
        text: `Cancellation scheduled${m.reason ? ` — ${s(m.reason)}` : ''}`,
      };
    case 'subscription_cancellation_undone':
      return { at, kind: 'cancel', text: 'Cancellation undone' };
    case 'subscription_downgrade_scheduled':
      return {
        at,
        kind: 'plan_change',
        text: 'Downgrade scheduled for the end of the term',
      };
    case 'subscription_downgrade_undone':
      return { at, kind: 'plan_change', text: 'Downgrade undone' };
    case 'subscription_downgraded':
      return {
        at,
        kind: 'plan_change',
        text: 'Scheduled downgrade took effect',
      };
    case 'subscription_cancelled':
      return {
        at,
        kind: 'moved_to_basic',
        text:
          m.source === 'grace_ended_fall_back'
            ? 'Not renewed — moved to Basic'
            : 'Plan ended — moved to Basic',
      };
    case 'subscription_cancelled_by_admin':
      return {
        at,
        kind: 'cancel',
        text: `Cancelled by Super Admin ${m.when === 'now' ? 'with immediate effect' : 'for the end of the term'}${m.note ? ` — ${s(m.note)}` : ''}`,
      };
    case 'grace_extended':
      return {
        at,
        kind: 'grace',
        text: `Grace extended by ${s(m.days)} days to ${dateLabel(new Date(s(m.until)))}${m.note ? ` — ${s(m.note)}` : ''}`,
      };
    case 'coupon_applied':
      return {
        at,
        kind: 'coupon',
        text: `${s(m.code)} applied by Super Admin: ${s(m.description)}`,
      };
    case 'offline_payment_recorded':
      return {
        at,
        kind: 'renewed',
        text: `Marked paid offline — ${inr(Number(m.amount))} by ${s(m.method)}${m.reference ? ` (${s(m.reference)})` : ''}, invoice ${s(m.invoiceNumber)}`,
      };
    case 'payment_refunded':
      return {
        at,
        kind: 'payment_failed',
        text: `Refunded ${inr(Number(m.amount))}${m.creditNoteNumber ? `, credit note ${s(m.creditNoteNumber)}` : ''}${m.reason ? ` — ${s(m.reason)}` : ''}`,
      };
    default:
      return null;
  }
}
