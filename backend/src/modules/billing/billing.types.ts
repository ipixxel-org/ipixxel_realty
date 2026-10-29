import type { OnlinePaymentViewV2 } from './online-rows';
import type { WhatStays } from '../../common/utils/retention.util';

/**
 * Billing v2 response shapes. These mirror frontend/lib/billing/types.ts
 * (the contract in docs/billing-ui-contract.md) — keep the two in step.
 * Money is rupees (2 dp max); dates are "YYYY-MM-DD".
 */

export type BillingInterval = 'monthly' | 'yearly';

export interface PlanLimitsV2 {
  /** null = unlimited */
  users: number | null;
  projects: number | null;
  landingPages: number | null;
  templates: number | null;
}

export interface PlanModulesV2 {
  teamChat: boolean;
  metaLeadAds: boolean;
  /** null = unlimited */
  metaPages: number | null;
  whatsapp: boolean;
  aiCalling: boolean;
}

export interface BillingPlanV2 {
  id: string;
  name: string;
  tagline: string;
  priceMonthly: number;
  priceYearly: number;
  isFree: boolean;
  /** false = not offered to organisations (Super Admin still sees it). */
  isActive: boolean;
  rank: number;
  limits: PlanLimitsV2;
  modules: PlanModulesV2;
}

export type SubscriptionStatusV2 =
  | 'free'
  | 'active'
  | 'renewal_due'
  | 'past_due'
  | 'grace_ending'
  | 'expired'
  | 'moved_to_basic'
  | 'cancellation_scheduled'
  | 'downgrade_scheduled';

export type PaymentMode = 'online' | 'manual';
export type ManualReason = 'switched_off' | 'keys_missing' | 'gateway_disabled';

export interface UsageItemV2 {
  key: 'users' | 'projects' | 'landingPages' | 'templates';
  label: string;
  used: number;
  limit: number | null;
}

export type PlanChangeBlockedReasonV2 =
  | 'request_pending'
  | 'change_scheduled'
  // A paid online checkout is being checked (needs_review). Renewals still go through.
  | 'payment_review';

export interface BillingOverviewV2 {
  orgName: string;
  ownerName: string;
  plan: BillingPlanV2;
  paidPlan: BillingPlanV2 | null;
  interval: BillingInterval;
  status: SubscriptionStatusV2;
  paymentMode: PaymentMode;
  paymentModeReason: ManualReason | null;
  /** Auto-renew (saved card / UPI mandate) isn't offered — renewals are "pay each time". */
  autoRenewAvailable: boolean;
  renewalMode: 'auto' | 'manual';
  paymentMethod: null;
  /** The org profile (Settings → General) as invoice buyer; empty strings where not filled in. */
  billingProfile: BillingProfileV2;
  /** Required invoice fields still empty — checkout is blocked until they're filled in. */
  billingDetailsMissing: (
    'legalName' | 'addressLine1' | 'city' | 'state' | 'pincode'
  )[];
  /** A pending upgrade request, or a paid upgrade under review (step 2). */
  pendingUpgrade: PendingUpgradeV2 | null;
  /** Set while the org's latest package request is a rejected one (shown with its reason). */
  rejectedUpgrade: RejectedUpgradeV2 | null;
  /**
   * Why plan changes (plan cards, checkout, change request, downgrade) are
   * blocked right now, or null: 'request_pending' while an approval request
   * waits; 'change_scheduled' while a change to Basic / a smaller plan is
   * scheduled (until it's undone or takes effect). Renewals, "Keep <plan>"
   * and "choose what stays" are never blocked by 'change_scheduled'.
   */
  planChangeBlockedReason: PlanChangeBlockedReasonV2 | null;
  /** The same words the API refuses with (tooltip / note); null when not blocked. */
  planChangeBlockedMessage: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  daysLeftInPeriod: number;
  daysInPeriod: number;
  dueDate: string | null;
  graceEndsAt: string | null;
  graceDays: number;
  graceDay: number;
  graceDaysLeft: number;
  movedToBasicAt: string | null;
  cancelAt: string | null;
  downgradeTo: BillingPlanV2 | null;
  /** Billing period after the scheduled downgrade (yearly → monthly is one too). */
  downgradeInterval: BillingInterval | null;
  downgradeAt: string | null;
  renewalAmount: number | null;
  /** How renewalAmount is made up — the same calculation as the renewal checkout. */
  renewalBreakdown: RenewalBreakdownV2 | null;
  usage: UsageItemV2[];
  locked: {
    users: number;
    projects: number;
    landingPages: number;
    templates: number;
  };
  /** What stays on the plan the org is moving to (grace / cancel / downgrade / Basic). */
  retention: RetentionSummaryV2 | null;
}

