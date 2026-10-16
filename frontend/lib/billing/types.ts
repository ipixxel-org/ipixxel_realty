/**
 * Billing v2 — request / response types shared by the UI and the future
 * backend. The backend implements `BillingClient` (see `client.ts`) with these
 * exact shapes; `docs/billing-ui-contract.md` lists them per call.
 *
 * Money: rupees as numbers with up to 2 decimals (plan prices are whole
 * rupees). The backend stores payments in integer paise — convert at the API
 * boundary (÷ 100 on the way out, × 100 on the way in).
 * Dates: ISO "YYYY-MM-DD" (or full ISO datetimes where noted).
 */

export type PlanId = string;
export type BillingInterval = "monthly" | "yearly";

/* ------------------------------------------------------------------ Plans */

/** null = unlimited. */
export interface PlanLimits {
  users: number | null;
  projects: number | null;
  landingPages: number | null;
  templates: number | null;
}

export interface PlanModules {
  teamChat: boolean;
  metaLeadAds: boolean;
  /** Facebook pages that can be connected for Meta lead ads (0 when off, null = unlimited). */
  metaPages: number | null;
  /** Not sold yet — shown disabled as "coming later". */
  whatsapp: boolean;
  aiCalling: boolean;
}

export interface BillingPlan {
  id: PlanId;
  name: string;
  tagline: string;
  /** Whole rupees, before GST. */
  priceMonthly: number;
  priceYearly: number;
  /** The single free plan orgs fall back to (Basic). */
  isFree: boolean;
  /** Ordering: higher = bigger plan. Upgrade vs downgrade is decided by rank. */
  rank: number;
  limits: PlanLimits;
  modules: PlanModules;
}

/* ----------------------------------------------------------- Subscription */

export type SubscriptionStatus =
  | "free"
  | "active"
  | "renewal_due"
  | "past_due"
  | "grace_ending"
  /** Grace ended under the "restrict" policy: still on the paid plan, publishing paused. */
  | "expired"
  | "moved_to_basic"
  | "cancellation_scheduled"
  | "downgrade_scheduled";

/** "auto" = Option A (saved card / UPI mandate); "manual" = Option B (Pay now each time). */
export type RenewalMode = "auto" | "manual";

/** "online" = pay with Razorpay; "manual" = upgrades are requests a Super Admin approves. */
export type PaymentMode = "online" | "manual";
/** Why payments are manual: Super Admin switch off, no usable Razorpay keys, or Razorpay turned off in Integrations. */
export type ManualReason = "switched_off" | "keys_missing" | "gateway_disabled";

export interface PaymentMethodSummary {
  kind: "card" | "upi";
  label: string;
  detail: string;
}

export interface BillingProfile {
  legalName: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  /** 2-digit GST state code ("29" = Karnataka) — decides CGST+SGST vs IGST and must match the GSTIN. */
  state: string;
  pincode: string;
  /** ISO country code; only "IN" is fully supported (others: IGST, no GSTIN). */
  country: string;
  /** Optional, upper-case. */
  gstin: string | null;
}

/** The platform as GST seller (Super Admin → company tax settings). Every field null until set. */
export interface SellerSettings {
  legalName: string | null;
  gstin: string | null;
  /** 2-digit GST state code. */
  state: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  pincode: string | null;
}

export interface BillingWarning {
  /** billing_v2_server_off: BILLING_V2=true isn't set on the backend, so grace still ends with the old setting. */
  code: "seller_state_missing" | "buyer_outside_india" | "billing_v2_server_off";
  message: string;
}

/** An upgrade waiting on someone: a request awaiting approval, or a paid checkout under review. */
export interface PendingUpgrade {
  status: "pending_approval" | "needs_review";
  requestId: string | null;
  checkoutId: string | null;
  toPlan: { id: PlanId; name: string };
  interval: BillingInterval;
  createdAt: string;
}

export interface UsageItem {
  key: "users" | "projects" | "landingPages" | "templates";
  label: string;
  used: number;
  /** null = unlimited */
  limit: number | null;
}

