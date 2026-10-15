# Billing v2 — UI ↔ backend contract

The new billing UI (behind `NEXT_PUBLIC_BILLING_V2=true`) talks to one interface,
`BillingClient` in `frontend/lib/billing/client.ts`. The app uses a **hybrid client**
(`frontend/lib/billing/index.ts`): every function marked `true` in `REAL_FUNCTIONS`
calls the backend through `frontend/lib/billing/http-client.ts`; the rest still run on
`createMockBillingClient` (`frontend/lib/billing/mock/`). Each backend step implements
endpoints, adds them to `http-client.ts` and flips them to `true`. The walkthrough pages
always use the mock. Screens show a "Sample data" tag on sections whose data is still mock
(`client.isReal(fn)`).

All request/response types live in `frontend/lib/billing/types.ts` (mirrored on the backend
in `backend/src/modules/billing/billing.types.ts`); the names below refer to them. The mock
client is the reference behaviour (see `frontend/lib/billing/__tests__/mock-client.test.ts`).

## Implementation status

| Step | Real now | Backend |
|---|---|---|
| 1 | `getBillingOverview`, `listPlans`, `getAccessStatus`, `listAdminPlans`, `saveAdminPlan`, `getLifecycleSettings`, `saveLifecycleSettings` | `backend/src/modules/billing/` |
| 2 | `getBillingProfile`, `saveBillingProfile`, `previewCheckout`, `startCheckout`, `confirmCheckout`, `listAdminCheckouts` | `billing-profile.service.ts`, `billing-checkout.service.ts`, `checkout-quote.ts`, `common/utils/plan-change.util.ts` |
| 3 | Renewals through the same functions: `previewCheckout` / `startCheckout` with `purpose: "renewal"` (no new client function) | `quoteRenewal` in `checkout-quote.ts`, `renewalPeriodEnd` in `plan-change.util.ts` |

Everything else is mock. Coupons are step 5: `CheckoutPreview.couponsEnabled` is `false`, which hides
the coupon field; a sent `couponCode` is ignored. `updatePaymentMethod` stays unimplemented on purpose: renewals are
"pay each time" through the existing Razorpay Orders + Checkout flow (no Razorpay
Subscriptions), and the overview says `autoRenewAvailable: false`, which hides the auto-renew UI.

### Payment mode

`BillingOverview.paymentMode` is `online` only when the Super Admin switch
(`platform_configs.online_payments_enabled`, default **off**) is on **and** Razorpay is usable
(keys in Integrations → Razorpay or the `RAZORPAY_*` env fallback, not turned off). Otherwise
it is `manual` with `paymentModeReason`: `switched_off`, `keys_missing` or `gateway_disabled`
(`BillingModeService`). In manual mode the checkout screen is the same (billing details + price
summary) but its button is "Send upgrade request": `startCheckout` creates a legacy
`PackageChangeRequest` plus a `manual` `BillingCheckout` and returns `pending_approval`. The
Super Admin approves it in the existing Package Requests tab; approval applies the checkout's
period rule (`applyPlanChange`).

### Step 2 notes

- **Billing profile:** `BillingProfile.state` is a 2-digit **GST state code** (`"29"` =
  Karnataka; list in `pricing.ts` `INDIAN_STATES` / backend `gst.ts`), `addressLine1` required,
  `addressLine2` and `gstin` nullable, `country` `"IN"`. A GSTIN must match the format and its
  first two digits must equal `state`. `GET` returns `null` until the first save.
  `startCheckout` without a profile → `billing_profile_required`. Foreign buyers: accepted
  without GSTIN, still taxed as IGST (TODO: export of services).
- **Seller (company tax settings):** `LifecycleSettings.seller` (`SellerSettings`, saved with
  `PUT /admin/billing/lifecycle`; omit it to leave it unchanged). Its `state` decides the split:
  same state as the buyer = CGST 9% + SGST 9%, otherwise IGST 18%. Unset → every checkout is IGST
  and `warnings` has `seller_state_missing` (shown to the Super Admin, not to customers).
- **Kinds** (`CheckoutPreview.kind`): `new` (no active paid plan — full price, new cycle now),
  `upgrade_same_interval` (`proration.charge` = (new − old) × days left ÷ days in cycle; renewal
  date unchanged), `interval_change` (monthly → yearly: yearly price − `proration.credit`, the
  unused part of the monthly cycle; a new yearly cycle starts now). Days in cycle are 30 / 365.
