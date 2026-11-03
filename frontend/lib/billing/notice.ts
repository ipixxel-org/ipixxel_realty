/**
 * The member-safe slice of the billing overview — mirrors the backend's
 * toBillingNotice (billing-notice.ts). Used by the mock client; the real one
 * calls GET /org/billing/notice.
 */
import type { BillingNotice, BillingOverview } from "./types";

export function noticeFromOverview(o: BillingOverview): BillingNotice {
  const v = o.nextVersion;
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
    graceExtraDays: o.graceExtraDays ?? 0,
    graceDay: o.graceDay,
    graceDaysLeft: o.graceDaysLeft,
    movedToBasicAt: o.movedToBasicAt,
    cancelAt: o.cancelAt,
    downgradeAt: o.downgradeAt,
    downgradeToName: o.downgradeTo?.name ?? null,
    locked: {
      users: o.locked.users ?? 0,
      projects: o.locked.projects ?? 0,
      landingPages: o.locked.landingPages ?? 0,
      templates: o.locked.templates ?? 0,
    },
    nextVersion:
      v && worse
        ? { planName: v.planName, at: v.at, reason: v.reason, overLimit: (v.overLimits?.length ?? 0) > 0, answered: !!v.whatStays }
        : null,
  };
}
