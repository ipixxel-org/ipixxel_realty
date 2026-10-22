import { billingNow } from '../../common/utils/billing-clock.util';
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
import { BillingRetentionService } from './billing-retention.service';
import { buildOverview } from './billing-overview';
import {
  billingDetailsFromOrg,
  ORG_BILLING_SELECT,
} from './org-billing-details';
import {
  expireStaleCheckouts,
  findPendingUpgrade,
  findRejectedUpgrade,
} from './checkout-state';
import { toRupees } from './checkout-quote';
import { renewalCharge } from './coupon-rules';
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
    // Optional for the same reason: without it nothing shows as paused.
    private readonly retention?: BillingRetentionService,
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
    now = billingNow(),
  ): Promise<BillingOverviewV2> {
    // Same lazy lifecycle pass as GET /org/billing, so a lapsed term shows up.
    await applyOrgSubscriptionLifecycle(this.prisma, orgId, now);
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
      pendingUpgrade,
      rejectedUpgrade,
    ] = await Promise.all([
      this.prisma.organisation.findUnique({
        where: { id: orgId },
        select: ORG_BILLING_SELECT, // includes name
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
      findPendingUpgrade(this.prisma, orgId),
      findRejectedUpgrade(this.prisma, orgId),
    ]);
    // Step 6: what's paused, what will stay, and the plan moved down from.
    const [paused, retentionSummary] = this.retention
      ? await Promise.all([
          this.retention.paused(orgId),
          this.retention.summary(orgId),
        ])
      : [null, null];
    const previousRow =
      subscription?.movedToBasicAt && subscription.previousPlanId
        ? await this.prisma.plan.findUnique({
            where: { id: subscription.previousPlanId },
          })
        : null;
    const seller = this.platformConfig
      ? await this.platformConfig.getSellerSettings()
      : null;
    if (!org) throw new NotFoundException('Organisation not found');
    // Billing details are the org profile (Settings → General).
    const profile = billingDetailsFromOrg(org);

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
    // A first_n / forever coupon still on the subscription comes off first,
    // exactly as the renewal checkout applies it.
    const couponLeft = subscription?.couponRenewalsLeft ?? null;
    const coupon =
      subscription?.couponId && (couponLeft === null || couponLeft > 0)
        ? await this.prisma.coupon.findUnique({
            where: { id: subscription.couponId },
          })
        : null;
    const couponApplies =
      !!coupon &&
      coupon.planIds.includes(nextPlan.id) &&
      (coupon.interval === 'any' || coupon.interval === nextInterval);
    const charge =
      seller && price > 0
        ? renewalCharge(price * 100, couponApplies ? coupon : null, {
            buyer: {
              state: profile.state || null,
              country: profile.country,
            },
            seller: { state: seller.state },
          })
        : null;
    const renewalTotalPaise = charge?.totalPaise ?? null;
    const renewalBreakdown = charge
      ? {
          planName: nextPlan.name,
          interval: nextInterval ?? 'monthly',
          price: toRupees(charge.subtotalPaise),
          couponCode: couponApplies ? coupon.code : null,
          couponDiscount: toRupees(charge.couponDiscountPaise),
          taxable: toRupees(charge.taxablePaise),
          gst: toRupees(charge.gstPaise),
          total: toRupees(charge.totalPaise),
        }
      : null;

    const ownerName = owner
      ? [owner.firstName, owner.lastName].filter(Boolean).join(' ') ||
        owner.email
      : '';
    return buildOverview({
      now,
      orgName: org.name,
      ownerName,
      billingProfile: profile,
      pendingUpgrade,
      rejectedUpgrade,
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
      renewalBreakdown,
      movedToBasic:
        subscription?.movedToBasicAt && previousRow
          ? {
              at: subscription.movedToBasicAt,
              plan: toBillingPlan(previousRow, rankOf(previousRow.id)),
              interval: subscription.previousInterval ?? 'monthly',
            }
          : null,
      locked: paused
        ? {
            users: paused.pausedUserIds.length,
            projects: paused.viewOnlyProjectIds.length,
            landingPages: paused.offlineLandingPageIds.length,
          }
        : undefined,
      retention: retentionSummary,
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
      ...(this.retention
        ? await this.retention.paused(orgId)
        : {
            pausedUserIds: [],
            viewOnlyProjectIds: [],
            offlineLandingPageIds: [],
          }),
    };
  }
}
