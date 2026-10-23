/**
 * The mock client's state and the pure functions that turn it into API-shaped
 * responses. `situation` is where the demo org is in the billing lifecycle;
 * dates are derived from it and the mock clock (TODAY), so every screen agrees.
 */
import { defaultPicks, rankLandingPages, rankProjects, rankUsers } from "../default-picks";
import { EMPTY_BILLING_DETAILS, missingBillingDetails } from "../details";
import { addCycle, addDays, addMonths, daysBetween, planPrice, round2, withGst } from "../pricing";
import type {
  AccessStatus,
  BillingInterval,
  BillingOverview,
  BillingPlan,
  BillingProfile,
  Coupon,
  LifecycleSettings,
  SellerSettings,
  PaymentMethodSummary,
  RenewalMode,
  RetentionChoices,
  RetentionSummary,
  SubscriptionStatus,
} from "../types";
import {
  COUPON_REDEMPTIONS,
  COUPONS,
  DEFAULT_BILLING_DETAILS,
  DEMO_INVOICES,
  MOCK_SELLER,
  DEMO_LANDING_PAGES,
  DEMO_ORG,
  DEMO_ORG_REDEEMED,
  DEMO_PROJECTS,
  DEMO_USERS,
  GRACE_DAYS,
  NOTIFY_DAYS_BEFORE,
  ORGS,
  PAYMENTS,
  PLANS,
  SAVED_PAYMENT_METHOD,
  type MockOrg,
  type MockPayment,
  type MockRedemption,
} from "./data";

export type Situation =
  | "basic"
  | "active"
  | "renewal_3d"
  | "payment_due"
  | "grace_ends_tomorrow"
  | "moved_to_basic"
  | "cancellation_scheduled"
  | "downgrade_scheduled";

export interface Picks {
  users: string[];
  projects: string[];
  landingPages: string[];
}

type InvoiceRow = (typeof DEMO_INVOICES)[number];

export interface MockState {
  /* ---- the demo org ---- */
  situation: Situation;
  renewalMode: RenewalMode;
  paidPlanId: string;
  interval: BillingInterval;
  /** Start of the current period for active / scheduled situations. */
  periodStart: string;
  downgradeTargetId: string;
  picks: (Picks & { targetPlanId: string }) | null;
  billingProfile: BillingProfile | null;
  paymentMethod: PaymentMethodSummary;
  redeemed: string[];
  invoices: InvoiceRow[];
  /** Manual mode: an upgrade request waiting for Super Admin approval. */
  pendingRequest: { requestId: string; checkoutId: string; planId: string; interval: BillingInterval; createdAt: string } | null;
  /* ---- platform-wide (admin) ---- */
  plans: BillingPlan[];
  coupons: Coupon[];
  orgs: MockOrg[];
  payments: MockPayment[];
  redemptions: MockRedemption[];
  lifecycle: LifecycleSettings;
  /** Settings → Company & tax details. */
  seller: SellerSettings;
  creditNoteSeq: number;
  invoiceSeq: number;
}

export function initialMockState(overrides: Partial<MockState> = {}): MockState {
  const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
  return {
    situation: "active",
    renewalMode: "auto",
    paidPlanId: "pro",
    interval: "monthly",
    periodStart: "2026-10-01",
    downgradeTargetId: "growth",
    picks: null,
    billingProfile: { ...DEFAULT_BILLING_DETAILS },
    pendingRequest: null,
    paymentMethod: { ...SAVED_PAYMENT_METHOD },
    redeemed: [...DEMO_ORG_REDEEMED],
    invoices: clone(DEMO_INVOICES),
    plans: clone(PLANS),
    coupons: clone(COUPONS),
    orgs: clone(ORGS),
    payments: clone(PAYMENTS),
    redemptions: clone(COUPON_REDEMPTIONS),
    lifecycle: {
      notifyDaysBefore: NOTIFY_DAYS_BEFORE,
      graceDays: GRACE_DAYS,
      afterGrace: "fall_back_to_basic",
      expiryMessage: "",
      reminders: [
        { id: "before_renewal", enabled: true },
        { id: "payment_day", enabled: true },
        { id: "mid_grace", enabled: true },
        { id: "day_before_grace_ends", enabled: true },
      ],
      onlinePaymentsEnabled: true,
      paymentMode: "online",
      paymentModeReason: null,
      supports: { fallBackToBasic: true, reminderSchedule: true },
      warnings: [],
    },
    seller: { ...MOCK_SELLER },
    creditNoteSeq: 42,
    invoiceSeq: 713,
    ...overrides,
  };
}

