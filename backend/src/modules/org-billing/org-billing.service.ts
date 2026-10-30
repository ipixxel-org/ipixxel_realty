import {
  latestPlanVersionId,
  SUB_PLAN_INCLUDE,
  withEffectivePlan,
} from '../../common/utils/plan-version.util';
import { Injectable } from '@nestjs/common';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import {
  assertPlanFitsCurrentUsage,
  countBillableOrgUsers,
  countOrgLandingPages,
  countOrgTotalLandingPages,
  countOrgProjects,
  resolveLimit,
} from '../../common/utils/plan-quota.util';
import {
  applyOrgSubscriptionLifecycle,
  renewOrgSubscription,
} from '../../common/utils/subscription-lifecycle.util';
import type { ChangePlanDto } from './dto/change-plan.dto';

export interface InvoiceRow {
  id: string;
  number: string;
  issuedAt: string;
  dueAt: string;
  amount: number;
  currency: string;
  billingCycle: 'monthly' | 'yearly';
  status: 'paid' | 'pending';
  planName: string;
}

function computeAmountAndMrr(
  plan: { priceMonthly: number; priceYearly: number },
  billingCycle: string,
) {
  const isYearly = billingCycle === 'yearly';
  const amount = isYearly ? plan.priceYearly : plan.priceMonthly;
  const mrr = isYearly ? Math.round(amount / 12) : amount;
  return { amount, mrr };
}

// Read-only view over Shubham's billing/subscriptions module for the org
// settings screen — never writes to Plan/Subscription. No invoice/payment
// data exists anywhere in the schema, so this is deliberately just plan +
// usage.
@Injectable()
export class OrgBillingService {
  constructor(private readonly prisma: PrismaService) {}

  async get(orgId: string) {
    // Lazy lifecycle pass — a term that lapsed (or a grace period that ended)
    // since the last timer tick is reflected here on first read, so the UI
    // never shows a stale status.
    await applyOrgSubscriptionLifecycle(this.prisma, orgId);

    // At most one non-cancelled subscription per org — enforced by
    // SubscriptionsService.create(), not a DB constraint. Mirrors that
    // same lookup rather than assuming a unique index exists.
    const [subscription, templatesUsed, projectsUsed, usersUsed, landingPagesUsed, landingPagesCreateUsed] =
      await Promise.all([
        // `plan` is the org's version of its plan (limits, features, price).
        this.prisma.subscription
          .findFirst({
            where: { orgId, status: { not: 'cancelled' } },
            include: SUB_PLAN_INCLUDE,
          })
          .then(withEffectivePlan),
        this.prisma.organisationTemplate.count({ where: { orgId } }),
        countOrgProjects(this.prisma, orgId),
        countBillableOrgUsers(this.prisma, orgId),
        countOrgLandingPages(this.prisma, orgId),
        countOrgTotalLandingPages(this.prisma, orgId),
      ]);

    if (!subscription) {
      return {
        plan: null,
        subscription: null,
        usage: {
          templatesUsed,
          templatesLimit: null,
          projectsUsed,
          projectsLimit: null,
          usersUsed,
          usersLimit: null,
          landingPagesUsed,
          landingPagesLimit: null,
          landingPagesCreateUsed,
          landingPagesCreateLimit: null,
        },
      };
    }

    // Infinity -> null so the UI renders "unlimited" without a magic number.
    const asLimit = (key: 'projects' | 'users' | 'templates' | 'landingPages' | 'landingPagesCreate') => {
      const n = resolveLimit(subscription.plan, key);
      return n === Infinity ? null : n;
    };

    return {
      plan: {
        id: subscription.plan.id,
        name: subscription.plan.name,
        slug: subscription.plan.slug,
        priceMonthly: subscription.plan.priceMonthly,
        priceYearly: subscription.plan.priceYearly,
        color: subscription.plan.color,
        badge: subscription.plan.badge,
        isPopular: subscription.plan.isPopular,
        limits: subscription.plan.limits,
        capabilities: subscription.plan.capabilities,
      },
      subscription: {
        id: subscription.id,
        status: subscription.status,
        billingCycle: subscription.billingCycle,
        amount: subscription.amount,
        currency: subscription.currency,
        startedAt: subscription.startedAt,
        renewsAt: subscription.renewsAt,
        graceEndsAt: subscription.graceEndsAt,
        cancelledAt: subscription.cancelledAt,
      },
      // `*Limit: null` = unlimited on this plan.
      usage: {
        templatesUsed,
        templatesLimit: asLimit('templates'),
        projectsUsed,
        projectsLimit: asLimit('projects'),
        usersUsed,
        usersLimit: asLimit('users'),
        landingPagesUsed,
        landingPagesLimit: asLimit('landingPages'),
        landingPagesCreateUsed,
        landingPagesCreateLimit: asLimit('landingPagesCreate'),
      },
    };
  }