- **Rounding:** the server computes in integer paise with one rule, round half up, for the
  proration and for each tax component on its own; total = taxable + components. The UI never
  computes a real amount — it shows the preview.
- **Refusals** (400 `{ code, message }` → `BillingError.code`): `plan_not_found`, `free_plan`,
  `same_plan` (same plan + interval, even when lapsed), `lower_plan` (only while a paid plan is
  active — that's a downgrade), `yearly_to_monthly`, `billing_profile_required`,
  `request_pending` (online start while a manual request waits), `amount_too_small` (online
  total under ₹1), renewal codes (step 3 notes), and on the old endpoints
  `paid_plan_requires_checkout` / `paid_renewal_requires_checkout`.
- **One open order per org:** starting a new online checkout cancels the org's older pending
  ones (advisory lock). Pending online checkouts expire after 30 minutes (sweeper). Manual mode
  returns the existing pending request instead of creating a second one.
- **`BillingOverview.pendingUpgrade`:** a manual request awaiting approval, or a paid checkout
  in `needs_review`; `null` otherwise. The UI shows a banner and disables a second request.
- **Fulfilment:** the plan is applied on `payment.captured` (from `confirmCheckout`'s verify or
  the webhook, whichever is first; idempotent with a row lock and `fulfilledAt`). If the price
  changed since the quote, the amount doesn't match, or the org no longer fits the plan, the
  checkout becomes `needs_review` and Super Admins get a notification — nothing is applied
  automatically. `GET /admin/billing/checkouts` lists them (Package Requests tab, flag on).
- **Loophole:** `PATCH /org/billing/plan` now refuses paid targets (`paid_plan_requires_checkout`).

### Step 3 notes — renewals ("pay each time")

- **Request:** `PreviewCheckoutRequest` / `StartCheckoutRequest` with `purpose: "renewal"`;
  `planId` + `interval` must be the current ones (else `renewal_plan_mismatch` — changing plan
  is a purchase or, later, a downgrade). `CheckoutPreview.kind` is `"renewal"`.
- **Price:** today's full price of the current plan + interval (a price change applies from the
  next renewal), GST as usual, no proration. The plan comes from the subscription, so an
  archived plan can still be renewed. `BillingOverview.renewalAmount` uses the same paise maths,
  so "Pay now · ₹X" equals the charge.
- **When:** from `notifyDays` before `renewsAt` (when the reminder fires), through grace, and
  after expiry; earlier → `renewal_not_due`. Free plan / no subscription → `nothing_to_renew`.
- **New term** (`renewalPeriodEnd`, shared by quote and fulfilment): while the term or its grace
  is running (active / trial / past_due) it continues from `renewsAt` — paying early loses no
  days, paying in grace covers the days used; once expired it starts on the payment day. Status
  goes back to `active`, grace cleared.
- **Online only:** manual mode answers `renewal_manual` — our team renews it with the existing
  Subscriptions → Renew action. A pending upgrade request doesn't block a renewal.
- **Applied once:** the checkout stores `fromRenewsAt` (the subscription's `renewsAt` when
  quoted); fulfilment applies only while it still matches, so a second paid renewal (an old tab,
  or a Super Admin renewal meanwhile) goes to `needs_review` instead of extending twice. Usage
  isn't re-checked (it's the plan the org already has). Audit `subscription_renewed`;
  notification "Plan Renewed".
- **UI:** "Pay now" (banners, overview, 3-day popup) is live in online mode. With saved billing
  details it opens Razorpay straight away; without, it opens the renewal checkout
  (`/org/settings/billing/checkout?plan=…&interval=…&renew=1`), which collects them. After
  payment the UI waits for a new `periodEnd` (`waitForPlan` with `isApplied`).
- **Loophole closed:** `POST /org/billing/renew` refuses paid plans
  (`paid_renewal_requires_checkout`); a free plan still renews there. With the flag off, the
  legacy Settings → Billing "Renew now" button now shows that message for paid plans.

### Step 1 notes

