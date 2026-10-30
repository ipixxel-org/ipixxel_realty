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
  /** The single free plan orgs fall back to (Basic) — the system plan, not any ₹0 plan. */
  isFree: boolean;
  /** false = not offered to organisations (Super Admin still sees it). Missing = offered. */
  isActive?: boolean;
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
/**
 * Why payments are manual: Super Admin switch off, no usable Razorpay keys, or
 * Razorpay saved as off (only by the old "Enable Razorpay payments" checkbox,
 * since removed — saving the Razorpay form turns it back on).
 */
export type ManualReason = "switched_off" | "keys_missing" | "gateway_disabled";

export interface PaymentMethodSummary {
  kind: "card" | "upi";
  label: string;
  detail: string;
}

/** Invoice fields that must be filled in before checkout. */
export type BillingDetailsField = "legalName" | "addressLine1" | "city" | "state" | "pincode";

/**
 * The org as invoice buyer. Read-only in billing: it is the organisation
 * profile (Settings → General), with "" for anything not filled in.
 */
export interface BillingProfile {
  /** The organisation name — printed as the name on GST invoices. */
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

export interface UsageConflict {
  items: { key: "users" | "projects" | "landingPages" | "templates"; limit: number; used: number }[];
  choicesFit: boolean;
}

/** One limit the org was over on the requested plan: what stays, what is paused. */
export interface WhatStaysGroup {
  limit: number;
  total: number;
  kept: { id: string; name: string }[];
  paused: { id: string; name: string }[];
}

/** A copy of "choose what stays", kept on the request. Only the limits the org was over appear. */
export interface WhatStays {
  planId: PlanId;
  planName: string;
  /** Their saved choice, or our default picks. */
  choice: "saved" | "default";
  /** true once approved: what was actually kept. */
  applied: boolean;
  users?: WhatStaysGroup;
  projects?: WhatStaysGroup;
  landingPages?: WhatStaysGroup;
  templates?: WhatStaysGroup;
}

/** One plan change request on Settings → Billing → Requests (newest first). */
/** A scheduled change (no approval): scheduled → done / undone ("Keep <plan>") / replaced. */
export type ScheduledChangeStatus = "scheduled" | "done" | "undone" | "replaced";

/** Statuses only an online payment row has (online step 3); approved = paid; closed = failed / expired / replaced. */
export type OnlineRowStatus = "awaiting_payment" | "needs_review" | "closed";

/** What an online payment row shows about its payment. */
export interface OnlinePaymentView {
  /**
   * waiting (order open) · paid · failed · expired (not paid in 30 min) · superseded (a newer checkout,
   * or a downgrade / move to Basic, closed it) · needs_review (paid, not applied) · refunded ·
   * resolved (our team closed the review by hand).
   */
  state: "waiting" | "paid" | "failed" | "expired" | "superseded" | "needs_review" | "refunded" | "resolved";
  paidAt: string | null;
  /** Razorpay order ID (order_…). */
  orderId: string | null;
  /** The GST invoice once paid (signed printable document). */
  invoice: { id: string; number: string; url: string } | null;
  /** Super Admin only: why it needs review. */
  reviewReason?: string | null;
}

export interface OrgPlanRequest {
  id: string;
  /**
   * request = sent to our team for approval (manual mode); scheduled_change =
   * a move to Basic / a smaller plan at the end of the term, recorded here
   * (both modes, no approval, never pending). Missing = request.
   */
  kind?: "request" | "scheduled_change" | "online_payment";
  requestedAt: string;
  requestedBy: string | null;
  fromPlan: { id: PlanId; name: string } | null;
  toPlan: { id: PlanId; name: string };
  interval: BillingInterval;
  /** Before GST, in rupees. */
  amount: number | null;
  amountNote: "prorated" | "less_monthly_credit" | null;
  /** Online payments: awaiting_payment → approved (paid) / closed (failed, expired, replaced) / needs_review. */
  status: "pending" | "approved" | "rejected" | "withdrawn" | ScheduledChangeStatus | OnlineRowStatus;
  /** Online payments only: the payment's state, Razorpay order ID and invoice. */
  online?: OnlinePaymentView | null;
  /** Requests: when it was decided. Scheduled changes: when it took effect / was undone / replaced. */
  decidedAt: string | null;
  rejectionReason: string | null;
  /** What they chose to keep on the new plan; null when nothing had to be chosen. */
  whatStays: WhatStays | null;
  /**
   * The row's what-stays button: "change" on the latest row while open, "view"
   * on every other row with a record; null = everything fit. Missing (older
   * backend / mock): worked out from the status.
   */
  whatStaysAction?: "change" | "view" | null;
  /** "Renewal of Pro" (same plan) or "Change to Starter". */
  label?: string;
  /** Sent while the renewal was overdue (grace): full price, the missed term continues. */
  overdue?: boolean;
  /** Total incl. GST in rupees; null for older requests. */
  total?: number | null;
  /** The payment our team recorded for it (Mark as paid); null until then. */
  payment?: RequestPayment | null;
  /** The org fell back to Basic while this request was waiting (Option A). */
  movedToBasicAt?: string | null;
  /** How the total is made up; shows a coupon on it. Null for older requests. */
  quote?: RequestQuote | null;
  /** Scheduled changes: when it applies. */
  startsAt?: string | null;
  /** Scheduled changes: the reason they gave (moving to Basic). */
  reason?: string | null;
}

/** A request's price: "₹1,499 − ₹300 coupon (CODE) + GST ₹215.82 = ₹1,414.82" (rupees). */
export interface RequestQuote {
  /** Before the coupon and GST (after any proration credit). */
  price: number;
  couponCode: string | null;
  couponDiscount: number;
  gst: number;
  total: number;
  /** Our team added the coupon on the request (Remove restores the original quote). */
  couponAdded: boolean;
}

/** A payment the Super Admin marked against a request (manual mode). */
export interface RequestPayment {
  id: string;
  /** Rupees received, GST included. */
  amount: number;
  method: string;
  reference: string;
  receivedOn: string;
  note: string | null;
  /** awaiting_approval → received on approval; refund_due when the request was rejected. */
  status: "awaiting_approval" | "received" | "refund_due" | "refunded";
}

/** The org's latest package request, when a Super Admin rejected it — shown with the reason. */
export interface RejectedUpgrade {
  requestId: string;
  toPlan: { id: PlanId; name: string };
  interval: BillingInterval;
  rejectedAt: string | null;
  reason: string | null;
}

/** An upgrade waiting on someone: a request awaiting approval, or a paid checkout under review. */
export interface PendingUpgrade {
  status: "pending_approval" | "needs_review";
  requestId: string | null;
  checkoutId: string | null;
  /** The plan the request was made from (null when not known). */
  fromPlan?: { id: PlanId; name: string } | null;
  toPlan: { id: PlanId; name: string };
  interval: BillingInterval;
  createdAt: string;
  /** "Renewal of Pro" or "Change to Starter". */
  label?: string;
  /** Sent while the renewal was overdue. */
  overdue?: boolean;
  /** Manual mode: our team has recorded the payment; waiting for approval. */
  paid?: boolean;
  /** The org fell back to Basic while waiting. */
  movedToBasicAt?: string | null;
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
  /** Missing from older responses (mock / before templates could be paused). */
  templates?: string[];
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

/** payment_review: a paid online checkout is being checked by our team (renewals still go through). */
export type PlanChangeBlockedReason = "request_pending" | "change_scheduled" | "payment_review";

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
  /** From Settings → General; "" where not filled in. */
  billingProfile: BillingProfile;
  /** Required invoice fields still empty — checkout is blocked until they're filled in General settings. */
  billingDetailsMissing: BillingDetailsField[];
  /** A pending upgrade request, or a paid upgrade under review. */
  pendingUpgrade: PendingUpgrade | null;
  /** Set while the latest package request is a rejected one (null otherwise). */
  rejectedUpgrade: RejectedUpgrade | null;
  /**
   * Why plan changes are blocked right now: 'request_pending' (an approval
   * request waits) or 'change_scheduled' (a change to Basic / a smaller plan
   * is scheduled, until it's undone or takes effect); null when nothing
   * blocks. Read it through planChangeBlock() (lib/billing/requests.ts),
   * which also works out older payloads without it.
   */
  planChangeBlockedReason?: PlanChangeBlockedReason | null;
  /** The same words the API refuses with (tooltip / note). */
  planChangeBlockedMessage?: string | null;
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
  /**
   * Extra grace days our team added (Super Admin "extend grace"); graceEndsAt
   * already includes them. Total grace = graceDays + graceExtraDays. Absent on
   * older payloads = 0.
   */
  graceExtraDays?: number;
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
  locked: { users: number; projects: number; landingPages: number; templates?: number };
  /** Present while a move to a smaller plan is pending or has happened. */
  retention: RetentionSummary | null;
}

/* --------------------------------------------------------------- Checkout */

export interface PreviewCheckoutRequest {
  planId: PlanId;
  interval: BillingInterval;
  couponCode?: string;
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
  /**
   * Manual mode: the target allows fewer users / projects / published pages
   * than the org has. The request can be sent once the org has chosen what
   * stays (`choicesFit`); the rest is paused when it's approved.
   */
  usageConflict?: UsageConflict | null;
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
  /** Over the plan's limits: the option the org picked (see WhatStaysChoice). */
  whatStaysChoice?: WhatStaysChoice;
}

/**
 * "Keep the default picks" or "I'll choose what stays" (needs a saved choice
 * that fits) — picked every time a change is over the target's limits.
 */
export type WhatStaysChoice = "default" | "saved";

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
  /** Over Basic's limits: the option the org picked. */
  whatStaysChoice?: WhatStaysChoice;
}