/** Names of what stays active on the target plan (saved choice or default picks). */
export interface RetentionSummary {
  targetPlanId: PlanId;
  targetPlanName: string;
  isDefault: boolean;
  users: string[];
  projects: string[];
  landingPages: string[];
}

export interface RenewalBreakdown {
  planName: string;
  interval: BillingInterval;
  /** Plan price before GST. */
  price: number;
  couponCode: string | null;
  couponDiscount: number;
  taxable: number;
  gst: number;
  total: number;
}

export interface BillingOverview {
  orgName: string;
  ownerName: string;
  /** Plan whose limits apply today. */
  plan: BillingPlan;
  /** The paid plan — current, or the one held before moving to Basic. null for a free sign-up. */
  paidPlan: BillingPlan | null;
  interval: BillingInterval;
  status: SubscriptionStatus;
  /** How upgrades and renewals are paid right now (switch AND usable Razorpay keys). */
  paymentMode: PaymentMode;
  paymentModeReason: ManualReason | null;
  /** False = no saved card / UPI mandate: hide auto-renew and "Update payment method". */
  autoRenewAvailable: boolean;
  renewalMode: RenewalMode;
  paymentMethod: PaymentMethodSummary | null;
  billingProfile: BillingProfile | null;
  /** A pending upgrade request, or a paid upgrade under review. */
  pendingUpgrade: PendingUpgrade | null;
  periodStart: string | null;
  /** Renewal date (end of the current or unpaid period). */
  periodEnd: string | null;
  daysLeftInPeriod: number;
  daysInPeriod: number;
  /** Date the unpaid renewal fell due. */
  dueDate: string | null;
  /** Date the org moves to Basic if still unpaid. */
  graceEndsAt: string | null;
  graceDays: number;
  graceDay: number;
  graceDaysLeft: number;
  movedToBasicAt: string | null;
  cancelAt: string | null;
  downgradeTo: BillingPlan | null;
  /** Billing period after the scheduled downgrade. */
  downgradeInterval: BillingInterval | null;
  downgradeAt: string | null;
  /** Next renewal charge incl. GST. null on the free plan with nothing to renew. */
  renewalAmount: number | null;
  /** How renewalAmount is made up ("₹1,499 + GST = ₹1,768.82") — the renewal checkout's calculation. */
  renewalBreakdown: RenewalBreakdown | null;
  usage: UsageItem[];
  /** How many items are paused / view-only / offline right now. */
  locked: { users: number; projects: number; landingPages: number };
  /** Present while a move to a smaller plan is pending or has happened. */
  retention: RetentionSummary | null;
}

/* --------------------------------------------------------------- Checkout */

export interface PreviewCheckoutRequest {
  planId: PlanId;
  interval: BillingInterval;
  couponCode?: string;
  /** Billing state typed in the (unsaved) billing form; defaults to the saved profile. */
  billingState?: string;
  /** "renewal": one more term of the current plan (planId + interval must be the current ones). */
  purpose?: "purchase" | "renewal";
}

export interface GstBreakdown {
  kind: "intra" | "inter";
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
}

/**
 * new: no active paid plan — full price, a new cycle starts now.
 * upgrade_same_interval: (new − old) × daysLeft ÷ daysInCycle; renewal date unchanged.
 * interval_change: monthly → yearly — yearly price minus the unused monthly credit; new yearly cycle.
 * renewal: paying the current plan again (step 3; mock only for now).
 */
export type CheckoutKind = "new" | "upgrade_same_interval" | "interval_change" | "renewal";