/* ------------------------------------------------------------ Plans */

export function planById(s: MockState, id: string): BillingPlan {
  const p = s.plans.find((x) => x.id === id);
  if (!p) throw new Error(`Unknown plan ${id}`);
  return p;
}

export function freePlan(s: MockState): BillingPlan {
  return s.plans.find((p) => p.isFree) ?? s.plans[0];
}

export function planNames(s: MockState): Record<string, string> {
  return Object.fromEntries(s.plans.map((p) => [p.id, p.name]));
}

const STATUS: Record<Situation, SubscriptionStatus> = {
  basic: "free",
  active: "active",
  renewal_3d: "renewal_due",
  payment_due: "past_due",
  grace_ends_tomorrow: "grace_ending",
  moved_to_basic: "moved_to_basic",
  cancellation_scheduled: "cancellation_scheduled",
  downgrade_scheduled: "downgrade_scheduled",
};

/* ------------------------------------------------------- Dates & overview */

export interface Dates {
  periodStart: string | null;
  periodEnd: string | null;
  dueDate: string | null;
  graceEndsAt: string | null;
  movedToBasicAt: string | null;
}

export function deriveDates(s: MockState, today: string): Dates {
  const grace = s.lifecycle.graceDays;
  const back = (iso: string) => addMonths(iso, s.interval === "yearly" ? -12 : -1);
  let dueDate: string | null = null;
  let movedToBasicAt: string | null = null;
  switch (s.situation) {
    case "basic":
      return { periodStart: null, periodEnd: null, dueDate: null, graceEndsAt: null, movedToBasicAt: null };
    case "renewal_3d": {
      const end = addDays(today, NOTIFY_DAYS_BEFORE);
      return { periodStart: back(end), periodEnd: end, dueDate: null, graceEndsAt: null, movedToBasicAt: null };
    }
    case "payment_due":
      dueDate = today;
      break;
    case "grace_ends_tomorrow":
      dueDate = addDays(today, 1 - grace);
      break;
    case "moved_to_basic":
      dueDate = addDays(today, -grace * 2);
      movedToBasicAt = addDays(dueDate, grace);
      break;
    default:
      return { periodStart: s.periodStart, periodEnd: addCycle(s.periodStart, s.interval), dueDate: null, graceEndsAt: null, movedToBasicAt: null };
  }
  return {
    periodStart: back(dueDate),
    periodEnd: dueDate,
    dueDate,
    graceEndsAt: movedToBasicAt ? null : addDays(dueDate, grace),
    movedToBasicAt,
  };
}

/** Target plan for "choose what stays": the scheduled downgrade, else the free plan. */
export function retentionTarget(s: MockState, requested?: string): BillingPlan {
  if (requested) return planById(s, requested);
  return s.situation === "downgrade_scheduled" ? planById(s, s.downgradeTargetId) : freePlan(s);
}

export function effectivePicks(s: MockState, target: BillingPlan): Picks & { isDefault: boolean } {
  const p = s.picks;
  if (
    p &&
    p.targetPlanId === target.id &&
    p.users.length <= (target.limits.users ?? Infinity) &&
    p.projects.length <= (target.limits.projects ?? Infinity) &&
    p.landingPages.length <= (target.limits.landingPages ?? Infinity)
  ) {
    return { users: p.users, projects: p.projects, landingPages: p.landingPages, isDefault: false };
  }
  return { ...defaultPicks({ users: DEMO_USERS, projects: DEMO_PROJECTS, landingPages: DEMO_LANDING_PAGES }, target.limits), isDefault: true };
}

