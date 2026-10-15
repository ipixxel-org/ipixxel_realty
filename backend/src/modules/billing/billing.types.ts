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
  billingProfile: BillingProfileV2 | null;
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
  usage: UsageItemV2[];
  locked: { users: number; projects: number; landingPages: number };
  retention: null;
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
  /** Company tax settings (step 2). */
  seller: SellerSettingsV2;
  /** E.g. the seller state is missing, so every checkout is IGST. */
  warnings: BillingWarning[];
}

/* ------------------------------------------------------------ Step 2 */

/** The org as GST buyer. `state` is the 2-digit GST state code. */
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
  code: 'seller_state_missing' | 'buyer_outside_india';
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
  coupon: null;
  couponError: null;
  couponsEnabled: false;
  couponDiscount: 0;
  taxable: number;
  billingState: string | null;
  gst: GstBreakdownV2;
  total: number;
  periodEnd: string;
  recurringPrice: number;
  couponRenewalsLeft: 0;
  paymentMode: PaymentMode;
  paymentModeReason: ManualReason | null;
  warnings: BillingWarning[];
}

export type StartCheckoutResultV2 =
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
