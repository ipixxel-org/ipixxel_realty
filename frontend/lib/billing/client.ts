/**
 * The billing data layer. One method per future API call — the backend
 * implementation (an `apiBillingClient` calling `apiFetch`) must return these
 * exact shapes. Until then `mockBillingClient` (./mock/client.ts) implements it.
 * Errors: reject with `BillingError` carrying a user-facing message.
 */
import type {
  AccessStatus,
  AdminCheckoutRow,
  CheckoutStatus,
  AdminCancelRequest,
  AdminPaymentList,
  ApplyCouponRequest,
  BillingOverview,
  BillingPlan,
  BillingProfile,
  CancelPlanRequest,
  CheckoutPreview,
  CompanyDetails,
  ConfirmCheckoutRequest,
  ConfirmCheckoutResponse,
  CouponDetail,
  CouponRow,
  ExtendGraceRequest,
  GetRetentionChoicesRequest,
  Invoice,
  LifecycleRunResult,
  LifecycleSettings,
  ListAdminPaymentsRequest,
  ListSubscriptionsRequest,
  MarkPaidOfflineRequest,
  OrgCoupon,
  OrgOption,
  PageRequest,
  Paged,
  PaymentMethodSummary,
  PaymentRecord,
  PreviewCheckoutRequest,
  RefundPaymentRequest,
  RefundPaymentResponse,
  RetentionChoices,
  SaveCouponRequest,
  SaveRetentionChoicesRequest,
  ScheduleDowngradeRequest,
  StartCheckoutRequest,
  StartCheckoutResponse,
  SubscriptionDetail,
  SubscriptionList,
  UpdatePaymentMethodRequest,
} from "./types";

export class BillingError extends Error {
  /** Machine-readable reason from the API (e.g. "same_plan", "billing_profile_required"). */
  readonly code: string | null;
  constructor(message: string, code: string | null = null) {
    super(message);
    this.name = "BillingError";
    this.code = code;
  }
}

export type BillingFunction = Exclude<keyof BillingClient, "isMock" | "isReal">;

export interface BillingClient {
  /** True when the whole client is the mock (walkthroughs) — the payment step uses the simulated popup. */
  readonly isMock: boolean;
  /** Whether this function returns real backend data (false = sample data from the mock). */
  isReal(fn: BillingFunction): boolean;

  /* ---------------- Organisation (billing:view / billing:edit) ---------------- */
  /** GET /org/billing/v2 */
  getBillingOverview(): Promise<BillingOverview>;
  /** GET /org/billing/plans */
  listPlans(): Promise<BillingPlan[]>;
  /** POST /org/billing/checkout/preview */
  previewCheckout(req: PreviewCheckoutRequest): Promise<CheckoutPreview>;
  /** PUT /org/billing/profile */
  /** GET /org/billing/profile — null until the first purchase saves one. */
  getBillingProfile(): Promise<BillingProfile | null>;
  saveBillingProfile(profile: BillingProfile): Promise<BillingProfile>;
  /** POST /org/billing/checkout — creates the Razorpay order (or activates a ₹0 checkout). */
  startCheckout(req: StartCheckoutRequest): Promise<StartCheckoutResponse>;
  /** POST /org/billing/checkout/confirm — verifies the Razorpay signature server-side. */
  confirmCheckout(req: ConfirmCheckoutRequest): Promise<ConfirmCheckoutResponse>;
  /** POST /org/billing/payment-method — Option A mandate change. */
  updatePaymentMethod(req: UpdatePaymentMethodRequest): Promise<PaymentMethodSummary>;
  /** POST /org/billing/cancel */
  cancelPlan(req: CancelPlanRequest): Promise<BillingOverview>;
  /** DELETE /org/billing/cancel */
  undoCancel(): Promise<BillingOverview>;
  /** POST /org/billing/downgrade */
  scheduleDowngrade(req: ScheduleDowngradeRequest): Promise<BillingOverview>;
  /** DELETE /org/billing/downgrade */
  undoDowngrade(): Promise<BillingOverview>;
  /** GET /org/billing/retention?targetPlanId= */
  getRetentionChoices(req: GetRetentionChoicesRequest): Promise<RetentionChoices>;
  /** PUT /org/billing/retention */
  saveRetentionChoices(req: SaveRetentionChoicesRequest): Promise<RetentionChoices>;
  /** GET /org/billing/access — what's paused / view-only / offline, plus limits and modules. */
  getAccessStatus(): Promise<AccessStatus>;
  /** GET /org/billing/invoices */
  listInvoices(req: PageRequest): Promise<Paged<Invoice>>;
  /** GET /org/billing/payments */
  listPayments(req: PageRequest): Promise<Paged<PaymentRecord>>;
  /** GET /org/billing/coupons — coupons reserved for the org, and open ones listed for customers. */
  listOrgCoupons(): Promise<OrgCoupon[]>;