export function lockedIds(s: MockState): Picks {
  if (s.situation !== "moved_to_basic") return { users: [], projects: [], landingPages: [] };
  const keep = effectivePicks(s, freePlan(s));
  return {
    users: DEMO_USERS.filter((u) => !keep.users.includes(u.id)).map((u) => u.id),
    projects: DEMO_PROJECTS.filter((p) => !keep.projects.includes(p.id)).map((p) => p.id),
    landingPages: DEMO_LANDING_PAGES.filter((p) => !keep.landingPages.includes(p.id)).map((p) => p.id),
  };
}

function retentionSummary(s: MockState): RetentionSummary | null {
  const relevant = ["payment_due", "grace_ends_tomorrow", "moved_to_basic", "cancellation_scheduled", "downgrade_scheduled"];
  if (!relevant.includes(s.situation)) return null;
  const target = retentionTarget(s);
  const keep = effectivePicks(s, target);
  const names = <T extends { id: string; name: string }>(list: T[], ids: string[]) => list.filter((x) => ids.includes(x.id)).map((x) => x.name);
  return {
    targetPlanId: target.id,
    targetPlanName: target.name,
    isDefault: keep.isDefault,
    users: names(DEMO_USERS, keep.users),
    projects: names(DEMO_PROJECTS, keep.projects),
    landingPages: names(DEMO_LANDING_PAGES, keep.landingPages),
  };
}

export function deriveOverview(s: MockState, today: string): BillingOverview {
  const d = deriveDates(s, today);
  const onFree = s.situation === "basic" || s.situation === "moved_to_basic";
  const inGrace = s.situation === "payment_due" || s.situation === "grace_ends_tomorrow";
  const paidPlan = s.situation === "basic" ? null : planById(s, s.paidPlanId);
  const plan = onFree ? freePlan(s) : planById(s, s.paidPlanId);
  const scheduledAt = s.situation === "cancellation_scheduled" || s.situation === "downgrade_scheduled" ? d.periodEnd : null;
  const locked = lockedIds(s);
  const billingState = (s.billingProfile ?? DEFAULT_BILLING_DETAILS).state;
  return {
    orgName: DEMO_ORG.name,
    ownerName: DEMO_ORG.ownerName,
    plan,
    paidPlan,
    interval: s.interval,
    status: STATUS[s.situation],
    paymentMode: s.lifecycle.onlinePaymentsEnabled ? "online" : "manual",
    paymentModeReason: s.lifecycle.onlinePaymentsEnabled ? null : "switched_off",
    autoRenewAvailable: true,
    renewalMode: s.renewalMode,
    paymentMethod: paidPlan && s.renewalMode === "auto" ? s.paymentMethod : null,
    billingProfile: s.billingProfile ?? EMPTY_BILLING_DETAILS,
    billingDetailsMissing: missingBillingDetails(s.billingProfile),
    periodStart: d.periodStart,
    periodEnd: d.periodEnd,
    daysLeftInPeriod: d.periodEnd && !inGrace && !onFree ? Math.max(0, daysBetween(today, d.periodEnd)) : 0,
    daysInPeriod: d.periodStart && d.periodEnd ? daysBetween(d.periodStart, d.periodEnd) : 0,
    dueDate: d.dueDate,
    graceEndsAt: d.graceEndsAt,
    graceDays: s.lifecycle.graceDays,
    graceDay: d.dueDate && inGrace ? daysBetween(d.dueDate, today) + 1 : 0,
    graceDaysLeft: d.graceEndsAt ? Math.max(0, daysBetween(today, d.graceEndsAt)) : 0,
    movedToBasicAt: d.movedToBasicAt,
    cancelAt: s.situation === "cancellation_scheduled" ? scheduledAt : null,
    downgradeTo: s.situation === "downgrade_scheduled" ? planById(s, s.downgradeTargetId) : null,
    downgradeInterval: s.situation === "downgrade_scheduled" ? s.interval : null,
    downgradeAt: s.situation === "downgrade_scheduled" ? scheduledAt : null,
    renewalAmount: paidPlan ? withGst(planPrice(paidPlan, s.interval), billingState) : null,
    renewalBreakdown: paidPlan
      ? {
          planName: paidPlan.name,
          interval: s.interval,
          price: planPrice(paidPlan, s.interval),
          couponCode: null,
          couponDiscount: 0,
          taxable: planPrice(paidPlan, s.interval),
          gst: round2(withGst(planPrice(paidPlan, s.interval), billingState) - planPrice(paidPlan, s.interval)),
          total: withGst(planPrice(paidPlan, s.interval), billingState),
        }
      : null,
    usage: [
      { key: "users", label: "Users", used: DEMO_USERS.length, limit: plan.limits.users },
      { key: "projects", label: "Projects", used: DEMO_PROJECTS.length, limit: plan.limits.projects },
      { key: "landingPages", label: "Landing pages", used: DEMO_LANDING_PAGES.length, limit: plan.limits.landingPages },
      { key: "templates", label: "Templates", used: DEMO_ORG.templatesUsed, limit: plan.limits.templates },
    ],
    locked: { users: locked.users.length, projects: locked.projects.length, landingPages: locked.landingPages.length },
    retention: retentionSummary(s),
    pendingUpgrade: s.pendingRequest
      ? {
          status: "pending_approval",
          requestId: s.pendingRequest.requestId,
          checkoutId: s.pendingRequest.checkoutId,
          fromPlan: { id: plan.id, name: plan.name },
          toPlan: { id: s.pendingRequest.planId, name: planById(s, s.pendingRequest.planId).name },
          interval: s.pendingRequest.interval,
          createdAt: s.pendingRequest.createdAt,
        }
      : null,
    rejectedUpgrade: null,
  };
}

