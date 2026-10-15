import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import {
  countBillableOrgUsers,
  countOrgLandingPages,
  countOrgProjects,
} from '../../common/utils/plan-quota.util';
import {
  applyOrgSubscriptionLifecycle,
  getBillingExpiryConfig,
} from '../../common/utils/subscription-lifecycle.util';
import { PlatformConfigService } from '../platform-config/platform-config.service';
import { BillingModeService } from './billing-mode.service';
import { buildOverview } from './billing-overview';
import { toProfileV2 } from './billing-profile.service';
import { expireStaleCheckouts, findPendingUpgrade } from './checkout-state';
import { taxOn } from './checkout-quote';
import {
  isFreePlan,
  sortPlans,
  toBillingPlan,
  toBillingPlans,
} from './plan-modules';
import type {
  AccessStatusV2,
  BillingOverviewV2,
  BillingPlanV2,
} from './billing.types';

/**
 * Billing v2, organisation side (read-only in step 1). Lives beside the
 * existing OrgBillingService, which keeps serving /org/billing unchanged.
 */
@Injectable()
export class OrgBillingV2Service {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mode: BillingModeService,
    // Optional so unit tests can leave it out (then renewalAmount is price × 1.18).
    private readonly platformConfig?: PlatformConfigService,
  ) {}

  /** Active plans in rank order (free plan first). */
  async listPlans(): Promise<BillingPlanV2[]> {
    const plans = await this.prisma.plan.findMany({
      where: { isActive: true },
    });
    return toBillingPlans(plans);
  }

  async getOverview(
    orgId: string,
    now = new Date(),
  ): Promise<BillingOverviewV2> {
    // Same lazy lifecycle pass as GET /org/billing, so a lapsed term shows up.
    await applyOrgSubscriptionLifecycle(this.prisma, orgId);
    await expireStaleCheckouts(this.prisma, orgId, now);

    const [
      org,
      owner,
      subscription,
      activePlans,
      users,
      projects,
      landingPages,
      templates,
      cfg,
      mode,
      profile,
      pendingUpgrade,
    ] = await Promise.all([
      this.prisma.organisation.findUnique({
        where: { id: orgId },
        select: { name: true },
      }),
      // The signup user — the first account created in the org.
      this.prisma.user.findFirst({
        where: { orgId },
        orderBy: { createdAt: 'asc' },
        select: { firstName: true, lastName: true, email: true },
      }),
      this.prisma.subscription.findFirst({
        where: { orgId, status: { not: 'cancelled' } },
        include: { plan: true },
      }),
      this.prisma.plan.findMany({ where: { isActive: true } }),
      countBillableOrgUsers(this.prisma, orgId),
      countOrgProjects(this.prisma, orgId),
      countOrgLandingPages(this.prisma, orgId),
      this.prisma.organisationTemplate.count({ where: { orgId } }),
      getBillingExpiryConfig(this.prisma),
      this.mode.getMode(),
      this.prisma.billingProfile.findUnique({
        where: { organisationId: orgId },
      }),
      findPendingUpgrade(this.prisma, orgId),
    ]);
    const seller = this.platformConfig
      ? await this.platformConfig.getSellerSettings()
      : null;
    if (!org) throw new NotFoundException('Organisation not found');

    // Rank comes from the active catalogue; a subscription on a since-archived
    // plan still gets a sensible rank (after the active ones).
    const ranked = sortPlans(activePlans);
    const rankOf = (id: string) => {
      const i = ranked.findIndex((p) => p.id === id);
      return i === -1 ? ranked.length : i;
    };
    const planRow = subscription?.plan ?? ranked.find(isFreePlan) ?? null;
    if (!planRow)
      throw new NotFoundException(
        'No plan is configured for this organisation.',
      );

    // A scheduled downgrade: the next term is on that plan / interval.
    const scheduledRow = subscription?.scheduledPlanId
      ? (activePlans.find((p) => p.id === subscription.scheduledPlanId) ?? null)
      : null;
    const nextInterval =
      subscription?.scheduledInterval ?? subscription?.billingCycle;
    const nextPlan = scheduledRow ?? planRow;
    // "Pay now · ₹X" must equal what the renewal checkout charges.
    const price = subscription
      ? nextInterval === 'yearly'
        ? nextPlan.priceYearly
        : nextPlan.priceMonthly
      : 0;
    const renewalTotalPaise =
      seller && price > 0
        ? taxOn(price * 100, {
            buyer: {
              state: profile?.state ?? null,
              country: profile?.country ?? 'IN',
            },
            seller: { state: seller.state },
          }).totalPaise
        : null;

    const ownerName = owner
      ? [owner.firstName, owner.lastName].filter(Boolean).join(' ') ||
        owner.email
      : '';
    return buildOverview({
      now,
      orgName: org.name,
      ownerName,
      billingProfile: profile ? toProfileV2(profile) : null,
      pendingUpgrade,
      plan: toBillingPlan(planRow, rankOf(planRow.id)),
      subscription: subscription
        ? {
            status: subscription.status as never,
            billingCycle: subscription.billingCycle,
            renewsAt: subscription.renewsAt,
            graceEndsAt: subscription.graceEndsAt,
            cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
            scheduled: scheduledRow
              ? {
                  plan: toBillingPlan(scheduledRow, rankOf(scheduledRow.id)),
                  interval: nextInterval ?? subscription.billingCycle,
                }
              : null,
          }
        : null,
      counts: { users, projects, landingPages, templates },
      notifyDays: cfg.notifyDays,
      graceDays: cfg.gracePeriodDays,
      mode,
      renewalTotalPaise,
    });
  }

  /**
   * Limits and features for the locked-state UI. Nothing is paused by the
   * backend yet (that arrives with "fall back to Basic"), so the lists are empty.
   */
  async getAccess(orgId: string): Promise<AccessStatusV2> {
    const o = await this.getOverview(orgId);
    return {
      planId: o.plan.id,
      planName: o.plan.name,
      limits: o.plan.limits,
      modules: o.plan.modules,
      pausedUserIds: [],
      viewOnlyProjectIds: [],
      offlineLandingPageIds: [],
    };
  }
}