export interface RenewalBreakdownV2 {
  planName: string;
  interval: BillingInterval;
  /** Plan price before GST (rupees). */
  price: number;
  couponCode: string | null;
  couponDiscount: number;
  taxable: number;
  gst: number;
  total: number;
}

export interface RetentionSummaryV2 {
  targetPlanId: string;
  targetPlanName: string;
  isDefault: boolean;
  users: string[];
  projects: string[];
  landingPages: string[];
  templates: string[];
}

export interface RetentionItemV2 {
  id: string;
  name: string;
  detail: string;
  reason: string;
  defaultPicked: boolean;
  selected: boolean;
  locked: boolean;
}

export interface RetentionChoicesV2 {
  targetPlan: BillingPlanV2;
  appliesOn: string | null;
  isDefault: boolean;
  /**
   * A saved choice exists and fits the plan's limits today (a plan's limits
   * can be lowered after it was saved). False without one. Missing on stored
   * copies (history views).
   */
  savedFits?: boolean;
  /**
   * Read-only: for the org once the change was decided or took effect (or
   * it's the plan they're on); for anyone on an older row (history).
   */
  locked: boolean;
  /**
   * What the lists are. Missing / 'live': today's state (or the planned
   * choice). 'history': an older row's copy from when it applied (viewDate).
   * 'not_applied': a rejected / withdrawn / undone row's request.
   */
  view?: 'live' | 'history' | 'not_applied';
  viewDate?: string | null;
  users: RetentionItemV2[];
  projects: RetentionItemV2[];
  landingPages: RetentionItemV2[];
  templates: RetentionItemV2[];
}

export interface AccessStatusV2 {
  planId: string;
  planName: string;
  limits: PlanLimitsV2;
  modules: PlanModulesV2;
  pausedUserIds: string[];
  viewOnlyProjectIds: string[];
  offlineLandingPageIds: string[];
  /** Assigned templates that can't be used for new landing pages. */
  pausedTemplateIds: string[];
}

export type AfterGraceBehavior = 'fall_back_to_basic' | 'restrict' | 'cancel';

export interface ReminderRule {
  id: 'before_renewal' | 'payment_day' | 'mid_grace' | 'day_before_grace_ends';
  enabled: boolean;
}

/** GET/PUT /admin/billing/online-payments — Integrations → Online payments. */
export interface OnlinePaymentsV2 {
  /** The Super Admin switch (platform_configs.online_payments_enabled). */
  enabled: boolean;
  /** Effective mode: the switch AND a gateway with usable keys. */
  paymentMode: PaymentMode;
  paymentModeReason: ManualReason | null;
  /** The gateway with usable keys (complete and switched on), or null. */
  gateway: 'razorpay' | null;
}

export interface LifecycleSettingsV2 {
  notifyDaysBefore: number;
  graceDays: number;
  afterGrace: AfterGraceBehavior;
  expiryMessage: string;
  reminders: ReminderRule[];
  onlinePaymentsEnabled: boolean;
  /** Effective mode (read-only): the switch AND usable Razorpay keys. */
  paymentMode: PaymentMode;
  paymentModeReason: ManualReason | null;
  /** What this backend can store yet; the UI greys out the rest. */
  supports: { fallBackToBasic: boolean; reminderSchedule: boolean };
  /** E.g. the seller state is missing (every checkout is IGST), or BILLING_V2 isn't set on the server. */
  warnings: BillingWarning[];
}

/** Super Admin → Settings → Company & tax details. */
export interface CompanyDetailsV2 {
  seller: SellerSettingsV2;
  warnings: BillingWarning[];
}

/** POST /admin/billing/lifecycle/run */
export interface LifecycleRunResultV2 {
  ranAt: string;
  scanned: number;
  movedToFreePlan: number;
  scheduledPlanApplied: number;
  newlyPastDue: number;
  newlyExpired: number;
  newlyCancelled: number;
  remindersSent: number;
}

/** GET /org/billing/coupons — a coupon this organisation can see. */
export type OrgCouponStatusV2 =
  'available' | 'redeemed' | 'expired' | 'used_up';
export interface OrgCouponV2 {
  code: string;
  description: string;
  kind: 'percent' | 'fixed';
  value: number;
  plans: { id: string; name: string }[];
  interval: 'any' | 'monthly' | 'yearly';
  duration: 'first_payment' | 'first_n' | 'forever';
  durationCount: number | null;
  validTo: string | null;
  /** Reserved for this organisation (vs a public coupon). */
  forYourOrg: boolean;
  status: OrgCouponStatusV2;
  /** When this organisation first used it, with that payment's invoice. */
  redeemedAt: string | null;
  invoiceUrl: string | null;
  invoiceNumber: string | null;
}

