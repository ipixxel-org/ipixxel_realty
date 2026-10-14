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

Everything else is mock. `updatePaymentMethod` stays unimplemented on purpose: renewals are
"pay each time" through the existing Razorpay Orders + Checkout flow (no Razorpay
Subscriptions), and the overview says `autoRenewAvailable: false`, which hides the auto-renew UI.

### Payment mode

`BillingOverview.paymentMode` is `online` only when the Super Admin switch
(`platform_configs.online_payments_enabled`, default **off**) is on **and** Razorpay is usable
(keys in Integrations → Razorpay or the `RAZORPAY_*` env fallback, not turned off). Otherwise
it is `manual` with `paymentModeReason`: `switched_off`, `keys_missing` or `gateway_disabled`
(`BillingModeService`). In manual mode — and until `startCheckout` is real — the UI shows
"Request upgrade" and an approval panel instead of payment.

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
- **Errors:** respond 4xx with `{ message }`; the client rejects with `BillingError(message)`,
  which the UI shows as-is — write messages for customers.
- **Pricing rules** (proration, GST split, coupon validation, default picks) must match the
  pure helpers in `frontend/lib/billing/pricing.ts` and `default-picks.ts`, which are unit-tested:
  - proration charge = (new − old) × days left ÷ days in period, never below 0
  - GST 18%: CGST 9% + SGST 9% when the billing state is Karnataka, else IGST 18%
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
| `previewCheckout(req)` | `POST /org/billing/checkout/preview` | `PreviewCheckoutRequest` | `CheckoutPreview` (an invalid coupon is **not** an error: return `couponError`) |
| `saveBillingProfile(p)` | `PUT /org/billing/profile` | `BillingProfile` | `BillingProfile` |
| `startCheckout(req)` | `POST /org/billing/checkout` | `StartCheckoutRequest` | `StartCheckoutResponse` — `activated` when the total is ₹0, else `payment_required` with a Razorpay order |
| `confirmCheckout(req)` | `POST /org/billing/checkout/confirm` | `ConfirmCheckoutRequest` | `ConfirmCheckoutResponse` — verify the signature server-side, activate, issue the invoice |
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
| `getLifecycleSettings()` | `GET /admin/billing/lifecycle` | — | `LifecycleSettings` |
| `saveLifecycleSettings(s)` | `PUT /admin/billing/lifecycle` | `LifecycleSettings` | `LifecycleSettings` |

## Payment wiring

`components/billing/payment.tsx` → `usePayment().start()`:
1. `startCheckout` → if `activated`, done (₹0 / 100% coupon).
2. If `razorpay` is set: call `openCheckout` from `frontend/lib/razorpay.ts` with that order
   (the marked TODO in `usePayment`), then `confirmCheckout` with the Razorpay ids + signature.
3. If `razorpay` is null (mock only): a clearly labelled simulated popup stands in.

The existing payments module (`backend/src/modules/payments`) should create the order with a new
`PaymentPurpose` (e.g. `plan_purchase`) and activate the subscription from its
`payment.captured` event (handoff §4.13). Close the free `PATCH /org/billing/plan` and
`POST /org/billing/renew` paths (handoff §4.2) before turning the flag on in production.

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
| Admin lifecycle | `/admin-console/settings` | `components/billing/admin/lifecycle.tsx` |
| Walkthroughs (always on, not in nav) | `/org/billing-walkthrough`, `/org/billing-walkthrough/banners`, `/admin-console/billing-walkthrough` | `components/billing/walkthrough/*` |

With the flag off, every edited page renders exactly what it did before, and the new
`/org/settings/billing/*`, `/admin-console/coupons*` and `/admin-console/subscriptions/org/*`
routes return 404.