export interface CheckoutPreview {
  planId: PlanId;
  planName: string;
  interval: BillingInterval;
  kind: CheckoutKind;
  /** The plan the org is on when quoted. */
  fromPlan: { id: PlanId; name: string; interval: BillingInterval } | null;
  planPrice: number;
  /**
   * upgrade_same_interval: the difference for the days left (charge) and the
   * credit for what's already paid. interval_change: credit = unused part of
   * the monthly cycle, charge = what's left to pay.
   */
  proration: { oldPrice: number; newPrice: number; daysLeft: number; daysInPeriod: number; charge: number; credit: number } | null;
  /** False until coupons ship — the UI hides the coupon field. */
  couponsEnabled: boolean;
  coupon: { code: string; description: string } | null;
  /** Why the entered coupon was rejected (shown under the field). */
  couponError: string | null;
  /**
   * Why the org can't move to this plan yet ("allows 1 project, you have 2");
   * Pay is disabled and the server refuses to start the payment.
   */
  usageError?: string | null;
  couponDiscount: number;
  taxable: number;
  /** Buyer's GST state code (or name, from the mock); null when unknown. */
  billingState: string | null;
  gst: GstBreakdown;
  total: number;
  /** When the paid-for period ends. */
  periodEnd: string;
  /** Pre-GST price of each later renewal. */
  recurringPrice: number;
  /** Renewals after this payment that the coupon still covers. */
  couponRenewalsLeft: number;
  paymentMode: PaymentMode;
  paymentModeReason: ManualReason | null;
  /** E.g. the seller's state isn't set (charged IGST) — for admins, not customers. */
  warnings: BillingWarning[];
}

export interface StartCheckoutRequest {
  planId: PlanId;
  interval: BillingInterval;
  couponCode?: string;
  purpose: "purchase" | "renewal";
}

export type StartCheckoutResponse =
  /** Nothing to pay (e.g. a 100% coupon) — the plan is already active. */
  | { status: "activated"; receipt: CheckoutReceipt }
  | {
      status: "payment_required";
      mode: "online";
      checkoutId: string;
      amount: number;
      /** Razorpay order for `openCheckout` (lib/razorpay.ts). null from the mock client. */
      razorpay: {
        keyId: string;
        orderId: string;
        amountPaise: number;
        currency: "INR";
        name: string;
        description: string;
        prefill: { name?: string; email?: string; contact?: string };
      } | null;
    }
  /** Manual mode: an upgrade request for Super Admin approval (an existing pending one is returned, not duplicated). */
  | { status: "pending_approval"; mode: "manual"; checkoutId: string | null; requestId: string };

/** Razorpay Checkout's success payload (sent to the API as razorpay_order_id etc.). */
export interface ConfirmCheckoutRequest {
  checkoutId: string;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}

export type CheckoutStatus = "pending" | "paid" | "failed" | "expired" | "cancelled" | "approved" | "rejected" | "needs_review";

export interface CheckoutReceipt {
  planId: PlanId;
  planName: string;
  interval: BillingInterval;
  amount: number;
  reference: string;
  activeUntil: string;
  couponCode: string | null;
}

/**
 * The plan is applied by the server when the payment is captured (by this
 * call's verify or the webhook). `paid` = already applied; otherwise the UI
 * polls getBillingOverview until the plan changes.
 */
export interface ConfirmCheckoutResponse {
  checkoutId: string;
  checkoutStatus: CheckoutStatus;
  paymentStatus: "created" | "pending" | "captured" | "failed" | "refunded";
  toPlanId: PlanId;
  toInterval: BillingInterval;
}

/** Super Admin: a checkout, e.g. one paid but not applied ("needs review"). */
export interface AdminCheckoutRow {
  id: string;
  organisation: { id: string; name: string };
  fromPlanName: string | null;
  toPlanName: string;
  toInterval: BillingInterval;
  kind: CheckoutKind;
  mode: PaymentMode;
  status: CheckoutStatus;
  total: number;
  paid: number | null;
  razorpayPaymentId: string | null;
  buyerGstin: string | null;
  reviewReason: string | null;
  createdAt: string;
  updatedAt: string;
}

/* -------------------------------------------------------- Plan changes */

export interface CancelPlanRequest {
  reason?: string;
}

export interface ScheduleDowngradeRequest {
  planId: PlanId;
  /** Defaults to the current interval; same plan yearly → monthly is a downgrade too. */
  interval?: BillingInterval;
}

/* ---------------------------------------------------- Choose what stays */