  /* ---------------- Super Admin (admin_subscriptions) ---------------- */
  /** GET /admin/billing/plans */
  listAdminPlans(): Promise<BillingPlan[]>;
  /** PUT /admin/billing/plans/:id */
  saveAdminPlan(plan: BillingPlan): Promise<BillingPlan>;
  /** GET /admin/billing/coupons */
  listCoupons(): Promise<CouponRow[]>;
  /** GET /admin/billing/coupons/:code */
  getCoupon(code: string): Promise<CouponDetail>;
  /** POST /admin/billing/coupons (isNew) · PUT /admin/billing/coupons/:code */
  saveCoupon(req: SaveCouponRequest): Promise<CouponRow>;
  /** GET /admin/billing/org-options — the coupon form's organisation picker. */
  listOrgOptions(): Promise<OrgOption[]>;
  /** GET /admin/billing/subscriptions */
  listSubscriptions(req: ListSubscriptionsRequest): Promise<SubscriptionList>;
  /** GET /admin/billing/subscriptions/:orgId */
  getSubscription(orgId: string): Promise<SubscriptionDetail>;
  /** POST /admin/billing/subscriptions/:orgId/extend-grace */
  extendGrace(req: ExtendGraceRequest): Promise<SubscriptionDetail>;
  /** POST /admin/billing/subscriptions/:orgId/offline-payment */
  markPaidOffline(req: MarkPaidOfflineRequest): Promise<SubscriptionDetail>;
  /** POST /admin/billing/subscriptions/:orgId/coupon */
  applyCoupon(req: ApplyCouponRequest): Promise<SubscriptionDetail>;
  /** POST /admin/billing/subscriptions/:orgId/cancel */
  cancelSubscription(req: AdminCancelRequest): Promise<SubscriptionDetail>;
  /** GET /admin/billing/payments */
  listAdminPayments(req: ListAdminPaymentsRequest): Promise<AdminPaymentList>;
  /** POST /admin/billing/payments/:id/refund — full amount only; issues a credit note. */
  refundPayment(req: RefundPaymentRequest): Promise<RefundPaymentResponse>;
  /** GET /admin/billing/checkouts?status= — "needs review" by default (paid but not applied). */
  listAdminCheckouts(status?: CheckoutStatus): Promise<AdminCheckoutRow[]>;
  /** GET /admin/billing/lifecycle */
  getLifecycleSettings(): Promise<LifecycleSettings>;
  /** PUT /admin/billing/lifecycle */
  saveLifecycleSettings(settings: LifecycleSettings): Promise<LifecycleSettings>;
  /** POST /admin/billing/lifecycle/run — run the lifecycle check now (super_admin only; audited). */
  runLifecycleCheck(): Promise<LifecycleRunResult>;
  /** GET /admin/billing/company — Settings → Company & tax details. */
  getCompanyDetails(): Promise<CompanyDetails>;
  /** PUT /admin/billing/company */
  saveCompanyDetails(details: CompanyDetails): Promise<CompanyDetails>;
}