export interface ScheduleDowngradeRequest {
  planId: PlanId;
  /** Defaults to the current interval; same plan yearly → monthly is a downgrade too. */
  interval?: BillingInterval;
  /** Over the smaller plan's limits: the option the org picked. */
  whatStaysChoice?: WhatStaysChoice;
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
  /** The request / scheduled change it belongs to (its plan is the target). */
  requestId?: string;
}

/** Super Admin: the same, for one organisation (default target: its current plan). */
export interface AdminRetentionRequest extends GetRetentionChoicesRequest {
  orgId: string;
}

export interface RetentionChoices {
  targetPlan: BillingPlan;
  /** When the choice takes effect; null when already on the target plan. */
  appliesOn: string | null;
  isDefault: boolean;
  /** A saved choice exists and fits the plan's limits today. Missing (older API) = trust isDefault. */
  savedFits?: boolean;
  /**
   * The org can only look: the change was decided or took effect (or it's
   * the plan they're on). Super Admin can still change it. Missing = false.
   */
  locked?: boolean;
  /**
   * What the lists are. Missing / "live": today's state (or the planned choice).
   * "history": an older row's copy from when it applied (viewDate).
   * "not_applied": a rejected / withdrawn row's request.
   */
  view?: "live" | "history" | "not_applied";
  viewDate?: string | null;
  users: RetentionItem[];
  projects: RetentionItem[];
  landingPages: RetentionItem[];
  /** Assigned templates; a paused one can't be used for new landing pages. */
  templates?: RetentionItem[];
}