- **Unlimited:** `PlanLimits`, `UsageItem.limit` and `PlanModules.metaPages` are `number | null`;
  `null` means unlimited (real plans use it).
- **`expired` status:** today's lifecycle "restrict" policy leaves the org on its paid plan with
  publishing paused; that is `status: "expired"` until "fall back to Basic" exists.
- **Plan modules:** team chat and Meta lead ads aren't in the capability catalog, so v2 stores
  them as reserved keys — `Plan.capabilities.teamChat` / `.metaLeadAds` and
  `Plan.limits.metaPages`. Missing = on / unlimited (neither is plan-gated today).
  `modules.whatsapp` reads the existing `whatsappIntegration` capability and isn't editable here.
  The legacy plan editor's save keeps these keys.
- **Plan rank:** free plan first, then by monthly price. `isFree` = the system (Basic) plan or
  a ₹0 plan. Only active plans are listed.
- **Periods:** the existing subscription code sets `renewsAt` = start + 30 / 365 days, so
  `daysInPeriod` is 30 or 365. Dates are the UTC calendar date.
- **Owner:** the org's earliest-created user (the person who signed up).
- **Lifecycle:** `supports.fallBackToBasic` and `supports.reminderSchedule` are `false`, so the
  UI disables those controls; saving `afterGrace: "fall_back_to_basic"` returns 400, and the
  `reminders` array is accepted but not stored. Read-only fields (`paymentMode`,
  `paymentModeReason`, `supports`, and a plan's `id` / `rank`) may be sent back and are ignored.
- **Access:** `getAccessStatus` returns the real plan's limits and modules; nothing is paused yet,
  so the id lists are empty.

## Conventions

- **Money:** rupees as numbers with up to 2 decimals (plan prices are whole rupees).
  The DB stores payments in integer paise (handoff §4.13) — convert at the API boundary.
- **Dates:** `YYYY-MM-DD`; payment `createdAt` may be a full ISO datetime.
- **Errors:** respond 4xx with `{ message }` (plus `code` where the UI branches); the client
  rejects with `BillingError(message, code)`, which the UI shows as-is — write messages for
  customers.
- **Pricing rules** (proration, GST split, coupon validation, default picks) must match the
  pure helpers in `frontend/lib/billing/pricing.ts` and `default-picks.ts`, which are unit-tested:
  - proration charge = (new − old) × days left ÷ days in period, never below 0
  - GST 18%: CGST 9% + SGST 9% when the billing state equals the seller's state (a Super Admin
    setting; the mock uses Karnataka, `29`), else IGST 18%
  - coupon is taken off before GST; the order of coupon checks decides which reason is shown
  - default picks: owner, then admins, then most recent login; projects by last update;
    landing pages by leads in the last 30 days
- **Permissions:** org calls need `billing:view` (reads) / `billing:edit` (writes). Admin calls
  need `admin_subscriptions` view/edit, except `/admin/billing/lifecycle`, which is
  `admin_settings` (it sits on the Settings page). Both prefixes are in
  `PLATFORM_ROUTE_MODULES` (handoff §4.8 — unmapped admin paths are open to any platform role;
  the more specific prefix is listed first).

## Organisation