export function deriveRetention(s: MockState, today: string, requested?: string): RetentionChoices {
  const target = retentionTarget(s, requested);
  const keep = effectivePicks(s, target);
  const d = deriveDates(s, today);
  const appliesOn =
    s.situation === "moved_to_basic"
      ? null
      : s.situation === "payment_due" || s.situation === "grace_ends_tomorrow"
        ? d.graceEndsAt
        : d.periodEnd;
  const cap = (w: string) => w[0].toUpperCase() + w.slice(1);
  return {
    targetPlan: target,
    appliesOn,
    isDefault: keep.isDefault,
    users: rankUsers(DEMO_USERS, target.limits.users ?? Infinity).map(({ item, reason, picked }) => ({
      id: item.id,
      name: item.name,
      detail: `${cap(item.role)} · ${item.email}`,
      reason,
      defaultPicked: picked,
      selected: keep.users.includes(item.id),
      locked: item.role === "owner",
    })),
    projects: rankProjects(DEMO_PROJECTS, target.limits.projects ?? Infinity).map(({ item, reason, picked }) => ({
      id: item.id,
      name: item.name,
      detail: `${item.location} · ${item.units} units`,
      reason,
      defaultPicked: picked,
      selected: keep.projects.includes(item.id),
      locked: false,
    })),
    landingPages: rankLandingPages(DEMO_LANDING_PAGES, target.limits.landingPages ?? Infinity).map(({ item, reason, picked }) => ({
      id: item.id,
      name: item.name,
      detail: `${item.url} · ${item.leadsTotal} leads all time`,
      reason,
      defaultPicked: picked,
      selected: keep.landingPages.includes(item.id),
      locked: false,
    })),
  };
}

export function deriveAccess(s: MockState): AccessStatus {
  const onFree = s.situation === "basic" || s.situation === "moved_to_basic";
  const plan = onFree ? freePlan(s) : planById(s, s.paidPlanId);
  const locked = lockedIds(s);
  return {
    planId: plan.id,
    planName: plan.name,
    limits: plan.limits,
    modules: plan.modules,
    pausedUserIds: locked.users,
    viewOnlyProjectIds: locked.projects,
    offlineLandingPageIds: locked.landingPages,
  };
}
