import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { assertPlanFitsCurrentUsage } from '../../common/utils/plan-quota.util';
import { NO_SCHEDULED_CHANGE } from '../../common/utils/plan-change.util';
import {
  applyOrgSubscriptionLifecycle,
  moveToFreePlan,
} from '../../common/utils/subscription-lifecycle.util';
import { billingError } from './billing-checkout.service';
import { OrgBillingV2Service } from './org-billing-v2.service';
import { isFreePlan, sortPlans } from './plan-modules';
import type { BillingOverviewV2 } from './billing.types';
import type {
  CancelPlanDto,
  ScheduleDowngradeDto,
} from './dto/plan-change.dto';

/**
 * Billing v2 step 4: cancel and downgrade at the end of the term, and undo
 * either before then. This only records the choice on the subscription; the
 * lifecycle sweep applies it when the term ends (subscription-lifecycle.util),
 * and a renewal paid meanwhile is charged at the scheduled plan's price.
 * Every call returns the fresh overview.
 */
@Injectable()
export class BillingPlanChangeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly overview: OrgBillingV2Service,
  ) {}

  private async current(orgId: string) {
    await applyOrgSubscriptionLifecycle(this.prisma, orgId);
    return this.prisma.subscription.findFirst({
      where: { orgId, status: { not: 'cancelled' } },
      include: { plan: true },
    });
  }

  private audit(
    orgId: string,
    userId: string,
    action: string,
    entityId: string,
    metadata: Record<string, unknown>,
  ) {
    return this.prisma.auditLog
      .create({
        data: {
          orgId,
          actorId: userId,
          action,
          entity: 'Subscription',
          entityId,
          metadata: metadata as never,
        },
      })
      .catch(() => undefined);
  }

  async cancel(
    orgId: string,
    userId: string,
    dto: CancelPlanDto,
  ): Promise<BillingOverviewV2> {
    const sub = await this.current(orgId);
    if (!sub || isFreePlan(sub.plan)) {
      throw billingError(
        'nothing_to_cancel',
        "You're on the free plan — there's no paid plan to cancel.",
      );
    }
    const reason = dto.reason?.trim() || null;
    if (sub.status === 'expired' || sub.status === 'paused') {
      // The term is already over: move to the free plan now.
      await this.prisma.subscription.update({
        where: { id: sub.id },
        data: { cancelReason: reason },
      });
      await moveToFreePlan(this.prisma, { ...sub, cancelReason: reason });
    } else {
      // A scheduled downgrade is replaced: cancelling wins.
      await this.prisma.subscription.update({
        where: { id: sub.id },
        data: {
          ...NO_SCHEDULED_CHANGE,
          cancelAtPeriodEnd: true,
          cancelReason: reason,
          changeScheduledAt: new Date(),
        },
      });
      await this.audit(
        orgId,
        userId,
        'subscription_cancellation_scheduled',
        sub.id,
        {
          planId: sub.planId,
          endsAt: (sub.status === 'past_due'
            ? sub.graceEndsAt
            : sub.renewsAt
          )?.toISOString(),
          reason,
        },
      );
    }
    return this.overview.getOverview(orgId);
  }

  async undoCancel(orgId: string, userId: string): Promise<BillingOverviewV2> {
    const sub = await this.current(orgId);
    if (!sub?.cancelAtPeriodEnd) {
      throw billingError('nothing_scheduled', 'No cancellation is scheduled.');
    }
    await this.prisma.subscription.update({
      where: { id: sub.id },
      data: { ...NO_SCHEDULED_CHANGE },
    });
    await this.audit(
      orgId,
      userId,
      'subscription_cancellation_undone',
      sub.id,
      {},
    );
    return this.overview.getOverview(orgId);
  }

  async scheduleDowngrade(
    orgId: string,
    userId: string,
    dto: ScheduleDowngradeDto,
  ): Promise<BillingOverviewV2> {
    const sub = await this.current(orgId);
    if (!sub || isFreePlan(sub.plan)) {
      throw billingError(
        'nothing_to_downgrade',
        "You're on the free plan — there's nothing to downgrade.",
      );
    }
    if (sub.status !== 'active' && sub.status !== 'trial') {
      throw billingError(
        'downgrade_not_now',
        'Your renewal is overdue. Renew your plan first, or cancel to move to Basic.',
      );
    }
    const active = await this.prisma.plan.findMany({
      where: { isActive: true },
    });
    const target = active.find((p) => p.id === dto.planId);
    if (!target) {
      throw billingError(
        'plan_not_found',
        'That plan is not available. Pick another one.',
      );
    }
    // Moving to the free plan is cancelling.
    if (isFreePlan(target)) {
      return this.cancel(orgId, userId, {});
    }

    const interval = dto.interval ?? sub.billingCycle;
    const ranked = sortPlans(active);
    const rank = (id: string) => {
      const i = ranked.findIndex((p) => p.id === id);
      return i === -1 ? ranked.length : i;
    };
    const samePlan = target.id === sub.planId;
    if (samePlan && interval === sub.billingCycle) {
      throw billingError(
        'same_plan',
        `You're already on ${target.name} (${interval}).`,
      );
    }
    const isDowngrade = samePlan
      ? sub.billingCycle === 'yearly' && interval === 'monthly'
      : rank(target.id) < rank(sub.planId);
    if (!isDowngrade) {
      throw billingError(
        'not_a_downgrade',
        `${target.name} (${interval}) isn't smaller than your current plan — that's an upgrade, from Change plan.`,
      );
    }
    const pending = await this.prisma.packageChangeRequest.findFirst({
      where: { orgId, status: 'pending' },
    });
    if (pending) {
      throw billingError(
        'request_pending',
        'You have an upgrade request waiting for approval. Cancel it first.',
      );
    }
    // Nothing is paused yet ("choose what stays" comes later), so the org
    // has to fit the smaller plan before it can schedule it.
    try {
      await assertPlanFitsCurrentUsage(this.prisma, orgId, target);
    } catch (e) {
      throw billingError(
        'over_plan_limits',
        e instanceof Error ? e.message : String(e),
      );
    }

    await this.prisma.subscription.update({
      where: { id: sub.id },
      data: {
        ...NO_SCHEDULED_CHANGE,
        scheduledPlanId: target.id,
        scheduledInterval: interval,
        changeScheduledAt: new Date(),
      },
    });
    await this.audit(
      orgId,
      userId,
      'subscription_downgrade_scheduled',
      sub.id,
      {
        fromPlanId: sub.planId,
        toPlanId: target.id,
        billingCycle: interval,
        at: sub.renewsAt?.toISOString() ?? null,
      },
    );
    return this.overview.getOverview(orgId);
  }

  async undoDowngrade(
    orgId: string,
    userId: string,
  ): Promise<BillingOverviewV2> {
    const sub = await this.current(orgId);
    if (!sub?.scheduledPlanId) {
      throw billingError('nothing_scheduled', 'No downgrade is scheduled.');
    }
    await this.prisma.subscription.update({
      where: { id: sub.id },
      data: { ...NO_SCHEDULED_CHANGE },
    });
    await this.audit(
      orgId,
      userId,
      'subscription_downgrade_undone',
      sub.id,
      {},
    );
    return this.overview.getOverview(orgId);
  }
}