export interface RetentionItem {
  id: string;
  name: string;
  /** Secondary line, e.g. role · email, or location · units. */
  detail: string;
  /** Why the default rule ranks it where it is ("Owner — always stays", "142 leads in the last 30 days"). */
  reason: string;
  defaultPicked: boolean;
  selected: boolean;
  /** Can't be unticked (the owner). */
  locked: boolean;
}

export interface GetRetentionChoicesRequest {
  /** Defaults to the scheduled downgrade target, else the free plan. */
  targetPlanId?: PlanId;
}

export interface RetentionChoices {
  targetPlan: BillingPlan;
  /** When the choice takes effect; null when already on the target plan. */
  appliesOn: string | null;
  isDefault: boolean;
  users: RetentionItem[];
  projects: RetentionItem[];
  landingPages: RetentionItem[];
}

export interface SaveRetentionChoicesRequest {
  targetPlanId: PlanId;
  userIds: string[];
  projectIds: string[];
  landingPageIds: string[];
}

/* ---------------------------------------------------------- Locked states */

export interface AccessStatus {
  planId: PlanId;
  planName: string;
  limits: PlanLimits;
  modules: PlanModules;
  pausedUserIds: string[];
  viewOnlyProjectIds: string[];
  offlineLandingPageIds: string[];
}

/* ----------------------------------------------------- Invoices & payments */

export interface Paged<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface PageRequest {
  page?: number;
  pageSize?: number;
}

export interface Invoice {
  id: string;
  number: string;
  issuedAt: string;
  description: string;
  subtotal: number;
  gst: number;
  total: number;
  status: "paid" | "refunded" | "void";
  /** Signed link to the printable invoice (valid for an hour). */
  pdfUrl: string | null;
  /** The checkout it was issued for — the success page finds "its" invoice by it. null: offline payment / credit note. */
  checkoutId: string | null;
}

export type PaymentStatus = "captured" | "failed" | "refunded" | "offline";

export interface PaymentRecord {
  id: string;
  createdAt: string;
  description: string;
  amount: number;
  method: string;
  status: PaymentStatus;
  failureReason: string | null;
  couponCode: string | null;
  reference: string;
  receiptUrl: string | null;
}

export interface UpdatePaymentMethodRequest {
  kind: "card" | "upi";
}

/* ------------------------------------------------------------------ Admin */

export type CouponKind = "percent" | "fixed";
export type CouponDuration = "first_payment" | "first_n" | "forever";

export interface Coupon {
  code: string;
  description: string;
  kind: CouponKind;
  /** Percent (0–100) or rupees. */
  value: number;
  planIds: PlanId[];
  interval: BillingInterval | "any";
  duration: CouponDuration;
  /** For `first_n`: billing cycles counting the first payment. */
  durationCount: number | null;
  validFrom: string;
  validTo: string | null;
  /** Organisations that may redeem it; null = unlimited. */
  totalUses: number | null;
  oncePerOrg: boolean;
  /** null = open to every organisation. */
  orgIds: string[] | null;
  /** Open coupons only: list it on customers' Billing → Coupons page. Off by default. */
  showToCustomers: boolean;
}

export type CouponStatus = "active" | "scheduled" | "expired" | "used_up";

export interface CouponRow {
  coupon: Coupon;
  uses: number;
  status: CouponStatus;
}

export interface CouponRedemption {
  orgId: string;
  orgName: string;
  at: string;
  planName: string;
  discount: number;
}

export interface CouponDetail extends CouponRow {
  redemptions: CouponRedemption[];
  totalDiscount: number;
}

export interface SaveCouponRequest {
  coupon: Coupon;
  isNew: boolean;
}

export interface OrgOption {
  id: string;
  name: string;
  city: string;
  planName: string;
}

export interface ListSubscriptionsRequest extends PageRequest {
  status?: SubscriptionStatus;
  planId?: PlanId;
  q?: string;
}

export interface SubscriptionRow {
  orgId: string;
  orgName: string;
  city: string;
  state: string;
  plan: BillingPlan;
  interval: BillingInterval;
  status: SubscriptionStatus;
  renewalMode: RenewalMode;
  /** Renewal / grace end / effective date, depending on status. */
  keyDate: string | null;
  users: number;
  couponCode: string | null;
}