/* ------------------------------------------------------------ Step 2 */

/** The org as GST buyer, read from the org profile (Settings → General). `state` is the 2-digit GST state code ("" = not chosen). */
export interface BillingProfileV2 {
  legalName: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string;
  pincode: string;
  /** ISO country code; only 'IN' is fully supported (others: IGST, TODO). */
  country: string;
  gstin: string | null;
}

/** The platform as GST seller (Super Admin → lifecycle / billing settings). */
export interface SellerSettingsV2 {
  legalName: string | null;
  gstin: string | null;
  state: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  pincode: string | null;
}

export interface BillingWarning {
  code:
    'seller_state_missing' | 'buyer_outside_india' | 'billing_v2_server_off';
  message: string;
}

export type CheckoutKind =
  'new' | 'upgrade_same_interval' | 'interval_change' | 'renewal';

export interface GstBreakdownV2 {
  kind: 'intra' | 'inter';
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
}

export interface CheckoutPreviewV2 {
  planId: string;
  planName: string;
  interval: BillingInterval;
  kind: CheckoutKind;
  fromPlan: { id: string; name: string; interval: BillingInterval } | null;
  /** Full price of the chosen plan and interval (rupees, before GST). */
  planPrice: number;
  /**
   * Upgrade: the difference for the days left. Interval change: credit for
   * the unused part of the current monthly cycle. null for a new purchase.
   */
  proration: {
    oldPrice: number;
    newPrice: number;
    daysLeft: number;
    daysInPeriod: number;
    charge: number;
    credit: number;
  } | null;
  coupon: { code: string; description: string } | null;
  /** Why the entered coupon can't be used (shown under the field); not an error. */
  couponError: string | null;
  /** Why the org can't move to this plan yet (over its limits); null when it fits. Pay is refused. */
  usageError: string | null;
  /** Manual mode: over the target's limits in ways "choose what stays" fixes (null = none). */
  usageConflict: UsageConflictV2 | null;
  /** false for a renewal: its coupon (if any) comes from the subscription. */
  couponsEnabled: boolean;
  couponDiscount: number;
  taxable: number;
  billingState: string | null;
  gst: GstBreakdownV2;
  total: number;
  periodEnd: string;
  recurringPrice: number;
  /** Renewals the coupon still covers after this payment; 99 = every one. */
  couponRenewalsLeft: number;
  paymentMode: PaymentMode;
  paymentModeReason: ManualReason | null;
  warnings: BillingWarning[];
}

export type StartCheckoutResultV2 =
  /** Nothing to pay (a 100% coupon): the plan is already applied. */
  | {
      status: 'activated';
      receipt: {
        planId: string;
        planName: string;
        interval: BillingInterval;
        amount: number;
        reference: string;
        activeUntil: string;
        couponCode: string | null;
      };
    }
  | {
      status: 'payment_required';
      mode: 'online';
      checkoutId: string;
      amount: number;
      razorpay: {
        keyId: string;
        orderId: string;
        amountPaise: number;
        currency: 'INR';
        name: string;
        description: string;
        prefill: { name?: string; email?: string; contact?: string };
      };
    }
  | {
      status: 'pending_approval';
      mode: 'manual';
      /** null when an older request (made before billing v2) is the pending one. */
      checkoutId: string | null;
      requestId: string;
    };

export type CheckoutStatusV2 =
  | 'pending'
  | 'paid'
  | 'failed'
  | 'expired'
  | 'cancelled'
  | 'approved'
  | 'rejected'
  | 'needs_review';

export interface ConfirmCheckoutResultV2 {
  checkoutId: string;
  checkoutStatus: CheckoutStatusV2;
  paymentStatus: 'created' | 'pending' | 'captured' | 'failed' | 'refunded';
  toPlanId: string;
  toInterval: BillingInterval;
}

/**
 * Manual mode: the target plan allows fewer users / projects / published
 * landing pages than the org has. The request can still be sent once the org
 * has chosen what stays for that plan (`choicesFit`); the rest is paused when
 * it is approved.
 */
export interface UsageConflictV2 {
  items: {
    key: 'users' | 'projects' | 'landingPages' | 'templates';
    limit: number;
    used: number;
  }[];
  choicesFit: boolean;
}