export interface SaveRetentionChoicesRequest {
  targetPlanId: PlanId;
  userIds: string[];
  projectIds: string[];
  landingPageIds: string[];
  templateIds?: string[];
  /** The request / scheduled change it belongs to. */
  requestId?: string;
}

export interface AdminSaveRetentionRequest extends SaveRetentionChoicesRequest {
  orgId: string;
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
  /** Assigned templates that can't be used for new landing pages. */
  pausedTemplateIds?: string[];
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
  /** Razorpay order id; null for an offline payment. */
  orderId: string | null;
  /** Razorpay payment id (pay_…); null until paid, and for offline payments. */
  gatewayPaymentId: string | null;
  /** The GST invoice — the same document Billing → Invoices opens. */
  invoice: InvoiceLink | null;
  /** The credit note, once the payment is refunded. */
  creditNote: InvoiceLink | null;
}

/** An invoice or credit note: its number and its signed printable document (valid for an hour). */
export interface InvoiceLink {
  id: string;
  number: string;
  url: string;
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
  /** Extra grace days a Super Admin gave for the current due date (0 / absent = none; only while in grace). */
  graceExtraDays?: number;
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
  /** No request set the current plan (assigned directly): "Change what stays" sits on the org page. */
  whatStaysOrgLevel?: boolean;
  renewalAmount: number;
  graceDays: number;
  /** The unpaid renewal's due date while in grace; grace ends dueDate + graceDays + graceExtraDays. */
  dueDate?: string | null;
  /** Manual mode hides "Mark paid offline" and "Apply coupon" (the org's request does both). */
  paymentMode?: PaymentMode;
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
  /** Razorpay order id / payment id, or an offline reference (partial match). */
  search?: string;
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
  /**
   * Super Admin switch: online (Razorpay) plan payments. Off = manual approval.
   * Read-only here: it's changed in Integrations → Online payments, and the
   * lifecycle save leaves it out (omitted = unchanged).
   */
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