  /**
   * Renew the org's current subscription on its existing plan. Ends any grace
   * window / expired state and pushes renewsAt one full cycle out. Plan or
   * billing-cycle changes stay the business of changePlan.
   */
  async renew(orgId: string) {
    await applyOrgSubscriptionLifecycle(this.prisma, orgId);
    // Closed loophole (billing v2 step 3): this extended a paid plan for
    // free. Paid renewals go through checkout (billing v2 "Pay now") or a
    // Super Admin renewal; a free plan can still be renewed here.
    const current = await this.prisma.subscription.findFirst({
      where: { orgId, status: { not: 'cancelled' } },
      include: { plan: { select: { priceMonthly: true, priceYearly: true } } },
    });
    if (
      current &&
      (current.billingCycle === 'yearly'
        ? current.plan.priceYearly
        : current.plan.priceMonthly) > 0
    ) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        code: 'paid_renewal_requires_checkout',
        message:
          'Renewing a paid plan needs a payment. Contact our team and we will renew it for you.',
      });
    }
    const renewed = await renewOrgSubscription(this.prisma, orgId);

    await this.prisma.auditLog
      .create({
        data: {
          orgId,
          action: 'subscription_renewed',
          entity: 'Subscription',
          entityId: renewed.id,
          metadata: { renewsAt: renewed.renewsAt },
        },
      })
      .catch(() => {
        /* audit log is best-effort */
      });

    return {
      id: renewed.id,
      status: renewed.status,
      renewsAt: renewed.renewsAt,
      graceEndsAt: renewed.graceEndsAt,
    };
  }

  /**
   * Upgrade / downgrade the org's own plan. Reuses the same "one non-cancelled
   * subscription per org" rule as SubscriptionsService: if a subscription
   * exists we switch its plan (recomputing amount/mrr); otherwise we create
   * one. Delegates nothing to the super-admin subscriptions module — this is
   * the org-self-service path guarded by OrgAdminGuard.
   */
  async changePlan(orgId: string, dto: ChangePlanDto) {
    const plan = await this.prisma.plan.findUnique({ where: { id: dto.planId } });
    if (!plan || !plan.isActive) throw new NotFoundException('Plan not found or inactive');
    // Closed loophole (billing v2 step 2): this path switched plans for free.
    // Paid plans are bought through checkout (or a Super Admin approval);
    // free plans can still be selected here.
    if (plan.priceMonthly > 0 || plan.priceYearly > 0) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        code: 'paid_plan_requires_checkout',
        message:
          'Paid plans are bought from Billing → Plans, not switched here.',
      });
    }

    // Downgrade guard — refuse to move onto a plan the org already exceeds.
    // Nothing is deleted to make it fit; upgrades and same-usage moves pass.
    await assertPlanFitsCurrentUsage(this.prisma, orgId, plan);

    const billingCycle = dto.billingCycle ?? 'monthly';
    const { amount, mrr } = computeAmountAndMrr(plan, billingCycle);

    const existing = await this.prisma.subscription.findFirst({
      where: { orgId, status: { not: 'cancelled' } },
    });

    const planVersionId = await latestPlanVersionId(this.prisma, plan.id);
    let subscription: any;
    if (existing) {
      const data: Record<string, unknown> = {
        planId: plan.id,
        planVersionId,
        billingCycle: billingCycle as any,
        amount,
        mrr,
      };
      // Choosing a plan is a fresh commitment to a billing term — an org whose
      // subscription lapsed (expired/paused) comes back to life here, and the
      // renewsAt clock restarts for the new term.
      if (existing.status === 'expired' || existing.status === 'paused') {
        data.status = 'active';
        data.graceEndsAt = null;
        data.graceExtensionDays = 0;
        data.renewsAt = new Date(
          Date.now() + (billingCycle === 'yearly' ? 365 : 30) * 24 * 60 * 60 * 1000,
        );
      }
      subscription = await this.prisma.subscription.update({
        where: { id: existing.id },
        data: data as any,
        include: { plan: true },
      });
    } else {
      const renewsAt =
        billingCycle === 'yearly'
          ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
          : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      subscription = await this.prisma.subscription.create({
        data: {
          orgId,
          planId: plan.id,
          planVersionId,
          billingCycle: billingCycle as any,
          status: 'active',
          amount,
          mrr,
          currency: 'INR',
          renewsAt,
        },
        include: { plan: true },
      });
    }

    await this.prisma.auditLog
      .create({
        data: {
          orgId,
          action: existing ? 'subscription_updated' : 'subscription_created',
          entity: 'Subscription',
          entityId: subscription.id,
          metadata: { planId: plan.id, billingCycle, amount },
        },
      })
      .catch(() => {
        /* audit log is best-effort */
      });

    return {
      id: subscription.id,
      planId: subscription.planId,
      planName: subscription.plan.name,
      billingCycle: subscription.billingCycle,
      status: subscription.status,
      amount: subscription.amount,
      currency: subscription.currency,
      renewsAt: subscription.renewsAt,
      startedAt: subscription.startedAt,
    };
  }

  /**
   * Derives an invoice history from the org's active subscription. There is no
   * payment provider or Invoice table in the schema, so invoices are generated
   * from the billing cycle + term (startedAt → renewsAt) rather than stored.
   * Past periods are marked paid, the upcoming period pending.
   */
  async listInvoices(orgId: string): Promise<InvoiceRow[]> {
    const sub = await this.prisma.subscription.findFirst({
      where: { orgId, status: { not: 'cancelled' } },
      include: { plan: true },
    });
    if (!sub) return [];

    const periodMs =
      sub.billingCycle === 'yearly'
        ? 365 * 24 * 60 * 60 * 1000
        : 30 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    const start = new Date(sub.startedAt).getTime();
    const renews = sub.renewsAt ? new Date(sub.renewsAt).getTime() : start + periodMs;

    const short = orgId.replace(/-/g, '').slice(0, 6).toUpperCase();
    const invoices: InvoiceRow[] = [];
    // Start up to 11 periods before now (but never before the subscription
    // start) so the list shows recent history plus the current term.
    let cursor = Math.max(start, now - 11 * periodMs);
    cursor = start + Math.floor((cursor - start) / periodMs) * periodMs;
    let safety = 0;
    while (cursor < renews && safety < 60) {
      const periodStart = new Date(cursor);
      const periodEnd = new Date(cursor + periodMs);
      const status: InvoiceRow['status'] = periodEnd.getTime() <= now ? 'paid' : 'pending';
      const label =
        sub.billingCycle === 'yearly'
          ? `${periodStart.getFullYear()}`
          : `${periodStart.getFullYear()}${String(periodStart.getMonth() + 1).padStart(2, '0')}`;
      invoices.push({
        id: `inv-${sub.id}-${label}`,
        number: `INV-${short}-${label}`,
        issuedAt: periodStart.toISOString(),
        dueAt: periodStart.toISOString(),
        amount: sub.amount,
        currency: sub.currency,
        billingCycle: sub.billingCycle,
        status,
        planName: sub.plan.name,
      });
      cursor += periodMs;
      safety++;
    }
    return invoices.reverse();
  }
}