/** One plan change request on Settings → Billing → Requests (newest first). */
export interface OrgPlanRequestV2 {
  id: string;
  /**
   * request = sent for approval (manual mode); scheduled_change = a downgrade /
   * move to Basic at the end of the term, recorded here (no approval, never pending).
   */
  kind: 'request' | 'scheduled_change' | 'online_payment';
  requestedAt: string;
  requestedBy: string | null;
  fromPlan: { id: string; name: string } | null;
  toPlan: { id: string; name: string };
  interval: BillingInterval;
  /** Before GST, in rupees: the request's quote, else the plan price for the cycle. */
  amount: number | null;
  /** How the amount was worked out (shown after it). */
  amountNote: 'prorated' | 'less_monthly_credit' | null;
  /**
   * Requests: pending → approved / rejected / withdrawn (stored as cancelled).
   * Scheduled changes: scheduled → done / undone ("Keep <plan>") / replaced.
   */
  status:
    | 'pending'
    | 'approved'
    | 'rejected'
    | 'withdrawn'
    | 'scheduled'
    | 'done'
    | 'undone'
    | 'replaced'
    // Online payments (online step 3): approved = paid; closed = failed,
    // expired or replaced (stored as cancelled; online.state says which).
    | 'awaiting_payment'
    | 'needs_review'
    | 'closed';
  /** Online payments only: the payment's state, order id and invoice. */
  online?: OnlinePaymentViewV2 | null;
  decidedAt: string | null;
  rejectionReason: string | null;
  /**
   * What they chose to keep on the new plan (only the limits they were over);
   * null when nothing had to be chosen. `applied` once approved.
   */
  whatStays: WhatStays | null;
  /**
   * The row's what-stays button: 'change' on the latest row while it's open,
   * 'view' on every other row with a record (live state on the latest applied
   * row, history on older ones); null when everything fit.
   */
  whatStaysAction: 'change' | 'view' | null;
  /** "Renewal of Pro" (same plan, a renewal) or "Change to Starter". */
  label: string;
  /** Sent while the renewal was overdue (grace): full price, the missed term continues. */
  overdue: boolean;
  /** Total incl. GST in rupees (what to pay); null for older requests. */
  total: number | null;
  /** Manual mode: the payment our team recorded for it (Mark as paid). */
  payment: RequestPaymentV2 | null;
  /** Option A: the org fell back to Basic while this request was waiting. */
  movedToBasicAt: string | null;
  /** How the total is made up (requests with a price); shows a coupon on it. */
  quote: RequestQuoteV2 | null;
  /** Scheduled changes: when it applies (end of the term / grace). */
  startsAt: string | null;
  /** Scheduled changes: the reason they gave (moving to Basic). */
  reason: string | null;
}

/** A request's price: "₹1,499 − ₹300 coupon (CODE) + GST ₹215.82 = ₹1,414.82" (rupees). */
export interface RequestQuoteV2 {
  /** Before the coupon and GST (after any proration credit). */
  price: number;
  /** The coupon taken off; null without one. */
  couponCode: string | null;
  couponDiscount: number;
  gst: number;
  total: number;
  /** Our team added the coupon on the request (Remove restores the original quote). */
  couponAdded: boolean;
}

/** A payment the Super Admin marked against a request. */
export interface RequestPaymentV2 {
  id: string;
  /** Rupees received, GST included. */
  amount: number;
  method: string;
  reference: string;
  receivedOn: string;
  note: string | null;
  /** awaiting_approval → received on approval; refund_due when rejected. */
  status: 'awaiting_approval' | 'received' | 'refund_due' | 'refunded';
}

/** The org's most recent package request, when a Super Admin rejected it (with the reason). */
export interface RejectedUpgradeV2 {
  requestId: string;
  toPlan: { id: string; name: string };
  interval: BillingInterval;
  rejectedAt: string | null;
  reason: string | null;
}

/** An upgrade waiting on someone: a request for approval, or a paid checkout under review. */
export interface PendingUpgradeV2 {
  status: 'pending_approval' | 'needs_review';
  requestId: string | null;
  checkoutId: string | null;
  /** The plan the request was made from (null when not known). */
  fromPlan: { id: string; name: string } | null;
  toPlan: { id: string; name: string };
  interval: BillingInterval;
  createdAt: string;
  /** "Renewal of Pro" or "Change to Starter". */
  label?: string;
  /** Sent while the renewal was overdue. */
  overdue?: boolean;
  /** Manual mode: our team has recorded the payment (waiting for approval). */
  paid?: boolean;
  /** Option A: the org fell back to Basic while waiting. */
  movedToBasicAt?: string | null;
}
