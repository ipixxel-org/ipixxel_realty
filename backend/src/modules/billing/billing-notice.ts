import type { BillingNoticeV2, BillingOverviewV2 } from './billing.types';

/**
 * The member-safe slice of the billing overview (GET /org/billing/notice).
 * Built field by field — never spread from the overview — so amounts,
 * prices, coupons, invoices and the billing profile can't leak in later.
 */
export function toBillingNotice(o: BillingOverviewV2): BillingNoticeV2 {
  const v = o.nextVersion;
  // Lower limits or a feature switched off; a price rise alone isn't shown.
  const worse = !!v && v.changes.some((c) => c.lower);
  return {
    status: o.status,
    orgName: o.orgName,
    ownerName: o.ownerName,
    planName: (o.paidPlan ?? o.plan).name,
    currentPlanName: o.plan.name,
    periodEnd: o.periodEnd,
    daysLeftInPeriod: o.daysLeftInPeriod,
    dueDate: o.dueDate,
    graceEndsAt: o.graceEndsAt,
    graceDays: o.graceDays,
    graceExtraDays: o.graceExtraDays,
    graceDay: o.graceDay,
    graceDaysLeft: o.graceDaysLeft,
    movedToBasicAt: o.movedToBasicAt,
    cancelAt: o.cancelAt,
    downgradeAt: o.downgradeAt,
    downgradeToName: o.downgradeTo?.name ?? null,
    locked: {
      users: o.locked.users,
      projects: o.locked.projects,
      landingPages: o.locked.landingPages,
      templates: o.locked.templates,
    },
    nextVersion:
      v && worse
        ? {
            planName: v.planName,
            at: v.at,
            reason: v.reason,
            overLimit: v.overLimits.length > 0,
            answered: !!v.whatStays,
          }
        : null,
  };
}