| Method | Endpoint | Request | Response |
|---|---|---|---|
| `getBillingOverview()` | `GET /org/billing/v2` | — | `BillingOverview` |
| `listPlans()` | `GET /org/billing/plans` | — | `BillingPlan[]` (sorted by `rank`) |
| `previewCheckout(req)` | `POST /org/billing/checkout/preview` (`billing:view`) | `PreviewCheckoutRequest` (`billingState` = the unsaved form's state code; `purpose: "renewal"` for a renewal) | `CheckoutPreview` (an invalid coupon is **not** an error: return `couponError`) |
| `getBillingProfile()` | `GET /org/billing/profile` | — | `BillingProfile \| null` |
| `saveBillingProfile(p)` | `PUT /org/billing/profile` | `BillingProfile` | `BillingProfile` |
| `startCheckout(req)` | `POST /org/billing/checkout` (`billing:edit`) | `StartCheckoutRequest` | `StartCheckoutResponse` — online: `payment_required` with a Razorpay order (`keyId`, `orderId`, `amountPaise`, `name`, `description`, `prefill`); manual: `pending_approval` with `requestId`; `activated` when the total is ₹0 (coupons, later) |
| `confirmCheckout(req)` | `POST /org/billing/checkout/confirm` | body is Razorpay's success payload: `razorpay_order_id`, `razorpay_payment_id`, `razorpay_signature` (the HTTP client maps `ConfirmCheckoutRequest`) | `ConfirmCheckoutResponse` `{ checkoutId, checkoutStatus, paymentStatus, toPlanId, toInterval }` — the signature is verified server-side; `checkoutStatus: "paid"` once the plan is applied |
| `updatePaymentMethod(req)` | `POST /org/billing/payment-method` | `UpdatePaymentMethodRequest` | `PaymentMethodSummary` |
| `cancelPlan(req)` | `POST /org/billing/cancel` | `CancelPlanRequest` | `BillingOverview` |
| `undoCancel()` | `DELETE /org/billing/cancel` | — | `BillingOverview` |
| `scheduleDowngrade(req)` | `POST /org/billing/downgrade` | `ScheduleDowngradeRequest` | `BillingOverview` |
| `undoDowngrade()` | `DELETE /org/billing/downgrade` | — | `BillingOverview` |
| `getRetentionChoices(req)` | `GET /org/billing/retention?targetPlanId=` | `GetRetentionChoicesRequest` | `RetentionChoices` |
| `saveRetentionChoices(req)` | `PUT /org/billing/retention` | `SaveRetentionChoicesRequest` | `RetentionChoices` (reject over-limit picks or a missing owner) |
| `getAccessStatus()` | `GET /org/billing/access` | — | `AccessStatus` (paused users, view-only projects, offline landing pages, limits, modules) |
| `listInvoices(req)` | `GET /org/billing/invoices?page=&pageSize=` | `PageRequest` | `Paged<Invoice>` (`pdfUrl` = signed URL) |
| `listPayments(req)` | `GET /org/billing/payments?page=&pageSize=` | `PageRequest` | `Paged<PaymentRecord>` |

**Login refusal for a paused user** (not part of `BillingClient`): `POST /auth/login` returns
403 with `{ code: "account_paused", orgName, ownerName, planName, planUserLimit }`. The login
page shows the paused message (`frontend/lib/billing/paused.ts`).

## Super Admin

| Method | Endpoint | Request | Response |
|---|---|---|---|
| `listAdminPlans()` | `GET /admin/billing/plans` | — | `BillingPlan[]` |
| `saveAdminPlan(plan)` | `PUT /admin/billing/plans/:id` | `BillingPlan` | `BillingPlan` |
| `listCoupons()` | `GET /admin/billing/coupons` | — | `CouponRow[]` |
| `getCoupon(code)` | `GET /admin/billing/coupons/:code` | — | `CouponDetail` |
| `saveCoupon(req)` | `POST /admin/billing/coupons` (new) · `PUT /admin/billing/coupons/:code` | `SaveCouponRequest` | `CouponRow` |
| `listOrgOptions()` | `GET /admin/billing/org-options` | — | `OrgOption[]` |
| `listSubscriptions(req)` | `GET /admin/billing/subscriptions` | `ListSubscriptionsRequest` | `SubscriptionList` (includes `countsByStatus` over all orgs) |
| `getSubscription(orgId)` | `GET /admin/billing/subscriptions/:orgId` | — | `SubscriptionDetail` |
| `extendGrace(req)` | `POST /admin/billing/subscriptions/:orgId/extend-grace` | `ExtendGraceRequest` | `SubscriptionDetail` |
| `markPaidOffline(req)` | `POST /admin/billing/subscriptions/:orgId/offline-payment` | `MarkPaidOfflineRequest` | `SubscriptionDetail` |
| `applyCoupon(req)` | `POST /admin/billing/subscriptions/:orgId/coupon` | `ApplyCouponRequest` | `SubscriptionDetail` |
| `cancelSubscription(req)` | `POST /admin/billing/subscriptions/:orgId/cancel` | `AdminCancelRequest` | `SubscriptionDetail` |
| `listAdminPayments(req)` | `GET /admin/billing/payments` | `ListAdminPaymentsRequest` | `AdminPaymentList` |
| `refundPayment(req)` | `POST /admin/billing/payments/:id/refund` | `RefundPaymentRequest` | `RefundPaymentResponse` (full amount only; issue a credit note) |
| `getLifecycleSettings()` | `GET /admin/billing/lifecycle` | — | `LifecycleSettings` (incl. `seller`, `warnings`) |
| `saveLifecycleSettings(s)` | `PUT /admin/billing/lifecycle` | `LifecycleSettings` | `LifecycleSettings` |
| `listAdminCheckouts(status?)` | `GET /admin/billing/checkouts?status=` | `CheckoutStatus` (default `needs_review`) | `AdminCheckoutRow[]` (latest 100) |

The legacy `GET /admin/package-change-requests` rows now include `billingCheckout` (amounts in
paise, buyer GSTIN/state) when the request came from a manual-mode checkout.

## Payment wiring

`components/billing/payment.tsx` → `usePayment().start()`:
1. `startCheckout` → `activated`: done (₹0). `pending_approval` (manual): `onRequested` — the
   checkout screen toasts "Request sent" and goes back to Billing.
2. `razorpay` set: `openCheckout` from `frontend/lib/razorpay.ts` with that order and
   `verifyPath: "/org/billing/checkout/confirm"`. On success the UI polls `getBillingOverview`
   (every 1.5 s, up to 30 s — `waitForPlan`) until it shows `toPlanId` / `toInterval`, then opens
   the success page; on timeout or `needs_review` the success page says we're finishing setup
   (`?finishing=1`). Closing the popup = "Payment cancelled" toast; a failure → failure page.
3. `razorpay` null (mock client only): a clearly labelled simulated popup stands in.

The order is created through the existing payments module (`PaymentsService.createOrder`,
purpose `plan_purchase`, reference `billing_checkout`); the plan is applied from its
`payment.captured` event (handoff §4.13). For local online testing: switch on in
Settings → Subscription Expiry, `rzp_test_…` keys in Integrations → Razorpay, and a tunnel
(e.g. `ngrok http 4000`) with the Razorpay webhook pointed at `<tunnel>/webhooks/razorpay`
(verify alone also applies the plan, so the webhook is a backup). Renewals use the same path
(`purpose: "renewal"`, order description "<plan> plan renewal (<interval>)").

## Where the UI lives

| Screen | Location | Component |
|---|---|---|
| Billing overview | Settings → Billing (`/org/settings?section=billing`) | `components/billing/overview.tsx` |
| Plans · checkout · success · failure · downgrade · cancel · invoices · choose what stays | `/org/settings/billing/...` | `components/billing/{plans,checkout,checkout-result,plan-changes,invoices,choose-what-stays}.tsx` |
| Banners + renewal popup | org shell (`components/org/shell.tsx` → `BillingV2Root`) | `components/billing/banners.tsx` |
| Locked states | login, project detail, landing pages list, team chat composer, Users "Create user" | `components/billing/locked.tsx` |
| Admin plans | `/admin-console/subscriptions` → "Plans & Pricing Matrices" tab (the existing page keeps all its tabs; with the flag on only this tab and "Expiry & Grace Policy" are swapped) | `components/billing/admin/plans-editor.tsx` |
| Admin subscriptions · payments (not real yet) | Will replace the existing "Organisation Subscriptions" and "Payments & Invoicing" tabs when real; org detail at `/admin-console/subscriptions/org/:orgId` | `components/billing/admin/{subscriptions,payments}.tsx` |
| Admin coupons | `/admin-console/coupons` (+ `new`, `:code`, `:code/edit`) | `components/billing/admin/coupons.tsx` |
| Admin lifecycle + company tax details | `/admin-console/settings` and the Subscriptions "Expiry & Grace Policy" tab | `components/billing/admin/lifecycle.tsx` |
| Admin "Paid — needs review" + checkout amounts on requests | `/admin-console/subscriptions` → Package Requests tab (flag on) | `components/billing/admin/checkouts-review.tsx` |
| Walkthroughs (always on, not in nav) | `/org/billing-walkthrough`, `/org/billing-walkthrough/banners`, `/admin-console/billing-walkthrough` | `components/billing/walkthrough/*` |

With the flag off, every edited page renders exactly what it did before, and the new
`/org/settings/billing/*`, `/admin-console/coupons*` and `/admin-console/subscriptions/org/*`
routes return 404.