export interface SubscriptionList extends Paged<SubscriptionRow> {
  countsByStatus: Record<SubscriptionStatus, number>;
}

export interface TimelineEvent {
  at: string;
  kind: "bought" | "renewed" | "payment_failed" | "grace" | "moved_to_basic" | "coupon" | "plan_change" | "cancel";
  text: string;
}

export interface AdminPaymentRow extends PaymentRecord {
  orgId: string;
  orgName: string;
}

export interface SubscriptionDetail extends SubscriptionRow {
  renewalAmount: number;
  graceDays: number;
  timeline: TimelineEvent[];
  payments: AdminPaymentRow[];
  coupon: CouponRow | null;
}

export interface ExtendGraceRequest {
  orgId: string;
  days: number;
  note?: string;
}

export interface MarkPaidOfflineRequest {
  orgId: string;
  amount: number;
  method: string;
  reference: string;
  receivedOn: string;
}

export interface ApplyCouponRequest {
  orgId: string;
  code: string;
}

export interface AdminCancelRequest {
  orgId: string;
  when: "period_end" | "now";
  note?: string;
}

export interface ListAdminPaymentsRequest extends PageRequest {
  status?: PaymentStatus;
  orgId?: string;
}

export interface AdminPaymentList extends Paged<AdminPaymentRow> {
  totals: { collected: number; refunded: number; failed: number };
}

export interface RefundPaymentRequest {
  paymentId: string;
  reason?: string;
}

export interface RefundPaymentResponse {
  payment: AdminPaymentRow;
  creditNoteNumber: string;
}

export type AfterGraceBehavior = "fall_back_to_basic" | "restrict" | "cancel";

export interface ReminderRule {
  id: "before_renewal" | "payment_day" | "mid_grace" | "day_before_grace_ends";
  enabled: boolean;
}

export interface LifecycleSettings {
  notifyDaysBefore: number;
  graceDays: number;
  afterGrace: AfterGraceBehavior;
  expiryMessage: string;
  reminders: ReminderRule[];
  /** Super Admin switch: online (Razorpay) plan payments. Off = manual approval. */
  onlinePaymentsEnabled: boolean;
  /** Read-only: the effective mode (switch AND usable Razorpay keys) and why it is manual. */
  paymentMode: PaymentMode;
  paymentModeReason: ManualReason | null;
  /** Read-only: what the backend can store yet; the UI disables the rest. */
  supports: { fallBackToBasic: boolean; reminderSchedule: boolean };
  /** E.g. the seller state isn't set (every checkout is IGST), or BILLING_V2 isn't set on the server. */
  warnings: BillingWarning[];
}

/** Super Admin → Settings → Company & tax details (the platform as GST seller). */
export interface CompanyDetails {
  seller: SellerSettings;
  /** Read-only, e.g. the state isn't set so every checkout is IGST. */
  warnings: BillingWarning[];
}

/** "Run lifecycle check now" — what one sweep did. */
export interface LifecycleRunResult {
  ranAt: string;
  scanned: number;
  movedToFreePlan: number;
  scheduledPlanApplied: number;
  newlyPastDue: number;
  newlyExpired: number;
  newlyCancelled: number;
  remindersSent: number;
}

/** available · redeemed (used a once-per-org coupon) · expired · used_up (the limit was reached). */
export type OrgCouponStatus = "available" | "redeemed" | "expired" | "used_up";

/** Org Billing → Coupons: a coupon reserved for this organisation, or an open one listed for customers. */
export interface OrgCoupon {
  code: string;
  description: string;
  kind: CouponKind;
  /** Percent or rupees. */
  value: number;
  plans: { id: PlanId; name: string }[];
  interval: BillingInterval | "any";
  duration: CouponDuration;
  durationCount: number | null;
  validTo: string | null;
  forYourOrg: boolean;
  status: OrgCouponStatus;
  /** When this organisation first used it (ISO), with that payment's invoice. */
  redeemedAt: string | null;
  invoiceUrl: string | null;
  invoiceNumber: string | null;
}
