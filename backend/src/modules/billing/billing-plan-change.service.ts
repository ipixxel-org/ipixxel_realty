import { Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { NO_SCHEDULED_CHANGE } from '../../common/utils/plan-change.util';
import {
  applyOrgSubscriptionLifecycle,
  findFreePlan,
  moveToFreePlan,
} from '../../common/utils/subscription-lifecycle.util';
import {
  closeScheduledChange,
  recordScheduledChange,
  scheduledChangeBlock,
} from '../../common/utils/scheduled-change.util';
import { pendingRequestMessage } from '../package-change-requests/package-change-requests.service';
import { whatStaysFor } from '../../common/utils/retention.util';
import { assertWhatStaysConfirmed } from './what-stays';
import {
  billingError,
  BillingCheckoutService,
} from './billing-checkout.service';
import { BillingModeService } from './billing-mode.service';
import { OrgBillingV2Service } from './org-billing-v2.service';
import { isFreePlan, planChangeDirection, planRanker } from './plan-modules';
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
    // Manual mode in grace (below). Optional so unit tests can leave them out:
    // without them everything behaves as online mode.
    @Optional() private readonly mode?: BillingModeService,
    @Optional() private readonly checkout?: BillingCheckoutService,
  ) {}

  /**
   * Manual mode with the renewal overdue (grace): moving to Basic happens at
   * once (no request), and any paid plan is a request at its full price.
   */
  private async manualOverdue(sub: { status: string }): Promise<boolean> {
    if (sub.status !== 'past_due' || !this.mode) return false;
    return (await this.mode.getMode()).mode === 'manual';
  }

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

  /**
   * One scheduled change at a time: choosing another plan (or Basic) is
   * refused until the scheduled one is undone ("Keep <plan>") or takes effect.
   */
  private async refuseWhileScheduled(
    sub: Parameters<typeof scheduledChangeBlock>[1],
  ) {
    const scheduled = await scheduledChangeBlock(this.prisma, sub);
    if (scheduled) throw billingError('change_scheduled', scheduled);
  }

  async cancel(
    orgId: string,
    userId: string,
    dto: CancelPlanDto,
  ): Promise<BillingOverviewV2> {
    const sub = await this.current(orgId);
    if (!sub || isFreePlan(sub.plan)) {
      throw billingError('nothing_to_cancel', "You're already on Basic.");
    }
    await this.refuseWhileScheduled(sub);
    const reason = dto.reason?.trim() || null;
    // Over Basic's limits: "choose what stays" must be confirmed first (a
    // saved choice that fits, or the default picks).
    const free = await findFreePlan(this.prisma);
    if (free) {
      await assertWhatStaysConfirmed(
        this.prisma,
        orgId,
        free,
        dto.acceptDefaultPicks,
      );
    }
    if (
      sub.status === 'expired' ||
      sub.status === 'paused' ||
      (await this.manualOverdue(sub))
    ) {
      // The term is already over (or, in manual mode, overdue): move to the
      // free plan now — extras paused, nothing deleted.
      await this.prisma.subscription.update({
        where: { id: sub.id },
        data: { cancelReason: reason },
      });
      await moveToFreePlan(this.prisma, { ...sub, cancelReason: reason });
    } else {
      await this.prisma.subscription.update({
        where: { id: sub.id },
        data: {
          ...NO_SCHEDULED_CHANGE,
          cancelAtPeriodEnd: true,
          cancelReason: reason,
          changeScheduledAt: new Date(),
        },
      });
      if (free) {
        await recordScheduledChange(this.prisma, {
          orgId,
          requestedById: userId,
          fromPlanId: sub.planId,
          toPlanId: free.id,
          interval: 'monthly',
          startsAt: sub.status === 'past_due' ? sub.graceEndsAt : sub.renewsAt,
          reason,
          amount: null,
          whatStays: await whatStaysFor(this.prisma, orgId, free),
        });
      }
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
      throw billingError(
        'nothing_scheduled',
        'No change to Basic is scheduled.',
      );
    }
    await this.prisma.subscription.update({
      where: { id: sub.id },
      data: { ...NO_SCHEDULED_CHANGE },
    });
    await closeScheduledChange(this.prisma, orgId, 'undone');
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
    await this.refuseWhileScheduled(sub);
    const overdueManual = await this.manualOverdue(sub);
    if (sub.status !== 'active' && sub.status !== 'trial' && !overdueManual) {
      throw billingError(
        'downgrade_not_now',
        'Your renewal is overdue. Renew your plan first, or move to Basic.',
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
      return this.cancel(orgId, userId, {
        acceptDefaultPicks: dto.acceptDefaultPicks,
      });
    }
    // Manual mode, renewal overdue: any paid plan is a change request at its
    // full price (the missed term continues) — the same as Change plan sends.
    if (overdueManual && this.checkout) {
      await this.checkout.start(orgId, userId, {
        planId: target.id,
        interval: dto.interval ?? sub.billingCycle,
        purpose: 'purchase',
        acceptDefaultPicks: dto.acceptDefaultPicks,
      });
      return this.overview.getOverview(orgId);
    }

    const interval = dto.interval ?? sub.billingCycle;
    const rank = planRanker(active);
    const samePlan = target.id === sub.planId;
    if (samePlan && interval === sub.billingCycle) {
      throw billingError(
        'same_plan',
        `You're already on ${target.name} (${interval}).`,
      );
    }
    const isDowngrade =
      planChangeDirection(
        { rank: rank(sub.plan), interval: sub.billingCycle },
        { rank: rank(target), interval },
      ) === 'downgrade';
    if (!isDowngrade) {
      throw billingError(
        'not_a_downgrade',
        `${target.name} (${interval}) isn't smaller than your current plan — that's an upgrade, from Change plan.`,
      );
    }
    // One request at a time: nothing else changes the plan until it's
    // approved, rejected or withdrawn.
    const pending = await this.prisma.packageChangeRequest.findFirst({
      where: { orgId, status: 'pending' },
      include: {
        currentPlan: { select: { name: true } },
        targetPlan: { select: { name: true } },
      },
    });
    if (pending) {
      throw billingError(
        'request_pending',
        pendingRequestMessage(
          pending.currentPlan?.name,
          pending.targetPlan?.name ?? 'a new plan',
          pending.createdAt,
        ),
      );
    }
    // Over the smaller plan's limits is fine once "choose what stays" is
    // confirmed: what doesn't fit is paused when it starts (retention.util).
    await assertWhatStaysConfirmed(
      this.prisma,
      orgId,
      target,
      dto.acceptDefaultPicks,
    );

    await this.prisma.subscription.update({
      where: { id: sub.id },
      data: {
        ...NO_SCHEDULED_CHANGE,
        scheduledPlanId: target.id,
        scheduledInterval: interval,
        changeScheduledAt: new Date(),
      },
    });
    await recordScheduledChange(this.prisma, {
      orgId,
      requestedById: userId,
      fromPlanId: sub.planId,
      toPlanId: target.id,
      interval,
      startsAt: sub.renewsAt,
      amount: interval === 'yearly' ? target.priceYearly : target.priceMonthly,
      whatStays: await whatStaysFor(this.prisma, orgId, target),
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
    await closeScheduledChange(this.prisma, orgId, 'undone');
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
