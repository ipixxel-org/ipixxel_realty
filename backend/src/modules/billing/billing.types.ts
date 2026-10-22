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
  locked: { users: number; projects: number; landingPages: number };
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
  users: RetentionItemV2[];
  projects: RetentionItemV2[];
  landingPages: RetentionItemV2[];
}

export interface AccessStatusV2 {
  planId: string;
  planName: string;
  limits: PlanLimitsV2;
  modules: PlanModulesV2;
  pausedUserIds: string[];
  viewOnlyProjectIds: string[];
  offlineLandingPageIds: string[];
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

/** An upgrade waiting on someone: a request for approval, or a paid checkout under review. */
export interface PendingUpgradeV2 {
  status: 'pending_approval' | 'needs_review';
  requestId: string | null;
  checkoutId: string | null;
  toPlan: { id: string; name: string };
  interval: BillingInterval;
  createdAt: string;
}
