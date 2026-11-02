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
| 2 | `previewCheckout`, `startCheckout`, `confirmCheckout`, `listAdminCheckouts` (`getBillingProfile` / `saveBillingProfile` removed — see "Billing details from the org profile") | `billing-checkout.service.ts`, `checkout-quote.ts`, `common/utils/plan-change.util.ts` |
| 3 | Renewals through the same functions: `previewCheckout` / `startCheckout` with `purpose: "renewal"` (no new client function) | `quoteRenewal` in `checkout-quote.ts`, `renewalPeriodEnd` in `plan-change.util.ts` |
| 4 | `cancelPlan`, `undoCancel`, `scheduleDowngrade`, `undoDowngrade` | `billing-plan-change.service.ts`; applied by the lifecycle sweep (`subscription-lifecycle.util.ts`) |
| 5 | `listCoupons`, `getCoupon`, `saveCoupon`, `listOrgOptions`; coupons in `previewCheckout` / `startCheckout` | `coupon-rules.ts`, `coupon-settlement.ts`, `admin-coupons.service.ts` |
| 6 | `getRetentionChoices`, `saveRetentionChoices`; pausing behind `getAccessStatus` / the overview | `common/utils/retention.util.ts`, `billing-retention.service.ts`, `common/guards/project-editable.guard.ts` |
| 7 | `listInvoices`, `listPayments`, `listSubscriptions`, `getSubscription`, `extendGrace`, `markPaidOffline`, `applyCoupon`, `cancelSubscription`, `listAdminPayments`, `refundPayment` | `invoice.util.ts`, `billing-ledger.service.ts`, `admin-subscriptions.service.ts`, `invoice-document.controller.ts`; `PaymentsService.refundInFull` |
| Fixes after testing | `listOrgCoupons`, `getCompanyDetails`, `saveCompanyDetails`, `runLifecycleCheck`; `BillingOverview.renewalBreakdown`, `Invoice.checkoutId`, `Coupon.showToCustomers`; reminders stored | `subscription-lifecycle.util.ts` (grace rule, reminders), `common/utils/billing-clock.util.ts`, `admin-billing.service.ts`, `admin-coupons.service.ts` (`orgCoupons`); migration `20261015114705_billing_v2_fixes` |
| Billing details from the org profile | `BillingOverview.billingProfile` (always set) + `billingDetailsMissing`; GSTIN and the state dropdown in Settings → General (invoice name = organisation name); `saveBillingProfile` / `getBillingProfile` and `PreviewCheckoutRequest.billingState` removed | `billing/org-billing-details.ts`, `common/utils/org-profile-audit.util.ts` (save check); frontend `components/ui/state-select.tsx`, `lib/billing/details.ts`; migration `20261022090000_org_profile_billing_details` |
| Manual-mode requests | `listOrgRequests`, `withdrawRequest`; `CheckoutPreview.usageConflict`; `PendingUpgrade.fromPlan`; `BillingOverview.rejectedUpgrade`; approval applies "choose what stays" | `billing-ledger.service.ts` (`listRequests`), `checkout-state.ts`, `common/utils/plan-quota.util.ts` (`usageOverLimits`, `assertPlanFitsAfterRetention`), `package-change-requests.service.ts` (`pendingRequestMessage`, required rejection reason); frontend `components/billing/requests.tsx`, `lib/billing/requests.ts` |
| Manual mode: Mark as paid → Approve | Request renewal (`startCheckout` `purpose: "renewal"` in manual mode), overdue changes at full price, `OrgPlanRequest.label` / `overdue` / `total` / `payment` / `movedToBasicAt`, `PendingUpgrade.label` / `paid`; Super Admin `PUT` / `DELETE /admin/package-change-requests/:id/payment` | `checkout-quote.ts` (`quoteOverdueChange`), `package-change-requests.service.ts` (`markPaid`, approve / reject), `plan-change.util.ts` (`periodStart`), `moveToFreePlan` (Option A marker); frontend `components/billing/admin/mark-paid-dialog.tsx`; migration `20261024090000_manual_request_payments` |
| Scheduled changes on the Requests list | Every scheduled change (to Basic via cancel-at-period-end, or a smaller plan / yearly → monthly via `scheduleDowngrade`) is a row in `listOrgRequests` and the Super Admin package request lists: `OrgPlanRequest.kind` `scheduled_change`, statuses `scheduled` / `done` / `undone` / `replaced`, `startsAt`, `reason`; no approval, never pending | `common/utils/scheduled-change.util.ts` (`recordScheduledChange`, `closeScheduledChange`), `billing-plan-change.service.ts`, `applyPlanChange`, `moveToFreePlan` / `applyScheduledPlan` (sweep), `billing-ledger.service.ts`; frontend `components/billing/requests.tsx` (Keep <plan>), `components/billing/admin/package-requests.tsx` (read-only); migration `20261026090000_scheduled_plan_changes` |
| Scheduled change blocks plan changes | `change_scheduled` refusal (checkout start, legacy request, `scheduleDowngrade`, `cancelPlan`); `BillingOverview.planChangeBlockedReason` / `planChangeBlockedMessage` | `common/utils/scheduled-change.util.ts` (`scheduledChangeBlock`), `billing-checkout.service.ts`, `billing-plan-change.service.ts`, `package-change-requests.service.ts`, `billing-overview.ts` (`planChangeBlock`); frontend `lib/billing/requests.ts` (`planChangeBlock`), `components/billing/banners.tsx` (`ScheduledChangeNote`), `plans.tsx`, `checkout.tsx`, `plan-changes.tsx` |
| Manual mode: coupon on the request | Super Admin `PUT` / `DELETE /admin/package-change-requests/:id/coupon`; Mark as paid amount = the request total; `OrgPlanRequest.quote` / admin row `quote`; `SubscriptionDetail.paymentMode`; org-level offline payment / apply coupon refused in manual mode (`use_request`) | `package-change-requests.service.ts` (`applyCoupon` / `removeCoupon`), `request-coupon.ts`, `coupon-lookup.ts` (`findCouponFor`, shared with checkout), `coupon-settlement.ts`; migration `20261025090000_request_coupon` |
| Online steps 1–4 (2026-10-29) | Grace rules, "choose what stays" at the checkout, online payments as rows, `payment_review` block, superseded checkouts, `resolveAdminCheckout`; `OrgPlanRequest.kind` `online_payment` / `online`, `CheckoutPreview.usageConflict` in both modes | `checkout-quote.ts`, `billing-checkout.service.ts` (`whatStaysProblem`, `adminResolve`), `billing-plan-change.service.ts`, `billing/online-rows.ts`, `billing-overview.ts`; frontend `lib/billing/direction.ts` (`isOverdue`), `lib/billing/requests.ts`, `components/billing/requests.tsx`, `admin/package-requests.tsx`, `admin/checkouts-review.tsx`; migrations `20261029090000_checkout_what_stays_choice`, `20261029100000_online_payment_rows` |
| Plan versions (2026-10-30) | `previewAdminPlanSave`; `BillingPlan.version` / `versions` (admin list); `BillingOverview.planVersion` / `nextVersion`; `SubscriptionRow.planVersion` / `latestVersion` / `versionAppliesOn`; `CheckoutPreview` unchanged | `common/utils/plan-version.util.ts`, `common/utils/plan-version-change.util.ts`, `applyPlanVersionChanges` (sweep), `applyPlanChange` (`planVersionId`), `admin-billing.service.ts` (`previewPlanSave`); frontend `lib/billing/versions.ts`, `components/billing/{banners,overview}.tsx`, `admin/{plans-editor,subscriptions}.tsx`; migration `20261030090000_plan_versions` |
| Fixes after testing (2) | one `plan_locked` error; list filters `viewOnly` / `offline` / `paused` / `needsReassign`; invoice email; `packagePriceText` | `common/utils/plan-lock.util.ts`, `billing-invoice-mailer.service.ts`, `lead-assignee.util.ts`; frontend `lib/plan-lock.ts`, `PlanLockBadge` (`components/billing/locked.tsx`); migration `20261016093000_billing_invoice_email` |

Every function is real except `updatePaymentMethod`, which stays unimplemented on purpose: renewals are
"pay each time" through the existing Razorpay Orders + Checkout flow (no Razorpay
Subscriptions), and the overview says `autoRenewAvailable: false`, which hides the auto-renew UI.

### Payment mode

`BillingOverview.paymentMode` is `online` only when the Super Admin switch
(`platform_configs.online_payments_enabled`, default **off**) is on **and** Razorpay is usable
(keys in Integrations → Razorpay or the `RAZORPAY_*` env fallback, not turned off). Otherwise
it is `manual` with `paymentModeReason`: `switched_off`, `keys_missing` or `gateway_disabled`
(`BillingModeService`). Confirmed after testing — no behaviour change. When the switch is on but
Razorpay can't be used, the settings card shows a warning saying why it is running in manual mode
(no keys, or Razorpay turned off), with a link to Integrations → Razorpay. In manual mode the checkout screen is the same (billing details summary + price
summary) but its button is "Send upgrade request": `startCheckout` creates a legacy
`PackageChangeRequest` plus a `manual` `BillingCheckout` and returns `pending_approval`. The
Super Admin approves it in the existing Package Requests tab; approval applies the checkout's
period rule (`applyPlanChange`).

### Removing the flag (TODO, final step)

`NEXT_PUBLIC_BILLING_V2` (frontend) and `BILLING_V2` (backend) stay until then. To finish:

- [ ] Remove `NEXT_PUBLIC_BILLING_V2` / `BILLING_V2` and `frontend/lib/billing/flag.ts`; make
      `isBillingV2Server()` always true (grace always ends in fall back to Basic).
- [ ] Make the v2 screens the only billing screens: Settings → Billing, the Subscriptions page tabs
      (Plans & Pricing, Organisation Subscriptions, Payments & Invoicing, Expiry & Grace Policy, Package
      Requests extras), Super Admin Settings, the plan edit route.
- [ ] Delete the old billing UI paths: `components/superadmin/billing-expiry-settings.tsx`, the
      flag-off branches in `app/admin-console/subscriptions/page.tsx`, `plan-form.tsx` and
      `plans/[id]/edit` (legacy form), the legacy Settings → Billing section in `app/org/settings`,
      and the legacy `GET /org/billing`, `/org/billing/invoices`, `PATCH /org/billing/plan`,
      `POST /org/billing/renew` once nothing calls them.
- [ ] Drop the stored legacy `billing_expiry_behavior` (restrict / cancel) and the
      `notFound()` flag checks on the `/org/settings/billing/*` and `/admin-console/coupons*` routes.
- [ ] Remove the mock-only "Sample data" plumbing (`REAL_FUNCTIONS`) except for the walkthroughs.

### Fixes after testing

- **Grace is measured from the due date.** Grace ends at `renewsAt + graceDays +
  graceExtensionDays` (`graceEndFor`), worked out again on every lifecycle pass: an edited
  `renews_at` or a changed grace setting applies on the next check or page load, and
  `grace_ends_at` is kept in step (a NULL — e.g. a status set by hand — is filled in). The term
  ending and grace ending are handled in the same pass, so renewsAt 13 Oct + 1-day grace, checked on
  15 Oct, is already on Basic. "Extend grace" now adds to `subscriptions.grace_extension_days`
  (reset on renewal), so the extension survives the re-derivation.
- **When grace ends:** v2 offers only "Fall back to Basic". With `BILLING_V2=true` on the
  server, the sweep falls back to Basic whatever is stored; `GET /admin/billing/lifecycle` returns
  `afterGrace: "fall_back_to_basic"`, and `PUT` no longer writes the stored legacy value, so the
  flag-off screens and behaviour are unchanged. Without the server flag the response has a
  `billing_v2_server_off` warning. A subscription already left `expired` by the old "restrict"
  rule (before the flag was on) is moved to Basic on the next check too.
- **Reminders** (`LifecycleSettings.reminders`, now stored in `platform_configs.billing_reminders`;
  `supports.reminderSchedule: true`): in-app notifications to the org's admins, once per due date
  (the date is in the title): `before_renewal` (from `notifyDaysBefore` days before),
  `payment_day` (term ended unpaid), `mid_grace` (half-way, only with 3+ days of grace),
  `day_before_grace_ends` (last day). A switched-off reminder isn't sent; the state changes still
  happen. Not emailed.
- **Run lifecycle check now:** `POST /admin/billing/lifecycle/run` → `LifecycleRunResult`.
  `super_admin` role only (403 for other platform roles), writes a `billing_lifecycle_run` audit
  log.
- **Billing clock:** `BILLING_CLOCK_OVERRIDE` (`+10d`, `-36h`, `2026-11-20`), ignored when
  `NODE_ENV=production`, moves the lifecycle check, the overview, quotes and period dates
  (`billingNow()`). See `docs/local-dev.md`.
- **Pay now breakdown:** `BillingOverview.renewalBreakdown` (`price`, `couponCode`,
  `couponDiscount`, `taxable`, `gst`, `total`), from `renewalCharge` — the renewal checkout's
  calculation, so `total` = `renewalAmount` = the renewal preview. Shown as "₹1,499 + GST"
  since the second round of fixes (below).
- **Company & tax details** moved out of the lifecycle settings: `GET/PUT /admin/billing/company`
  (`CompanyDetails` = `{ seller, warnings }`, `admin_settings`). `LifecycleSettings` no longer
  has `seller` (`PUT /admin/billing/lifecycle` still accepts it, for old clients).
- **Org coupons:** `GET /org/billing/coupons` → `OrgCoupon[]`: coupons reserved for the org, and
  open coupons with `Coupon.showToCustomers` (new, default off; only for open coupons). Not-yet-started
  coupons are left out. `status`: `redeemed` (used a once-per-org coupon; with `redeemedAt`, the
  invoice link and number), `expired`, `used_up`, else `available` — the checkout's checks, in
  order. "Use at checkout" opens Plans with `?coupon=`, carried into the checkout links, where
  the code is filled in and checked.
- **Invoice download after paying:** `Invoice.checkoutId` (null for offline payments and credit
  notes); the success page finds the payment's invoice by it and opens the same document as
  Billing → Invoices.
- **Yearly saving:** `yearlySaving(priceMonthly, priceYearly)` in `pricing.ts` — shown only when
  both prices are set and yearly < 12 × monthly (admin hint "17% cheaper than 12 × monthly"; org
  plans page "Save ₹X a year"). The hardcoded "Yearly: 2 months free" badge is gone.

### Fixes after testing (2)

- **One error for anything the plan locked:** every edit of a view-only project (details, unit
  types, units — add / edit / delete / book / hold —, sales agents), publishing an offline
  landing page, re-activating a paused user (`PATCH /org/users/:id/status`, `POST
  /org/users/:id/approve`) and assigning a lead to a paused user answer 403
  `{ code: "plan_locked", lock: "project_view_only" | "landing_page_offline" | "user_paused",
  message }` (`planLockedError`). The frontend's `apiFetch` turns it into one friendly message
  per kind (`lib/plan-lock.ts`). An offline page comes back through "Change what stays" or an
  upgrade only (Publish no longer clears the marker).
- **In the app:** a view-only project shows "View only" next to its status in the header, a notice
  with Upgrade / Change what stays on every tab, and no Edit / add / edit / delete / status
  actions (overview, Units, unit detail, the edit page's Save, the hidden Knowledge / AI calling
  tabs). Direct lead entry and lead updates keep working. There is no bulk lead creation on the
  project pages.
- **Lists:** one badge, `PlanLockBadge` ("View only" / "Offline" / "Paused", amber, with the
  reason as tooltip) on the projects grid and table, All Units, landing pages (cards and table;
  Publish disabled with the reason, bulk Publish skips them) and users (instead of Active; no
  Activate, "Change what stays" instead). Filters (shown with billing v2 on): `GET /org/projects?viewOnly=true`,
  `GET /org/units?viewOnly=true` (units of view-only projects — standalone units have no project
  and are never locked), `GET /org/landing-pages?offline=true`, `GET /org/users?paused=true`
  (and `status=active` leaves paused users out).
- **Paused users:** checked end to end — no sign-in (password and now Google too), sessions end,
  no seat, can't be re-activated from the user screens. New: they're not offered for leads
  (assignable list, round-robin, project / unit agents), and Lead Center has "Needs reassigning"
  (`GET /org/leads?needsReassign=true`, `stats.needsReassign`, `assignedTo.paused`).
- **Pay now amounts:** `packagePriceText(amount, { gst })` → "₹1,499 + GST" (or "₹1,499" where GST
  doesn't apply); `renewalPriceText(overview)` / `renewalPriceNote` for the renewal (after any
  coupon; the coupon and the total incl. GST only as secondary text). Used by the banners, the
  renewal popup, "Buy … again", the overview, the plans page and the plan-change screens. The
  checkout itself still lists the full breakdown and pays the total.
- **Invoice email:** when a payment is fulfilled (Razorpay verify or webhook, or "Mark paid
  offline") the owner and every active admin get "Payment received – Invoice <number>" with the
  plan, period and amounts (package amount, discount, GST, total), the invoice attached as the
  printable HTML page (no PDF renderer yet — open it and Print → Save as PDF) and a link to
  Billing → Invoices. A refund sends "Refund processed – Credit note <number>" the same way. Sent
  once per invoice (`invoices.emailed_at` is claimed first), from the platform's SMTP, logged in
  the email logs under the org (template `billing`). A ₹0 checkout and an approval without
  payment have no invoice, so no email.

### The free plan and internal ₹0 plans

- **Free plan = the system plan (Basic)** — `isFreePlan` is `isSystem`, no longer "₹0 on both cycles".
  An internal ₹0 plan such as the staging "Demo" plan (`prisma/seed-demo.ts`) is a normal plan:
  editable, deletable (Delete is only disabled for Basic), shown with its own name and status.
- **Never offered:** `isInternalPlan` (₹0, not system) plans are left out of `listPlans()` for
  organisations and refused at checkout (`plan_not_found`), even if `is_active` is true. The
  Super Admin assigns them.
- **Super Admin plan list** (`listAdminPlans`) returns inactive plans too, with
  `BillingPlan.isActive: false` and a "Not offered" badge, so a plan doesn't have to be made active
  to be edited or deleted. An inactive plan may be saved at ₹0; an offered one needs a price.
- **Delete** is refused while an organisation is on the plan, naming it: "\"Demo\" can't be deleted
  while organisations are on it (Skyline Demo Realty). Move them to another plan first, or make it
  inactive to stop offering it."

### Manual mode: requests, choose what stays, withdraw

- **Action row:** Settings → Billing has no standalone "Choose what stays" button (both modes
  since online step 4); the grace and "You're on Basic now" banners keep their links. A "Requests" link sits
  next to Coupons.
- **Over the target's limits:** in manual mode the preview no longer returns `usageError` for
  users / projects / published landing pages / templates; it returns `usageConflict` `{ items: [{ key, limit,
  used }], choicesFit }`. The request screen shows "Pro allows 5 users; you have 8. Choose which 5
  stay active when this change is approved." with "Choose what stays"
  (`/org/settings/billing/choose-what-stays?target=<plan>&back=checkout&interval=…`, whose Back
  returns to the request). Choices are saved for the target plan (`retention_choices`, one per
  org). Send — and `startCheckout` (`choose_what_stays`) — waits until one of the two
  options is picked (`whatStaysChoice`; see "Choose what stays rules").
  Created landing pages (`landingPagesCreate`) over the limit are still a `usageError` (they
  can't be paused); templates go through choose what stays since 2026-10-27. Online mode does the same
  since online step 2 (see "Online mode follows the same rules").
- **Approval** of a v2 request (one with a checkout) checks only what can't be paused
  (`assertPlanFitsAfterRetention`); `applyPlanChange` → `applyRetention` then pauses the rest
  using the saved choice for that plan, or the default picks — like a scheduled downgrade.
  Older requests (no checkout) keep the strict check.
- **One pending request:** while `pendingUpgrade.status === "pending_approval"`, every plan card
  action and the checkout button (keeps its "Send change request" / "Pay" label) are disabled with "You already have a pending request
  (Starter → Pro, sent 22 Oct). Wait for approval or withdraw it." (`PendingUpgrade.fromPlan` +
  `createdAt`). The API refuses a different second request with the same words
  (`request_pending`, from both checkout start and the legacy request endpoint); the same plan and
  interval again returns the existing request.
- **Withdraw:** `PackageChangeRequestStatus` already had `cancelled` (the org cancelling a request),
  so no migration: withdraw sets it, cancels the linked checkout, and the request leaves Super
  Admin's Pending filter (shown under All as "withdrawn").
- **What they chose stays with the request:** `package_change_requests.what_stays` (JSON, migration
  `20261023090000_package_request_what_stays`, guarded) holds a copy of "choose what stays" for the
  target plan — only the limits the org is over: `{ planId, planName, choice: "saved" | "default",
  applied, users?, projects?, landingPages?, templates? }`, each `{ limit, total, kept: [{id,name}], paused }`
  (`whatStaysFor` in `retention.util.ts`). Saved when the request is sent, refreshed when they change
  their choice for that plan while it's pending, and on approval replaced with what was actually kept
  (`applied: true`). `OrgPlanRequest.whatStays` (null = everything fits): the Requests tab shows
  "Keeps 2 of 3 users" with one button: "Change what stays" while pending, "View" once decided
  (`choose-what-stays?target=…&back=requests&request=<id>`), only the latest row editable (see
  "Choose what stays rules"). Super Admin's Package requests section shows the summary, with the
  what-stays button in its Action column.
- **One request at a time:** checkout start (both modes), the legacy request endpoint and scheduling a
  downgrade all refuse with `request_pending` and the same message until the request is approved,
  rejected or withdrawn.
- **Wording:** plan actions say "Change plan" (no Upgrade / Downgrade buttons); the request screen
  says "Request a change to Pro" / "Send change request"; banners say "Change to Pro requested",
  "Change to Pro was not approved", "Change to Growth scheduled".
- **Change plan is always open** (Settings → Billing action row), even while a request waits, so the
  plans can always be seen; the plan cards and checkout button carry the block instead.
- **No "Cancel plan" for orgs, no "How you pay" block.** Basic is a normal choice under Change plan
  (`/downgrade?plan=<basic id>`; `/move-to-basic`, and old `/cancel` links redirect there). Choosing it
  calls `cancelPlan({ reason })` underneath (end of the paid period; straight away if expired) and
  asks "Why are you moving to Basic? (optional)". Org wording never says cancel: "Move to Basic on
  23 Dec 2026? You keep Starter until then.", banner/status "Change to Basic scheduled for 23 Dec 2026"
  with "Keep Starter" (undo), notification "You're on Basic now". Smaller paid plans the same way:
  "Change to Growth on …?", "Change to Growth scheduled for …", "Keep Pro"; their notification is
  "You're on Growth now". Org-facing API messages follow ("You're already on Basic.", "No change to
  Basic is scheduled."). Super Admin's own Cancel action is unchanged.
- **Rejected:** `BillingOverview.rejectedUpgrade` `{ requestId, toPlan, interval, rejectedAt, reason }`
  while the latest request is a rejected one; the Billing page shows it with the reason. The
  Super Admin must give a reason (10–500 characters).

### Choose what stays rules (both modes, 2026-10-27)

One rule: "Choose what stays" is part of every plan change where the org is over the target plan's
limits. The org picks an option every time; they can change their choice until the change is
decided or takes effect; after that only Super Admin can change it. Helpers: `billing/what-stays.ts`,
`common/utils/what-stays-rows.util.ts`.

- **Two options, picked every time:** the Move to Basic / downgrade page, the manual change request
  screen and the grace-period change show two radio buttons whenever the org is over the target's
  limits (`WhatStaysOptions` in `choose-what-stays.tsx`; it replaces the old "your choice" box):
  - **Keep the default picks** — the list we'd keep (users, projects, landing pages, templates) under it;
  - **I'll choose what stays** — a "Choose what stays" button (the existing screen, opened with
    `back=checkout|downgrade|requests`, keeping plan / interval / request); with a saved choice, "Your
    earlier choice" and its picks with **Edit**.
  Neither is selected when the page opens, even with an earlier choice. The main button (Send change
  request / schedule) is disabled until "Keep the default picks", or "I'll choose" with a saved
  choice **that still fits** (`RetentionChoices.savedFits`: the stored choice against the plan's
  limits today — they can be lowered after it was saved; the lists themselves are trimmed to fit, so
  they can't show it). A saved choice that doesn't fit shows "Your earlier choice doesn't fit
  Growth's limits any more. Edit it, or keep the default picks." No conflict: no options. On the
  checkout, if the preview has no `usageConflict`, the overview's usage against the plan's limits
  decides (same check as the downgrade page). The checkout and downgrade screens start fresh when
  the plan, interval or `pick` in the URL changes (no option carried over).
- **Choose what stays screen:** Save sends exactly what's ticked, reloads the overview, then goes back
  to the `back=` page (checkout / downgrade with `pick=saved`, so "I'll choose" is selected; or the
  Requests tab), which loads the preview and retention again on arrival. The button next to Save
  (and the header's Back) returns there without saving. Without `back=` it stays and shows what was
  saved. Billing API calls use `cache: "no-store"` so a page never shows a cached old value.
- **API:** `startCheckout` (manual), `POST /org/billing/cancel` and `POST /org/billing/downgrade` take
  `whatStaysChoice: 'default' | 'saved'` (`acceptDefaultPicks: true` from older clients = `default`).
  Over the limits, nothing sent → `choose_what_stays` ("Pro allows 5 users; you have 8…"); `saved`
  without a saved choice that fits → `choose_what_stays` "Save your choice of what stays on Pro first,
  or keep the default picks." `default` drops an earlier saved choice for that plan once the change is
  accepted, so the defaults really apply. `whatStays.choice` records the option (`default` / `saved`).
- **Scheduled changes keep a copy:** `package_change_requests.what_stays` is now filled for
  `scheduled_change` rows too (when scheduled; refreshed while scheduled; replaced with what was
  actually kept, `applied: true`, when it takes effect — `done`). No migration — the column exists.
- **Editable until decided:** `PUT /org/billing/retention` (optional `requestId`) works before the
  change is sent, while the request is `pending` or the change `scheduled`, and in grace before the
  fall back to Basic. Once the request is approved, rejected or withdrawn, the scheduled change is
  done / undone / replaced, or the target is the plan the org is already on, it's refused:
  **`what_stays_locked`** "To change what stays, contact our support team." (so the org can no
  longer swap items on its current plan). `GET` returns `locked: true` then and the page shows a
  read-only list (stays active / paused) with that note and a Support button (`/org/support`). For a
  decided request the list is that request's own copy (history), not today's picks. Without
  `requestId` the lock is "the org is on that plan"; a new request to a plan whose last request was
  rejected starts a fresh choice.
- **One place — the latest row:** "choose what stays" lives on the org's **latest** package change
  row (newest request or scheduled change, any status; `latestRequest` in
  `common/utils/what-stays-rows.util.ts`). Every save there also overwrites that row's stored copy,
  so the org and Super Admin always see the same thing. Older rows are history: viewable, never
  edited (`PUT` with an older `requestId` → **`what_stays_not_latest`** "Only the latest request's
  choice of what stays can be changed. Older requests are history.", org and Super Admin alike).
- **What a View shows** (`GET …/retention?requestId=`, `RetentionChoices.view` / `viewDate`):
  latest row while open → the planned choice (editable for the org); latest applied row with the org
  on its plan → the **live** state (from the pause / view-only / offline markers); any other row →
  its stored copy, read-only, with a header: `history` "What stayed when this change applied on
  27 Oct 2026. This is history; your current setup may be different. See the latest request for
  what's active now." or `not_applied` "What was requested (not applied)." (rejected / withdrawn /
  undone / replaced). Without a request, the plan the org is on is always the live state.
- **Org Requests tab:** each row with a record shows only the short summary ("Keeps 3 of 5 projects"
  on the open latest row, "Kept 3 of 5 projects" otherwise) and one button from
  `OrgPlanRequest.whatStaysAction`: **Change what stays** (latest row, pending / scheduled) or
  **View** (everything else); nothing when everything fit. Both open
  `choose-what-stays?target=…&back=requests&request=<id>`.
- **Org billing page:** while anything is paused, the Usage card shows "Active now: 3 of 5 projects,
  1 of 1 template…" with a **View** link to the live read-only list. No edit button (only our team
  can change it).
- **Org UI when locked:** the "You're on Basic now" banner, the overview action row (on Basic),
  locked-item notices (`PlanLockNotice`) and the paused-user menu show the note / "Contact support"
  instead of "Change what stays". Lock copy (`plan_locked` messages) says "Upgrade, or contact our
  support team to change what stays". Still editable (links kept): the grace banner, the
  scheduled-change banners and the request screen.
- **Super Admin:** `GET/PUT /admin/billing/subscriptions/:orgId/retention?targetPlanId=&requestId=`
  (admin_subscriptions view / edit). Same validation (owner always stays, limits, known ids).
  Editable only on the latest row (`whatStaysEditable` on each row of
  `GET /admin/package-change-requests`): pending / scheduled → updates the planned choice and the
  row's copy; approved / done with the org on that row's plan → applied at once (pauses and
  unpauses) and the copy becomes what was kept. Latest row rejected / withdrawn / undone / replaced,
  or applied but the org has moved on → `request_closed`. Audit log
  `retention_choices_saved_by_admin` (actor + `metadata.admin` name and email, `appliedNow`,
  `requestId`, the ids); the org's billing admins get "Our team updated what stays active on your
  plan" (type `package_change_request`).
- **Super Admin UI:** org detail → Package requests, **Action** column (last): Mark as paid /
  Approve / Reject as before, then **Choose what stays** on the editable latest row, **View what
  stays** (read-only, same headers as the org) on every other row with a record, nothing without one.
  Org page order: action row (Extend grace, Cancel = move to Basic, **Choose what stays**), plan
  summary, Package requests, Payments, then Timeline and Coupon in use. The action row's standalone
  **Choose what stays** shows only when no request set the
  current plan (`SubscriptionDetail.whatStaysOrgLevel`; `currentPlanSetByRow` — the latest applied
  row, by `updated_at`, isn't for the current plan, e.g. assigned directly). Saving there without a
  `requestId` while a request set the plan → **`what_stays_use_latest`**.
- **Scheduled rows that took effect** show "Took effect 27 Oct 2026" (the real date) instead of
  "Starts …", on both lists.

### Manual mode: every paid action is a request (Mark as paid → Approve)

Online payments off: renewals and plan changes are requests the Super Admin handles in one place —
Package Requests → Open → the org's "Package requests" section: **Mark as paid**, then **Approve**
(or **Reject**). Online mode pays the same changes at the checkout instead (see "Online mode follows
the same rules").

- **Request kinds** (`OrgPlanRequest.label`, also on the admin rows and `PendingUpgrade.label`):
  "Renewal of Pro" (a renewal-kind checkout for the plan the org is on) or "Change to Starter";
  `overdue: true` (shown as an "overdue renewal" tag) when it was sent while the renewal was
  overdue — stored as `billing_checkouts.overdue`.
- **Request renewal:** `startCheckout({ purpose: "renewal" })` in manual mode creates a request at
  the renewal quote (today's price, renewal coupon, GST; a scheduled smaller plan is renewed at its
  price) instead of refusing — **`renewal_manual` is removed**. Open from the renewal window
  (`notifyDays` before `renewsAt`) through grace. The renewal banner, the 3-day popup, the grace
  banner and the overview action row show "Request renewal · ₹X + GST" (→ the renewal request
  screen, `checkout?…&renew=1`, button "Send renewal request"); "Renewal requested" (disabled) while
  it waits. Approval continues the period from `renewsAt` (`renewalPeriodEnd`).
- **Renewal overdue (grace, `past_due`):** any paid plan — same, bigger or smaller, either interval —
  is a request at that plan's **full price + GST** (`quoteOverdueChange`, kind `renewal`, no
  proration: nothing was paid for the overdue days; a renewal coupon on the subscription applies as it
  does for renewals; `couponsEnabled: false`). Approval continues the period from the missed
  `renewsAt`. What doesn't fit is paused with the org's "choose what stays" for that plan (the
  `usageConflict` flow) or the default picks. The plans page links every paid plan to the request
  screen. **Basic** moves the org at once (fall back to Basic: extras paused, `movedToBasicAt`) after
  "Move to Basic now?" — no request. `POST /org/billing/cancel` does this in grace in manual mode;
  `POST /org/billing/downgrade` to a paid plan sends the change request — **`downgrade_not_now` is no
  longer returned in manual mode**.
- **Option A — no hold:** when grace ends with a request still pending the org still falls back to
  Basic; the request stays pending and gets `package_change_requests.moved_to_basic_at`
  (`OrgPlanRequest.movedToBasicAt`, shown as "Org moved to Basic while waiting"). Approved later, the
  org moves to the requested plan, everything that fits comes back, and the new term starts on the
  payment date entered in Mark as paid (`applyPlanChange({ periodStart })`).
- **Mark as paid** (Super Admin, `PUT /admin/package-change-requests/:id/payment`
  `{ method, reference?, receivedOn, note? }` — the amount is always the request's current total incl.
  GST, read-only in the dialog (an `amount` sent is ignored; a ₹0 request → `nothing_to_pay`); method Bank transfer / UPI / Cheque / Cash / Other; reference required except for
  Cash; `receivedOn` YYYY-MM-DD, not in the future). Stored in `billing.offline_payments` with
  `package_change_request_id` (unique) and `status: "awaiting_approval"`. Sending it again edits it;
  `DELETE …/payment` clears it — both only while the request is pending. Codes: `amount_required`,
  `reference_required`, `date_invalid`, `date_in_future`, `request_not_pending`,
  `request_without_checkout` (older requests are approved as before). The rows show "Paid · ₹1,178.82
  · UPI · UTR 12345 · 23 Oct" (`payment` on the admin rows and `OrgPlanRequest.payment`).
- **Coupon on the request** (top of the Mark as paid dialog: code + Apply / Remove;
  `PUT /admin/package-change-requests/:id/coupon { code }`, `DELETE …/coupon`; pending requests only,
  `request_not_pending`). Checked like checkout (`findCouponFor` → `checkCoupon`: plan, interval,
  dates, uses, once per org) with the same messages (`coupon_invalid`, e.g. "There's no coupon called
  NOPE. Check the spelling."). The request is re-quoted — coupon off the price before GST (after any
  proration credit), GST again on the rest — and saved on its checkout (`couponId`,
  `couponDiscountPaise`, taxable, GST, total), so the request total, the org's Requests tab and the
  invoice use it. It replaces any coupon the quote had (e.g. a renewal coupon). The original amounts are
  kept in `billing_checkouts.quote_before_coupon`; Remove restores them. Changing it after Mark as paid
  clears the recorded payment (`paymentCleared: true`; the dialog asks first). Both return
  `{ quote, paymentCleared }`. `quote` (also on the admin rows and `OrgPlanRequest.quote`):
  `{ price, couponCode, couponDiscount, gst, total, couponAdded }` — shown as "₹1,499 − ₹300 coupon
  (SAVE300) + GST ₹215.82 = ₹1,414.82" in the dialog and "₹1,499 − ₹300 coupon + GST" on the rows.
  A 100% coupon makes it ₹0: no Mark as paid ("Edit coupon" opens the dialog), Approve directly, no
  invoice (as a ₹0 checkout). On approval the redemption is recorded and a first_n / forever coupon
  attaches to the subscription for later renewals, as for online purchases — on a renewal request too.
- **Approve** needs the payment first (`payment_required`) unless the total is ₹0. No amount
  confirm (the amount is always the total). Then, once, in one transaction:
  the plan is applied (`applyPlanChange`, the period rules above), the coupon settled, the GST invoice
  issued from that payment — the request's quoted breakdown when the amount equals its total, else the
  offline rule (amount GST-inclusive) — with `checkoutId` and `offlinePaymentId`, the payment becomes
  `received`; after commit the invoice is emailed (existing mailer) and the org is notified. A second
  approval is refused (the request and the checkout's `fulfilledAt` are claimed conditionally), so
  nothing is extended or invoiced twice.
- **Reject** (reason still required): a paid request's dialog warns "This request was marked paid
  (₹X). Refund the customer outside the app."; the payment is kept as `refund_due` ("rejected – refund
  due"); no invoice. Payments `awaiting_approval` / `refund_due` are not in Payments & Invoicing.
- **Org-level "Mark paid offline" and "Apply coupon"** (Subscriptions → org): hidden in manual mode
  (`SubscriptionDetail.paymentMode`), and the endpoints refuse them (`use_request`, "… Use the pending
  request instead …"). "Extend grace" stays. In online mode "Mark paid offline" is still refused
  while the org has a pending request (`request_pending`) or a payment under review (`payment_review`).

### Online mode follows the same rules (online steps 1–4, 2026-10-29)

The billing flow is the same in both payment modes; manual mode only swaps "pay now" for "send a
request" (Mark as paid → Approve). Mode-independent since these steps: overdue (grace) changes at full
price, Basic in grace at once, every paid plan in grace through the checkout, "choose what stays"
(`usageConflict`, the two options, the stored option), one row per change on the Requests lists, the
latest-row rule, and the plan-change blocks (`request_pending`, `change_scheduled`, `payment_review`).
Still manual-only on purpose: `refuseInManualMode` (Mark paid offline / Apply coupon on the org page),
the Mark as paid / Approve / Reject UI, and "Request renewal". The audit that planned these steps is
in `docs/archive/online-mode-audit.md`.

- **Online mode, renewal overdue (grace) — the same rules (online step 1, 2026-10-29):** every paid
  plan (same, bigger or smaller, either interval) is paid at the checkout at its **full price + GST**
  (`quoteOverdueChange` in both modes: kind `renewal`, `overdue: true`, renewal coupon only,
  `couponsEnabled: false`); once paid the period continues from the missed `renewsAt`. The plan cards
  link every paid plan to the checkout ("Pay now" on the current plan, "Change plan" on the others;
  frontend `isOverdue` in `lib/billing/direction.ts`, both modes). **Basic** moves at once in both
  modes (`POST /org/billing/cancel`, "Move to Basic now?"). `POST /org/billing/downgrade` to a paid
  plan in grace online returns **`pay_at_checkout`** (the payment happens at the checkout; the UI
  never calls it) — never `downgrade_not_now`, nothing scheduled. Active-period rules (proration,
  scheduled downgrade, Basic at the term end) are unchanged.
- **Online checkout over the target's limits (online step 2, 2026-10-29):** the preview returns
  `usageConflict` in both modes (only what can't be paused — created pages — is a `usageError`), so
  the online checkout shows the same two options and **Pay** stays disabled until one is picked; start
  refuses `choose_what_stays` before any Razorpay order. The option is stored on the checkout
  (`billing_checkouts.what_stays_choice`, migration `20261029090000_checkout_what_stays_choice`;
  null when nothing was over). **Fulfil = Approve:** `assertPlanFitsAfterRetention`, and when the org
  is over what can be paused it needs the stored option — none (usage went up after the quote), or
  "saved" whose saved choice no longer fits → `needs_review` with that reason (Super Admins notified,
  plan not applied); otherwise `applyWhatStaysChoice` ("default" drops an earlier saved choice) and
  `applyPlanChange` → `applyRetention` pauses what doesn't stay. A closed or failed payment changes
  nothing. The conflict wording is now "… stay active when this change takes effect." (both modes).
- **Online payments are rows (online step 3, 2026-10-29):** every online checkout gets a
  `package_change_requests` row, kind `online_payment`, linked through
  `billing_checkouts.package_change_request_id` (migration `20261029100000_online_payment_rows`:
  kind `online_payment`, statuses `awaiting_payment` and `needs_review`). Lifecycle (`billing/online-rows.ts`):
  created `awaiting_payment` at start (with a what-stays copy when over the limits); paid →
  `approved` + the applied what-stays copy; failed / expired / superseded (a newer checkout, or a scheduled downgrade / move
  to Basic) → `cancelled`; review → `needs_review`. Never `pending`, so `request_pending` and manual mode are
  untouched. `awaiting_payment` is an open status (`OPEN_REQUEST_STATUSES`): the latest waiting row has
  "Change what stays" (saving there makes the payment use the saved choice); `approved` is applied, so
  `latestRequest` / `currentPlanSetByRow` / `whatStaysPlace()` now cover online payments and the
  standalone Super Admin button hides after an online purchase. Lists: `OrgPlanRequest.kind`
  `online_payment`, `status` `awaiting_payment` / `approved` / `needs_review` / `closed` (stored
  `cancelled`), and `online: { state: waiting|paid|failed|expired|superseded|needs_review|refunded|resolved,
  paidAt, orderId, invoice }` (+ `reviewReason` on the Super Admin rows). Tags: "Waiting for payment", "Paid online · 27
  Oct", "Payment failed", "Expired (not paid)", "Superseded", "Needs review", "Refunded",
  "Resolved by our team" (Super
  Admin: links to Subscriptions → Package Requests). Rows are read-only (no Approve / Reject / Mark as
  paid). Both lists expire stale checkouts first. ₹0 activations (100% coupon) make no row.
- **A payment under review blocks plan changes (online step 4):** while the org has a checkout in
  `needs_review`, `BillingOverview.planChangeBlockedReason` is **`payment_review`** with "A payment is
  being checked by our team. You can change plans once it's resolved." (`PAYMENT_REVIEW_MESSAGE` /
  `PAYMENT_REVIEW_TEXT`). The plan cards and the checkout's Pay are disabled with it, the downgrade
  page says plan changes are on hold, and the API refuses `payment_review` at checkout start (not
  renewals — a renewal keeps the org running), `scheduleDowngrade`, `cancelPlan` and Super Admin
  Mark paid offline. **Resolving it:** a refund of that payment (Payments & Invoicing) or **Mark
  resolved** on the review list (`POST /admin/billing/checkouts/:id/resolve` `{ note? }`,
  `resolveAdminCheckout`; for a plan sorted out by hand) sets the checkout to `rejected` (nothing is
  applied) and the row shows "Refunded" / "Resolved by our team"; the block lifts.
- **One change at a time (online step 4, audit 7b):** scheduling a downgrade or Basic (and starting
  a new checkout) **cancels the org's open online checkouts** — their rows show "Superseded"
  (`supersedeOpenCheckouts` in `billing/online-rows.ts`). A payment that still arrives for a cancelled /
  superseded checkout is never applied: it goes to `needs_review` ("Paid after a newer change: …
  Refund the payment."), Super Admins are notified, and our team refunds it from the review list. So
  paying in an old tab never applies an old quote, and nothing applies twice.
- **No standalone "Choose what stays" on the org's action row, in either mode** ("one place"): what
  stays is chosen with each change (checkout / downgrade options, the grace and Basic banners) or on
  the latest row of the Requests tab. On Basic after a paid plan the action row keeps the
  view-only note ("To change what stays, contact our support team"). This matches the Super Admin
  side, where `whatStaysPlace()` puts the edit on the latest row or, only when no row set the plan,
  the org page.

### Scheduled changes on the Requests list (both modes)

- Stored in `package_change_requests` with `kind = 'scheduled_change'` (approval requests are
  `kind = 'request'`, the default) plus `reason`, `starts_at`, `scheduled_amount` (the smaller plan's
  price, rupees before GST; null for Basic). Same table, so `listOrgRequests` and the Super Admin lists
  page and sort them with the requests without merging. A closed row's date is `reviewed_at`.
- **Statuses** (never `pending`): `scheduled` ("Scheduled (applies on 22 Dec)") → `done` (it took
  effect: the sweep applied it, or a renewal paid onto the scheduled plan) / `undone` ("Keep <plan>":
  `undoCancel` / `undoDowngrade`) / `replaced` (an upgrade, a renewal of the same plan, an approval,
  another scheduled change, fall back to Basic after grace, or the scheduled plan was archived). One
  open row per org at a time.
- Never `pending`, so they don't trigger `request_pending`, can't be approved / rejected /
  withdrawn, and aren't in the Super Admin Pending filter (only All). Scheduling a change while an
  approval request is pending is still refused (`request_pending`). The legacy org history and
  `BillingOverview.rejectedUpgrade` ignore them.
- **A scheduled change blocks other plan changes** (both modes), the same way a pending request
  does, until it takes effect or is undone ("Keep <plan>"). The API refuses checkout start (online
  and manual, any purpose except `renewal`), the legacy request endpoint, `scheduleDowngrade` and
  `cancelPlan` with `change_scheduled`: "You've scheduled a change to Basic on 25 Nov 2026. Click
  'Keep Starter' to undo it before choosing another plan." (`scheduledChangeBlock` /
  `scheduledChangeMessage` in `common/utils/scheduled-change.util.ts`; the date is when it
  applies). The UI: every plan card action is disabled with that message as its tooltip (Change plan
  in the action row stays clickable); the checkout (not a renewal) and the downgrade / move to Basic
  pages show the message with "Keep <plan>" instead of the form. Still allowed: "Keep <plan>"
  (banner, Requests tab, that note), the renewal (Pay now / Request renewal, at the scheduled plan's
  price) and "choose what stays" for the scheduled plan.
- `OrgPlanRequest` for a scheduled change: `label` "Change to Basic" / "Change to Growth",
  `fromPlan` → `toPlan`, `interval`, `startsAt`, `reason`, `amount` (null = "Nothing to pay now",
  else "₹999 + GST from 22 Dec"), `total` / `quote` / `payment` null, `decidedAt` = when it closed.
- UI: a "No approval needed" tag; the org Requests tab has "Keep <plan>" on a Scheduled row (the
  banner's undo); Super Admin rows are read-only except "Choose what stays". Scheduled rows keep a
  `whatStays` copy too (see "Choose what stays rules"). Moving to Basic straight away (term over, or manual
  mode overdue) is not recorded — nothing was scheduled.
- **Org side:** the Requests tab shows "Waiting for payment" → "Payment received – waiting for
  approval" → Approved / Rejected (with the reason) / Withdrawn. Withdraw works until the request is
  marked paid; after that "Contact us to withdraw" (`POST …/withdraw` → `request_paid`). The pending
  banner says the same.

### Billing details from the org profile

- **Single source of truth:** Settings → General (`PATCH /org/settings`, Super Admin `PATCH
  /admin/organisations/:id`). Mapping `Organisation` → `BillingProfile`: `name` (the organisation name) → `legalName` (the name on invoices; the separate, hidden `Organisation.legalName` is not used),
  `addressLine1` / `addressLine2` → same, `city` → `city`, `state` → `state` (GST state code),
  `postalCode` → `pincode`, `gstin` → `gstin`, `country` ("India" or empty → `"IN"`).
- **Overview:** `BillingOverview.billingProfile` is always set (`""` where not filled in) and
  `billingDetailsMissing` lists the empty required fields, in this order: `legalName`,
  `addressLine1`, `city`, `state`, `pincode`. Billing shows them read-only with "Edit in General
  settings" (`/org/settings?section=general`).
- **Checkout blocked** while anything is missing: `startCheckout` → 400 `billing_details_incomplete`
  "Complete your organisation details to continue." The UI shows that with a link to General settings,
  or "Ask your organisation admin to complete these details." for users without
  permission to edit Settings → General (`settings:edit`).
- **General Settings save check** (both admin paths): `state` must be a GST state code or empty;
  a GSTIN (optional, stored upper-case, `""` → null) must be well-formed and start with the state
  code — same messages as the old billing form. Only checked when `state` or `gstin` is in the save.
- **State picker:** one `StateSelect` (`components/ui/state-select.tsx`) in Settings → General,
  Super Admin → edit organisation and Super Admin → Company & tax details.
- **Invoices** snapshot the buyer when issued (`buyerFor` in `invoice.util.ts`): name, GSTIN and
  state from the checkout (taken when the purchase started), address from the org profile.
- **Data migration** `20261022090000_org_profile_billing_details` (guarded, re-runnable): free-text
  `organisations.state` → code (names, common spellings and abbreviations, case- and
  spacing-insensitive); anything unmatched → NULL so the org picks one. Then each
  `billing_profiles` row fills the org fields that are still empty (never overwriting), GSTIN
  included; its legal name is not copied (invoices use the organisation name).
- **Deprecated:** `billing.billing_profiles` (Prisma `BillingProfile`) is no longer read or
  written. The table is kept (not dropped). `GET` / `PUT /org/billing/profile` are removed.

### Step 2 notes

- **Billing details:** superseded — they now come from the organisation profile (see "Billing
  details from the org profile" below). `BillingProfile.state` is still a 2-digit **GST state code**
  (`"29"` = Karnataka; list in `pricing.ts` `INDIAN_STATES` / backend `gst.ts`).
- **Seller (company tax settings):** `CompanyDetails.seller` (`SellerSettings`), saved with
  `PUT /admin/billing/company` (Settings → Company & tax details; until the fixes it was part of
  `LifecycleSettings`). Its `state` decides the split:
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
  active — that's a downgrade), `yearly_to_monthly`, `billing_details_incomplete` (was `billing_profile_required`),
  `request_pending` (a second request, or online start while a manual request waits — "You already have a pending request (…). Wait for approval or withdraw it."), `change_scheduled` (a change to Basic / a smaller plan is scheduled — "You've scheduled a change to Basic on 25 Nov 2026. Click 'Keep Starter' to undo it before choosing another plan."; renewals are not refused), `choose_what_stays` (either mode, over the target's limits before choosing what stays), `payment_review` (a paid checkout is being checked — not for renewals), `amount_too_small` (online
  total under ₹1), renewal codes (step 3 notes), and on the old endpoints
  `paid_plan_requires_checkout` / `paid_renewal_requires_checkout`.
- **One open order per org:** starting a new online checkout — or scheduling a downgrade / Basic
  (online step 4) — cancels the org's older pending ones (advisory lock); a late payment for one goes
  to `needs_review`, never applied. Pending online checkouts expire after 30 minutes (sweeper). Manual mode
  returns the existing pending request instead of creating a second one.
- **`BillingOverview.planChangeBlockedReason`** (`"request_pending" | "change_scheduled" | "payment_review" | null`)
  and **`planChangeBlockedMessage`** (the same words the API refuses with): the one check the UI uses
  to disable plan changes (`planChangeBlock()` in `lib/billing/requests.ts`, which works the same
  out from `pendingUpgrade` / `cancelAt` / `downgradeTo` when an older payload lacks it).
  `request_pending` while `pendingUpgrade.status === "pending_approval"`; `payment_review` while it is
  `"needs_review"`; `change_scheduled` while `cancelAt` or `downgradeTo` is set.
- **`BillingOverview.pendingUpgrade`:** a manual request awaiting approval, or a paid checkout
  in `needs_review`; `null` otherwise. The UI shows a banner and disables a second request.
- **Fulfilment:** the plan is applied on `payment.captured` (from `confirmCheckout`'s verify or
  the webhook, whichever is first; idempotent with a row lock and `fulfilledAt`). If the price
  changed since the quote, the amount doesn't match, or the org no longer fits the plan, the
  checkout becomes `needs_review` and Super Admins get a notification — nothing is applied
  automatically. So does a payment for a cancelled (superseded) checkout. The org's plan changes are on
  hold (`payment_review`) until a refund or Mark resolved. `GET /admin/billing/checkouts` lists them (Package Requests tab, flag on).
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
  (Manual mode: a renewal is a request — see "Manual mode: every paid action is a request".)
- **New term** (`renewalPeriodEnd`, shared by quote and fulfilment): while the term or its grace
  is running (active / trial / past_due) it continues from `renewsAt` — paying early loses no
  days, paying in grace covers the days used; once expired it starts on the payment day. Status
  goes back to `active`, grace cleared.
- **Online:** a pending upgrade request doesn't block a renewal. **Manual mode** (since the "Mark as
  paid → Approve" rework): no longer `renewal_manual` — the renewal is a request ("Request renewal").
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

### Step 4 notes — downgrade and cancel at the end of the term

- **Stored on the subscription:** `cancelAtPeriodEnd` + `cancelReason`, or `scheduledPlanId` +
  `scheduledInterval` (at most one; scheduling one replaces the other). Any plan change —
  upgrade, renewal, Super Admin approval — clears them (`NO_SCHEDULED_CHANGE` in
  `applyPlanChange`). The endpoints only record the choice; the lifecycle sweep (hourly, and
  lazily on every billing read) applies it when the term ends.
- **Cancel** (`POST /org/billing/cancel` `{ reason? }`, undo `DELETE`): at `renewsAt` the org
  moves to the free plan (no grace — they chose to stop; `renewsAt` null, amount 0). Made during
  grace (either mode) or on an expired plan, it applies at once. Overview: status
  `cancellation_scheduled`, `cancelAt`, `renewalAmount: null`; a renewal is refused
  (`cancellation_scheduled`). Admins get "Plan ended". Codes: `nothing_to_cancel`,
  `nothing_scheduled`.
- **Downgrade** (`POST /org/billing/downgrade` `{ planId, interval? }`, undo `DELETE`): a
  smaller plan, or the same plan yearly → monthly; a free target is a cancellation. Only while
  active. In grace Basic moves at once in both modes; a paid target is a change request in manual
  mode and `pay_at_checkout` online (pay at the checkout). `downgrade_not_now` is left only for a
  term that isn't active or in grace and not with a pending upgrade request
  (`request_pending`). Being over the smaller plan's limits is fine since step 6 — the extras
  are paused when it starts — once "choose what stays" is confirmed (`choose_what_stays`). Other codes: `same_plan`, `not_a_downgrade`, `plan_not_found`.
- **When the term ends:** the renewal paid before then is charged at the smaller plan's price
  and switches to it. Unpaid, the sweep switches the plan at `renewsAt` and the term goes into
  grace on the smaller plan as usual. Either way what doesn't fit is paused (step 6).
- **Overview:** `downgradeTo`, new `downgradeInterval`, `downgradeAt` (= period end); status
  `downgrade_scheduled`, except in the renewal window, where `renewal_due` shows first (Pay now
  at the smaller price, banner says the plan changes).
- **Not yet:** the Super Admin "Renew" on a cancelling subscription doesn't clear the
  cancellation.

### Step 5 notes — coupons

- **Stored:** `billing.coupons` (code upper-case, unique, never renamed; percent = whole number
  1–100, fixed = rupees stored in paise; `planIds` paid plans only; `orgIds` empty = all orgs) and
  `billing.coupon_redemptions` (one row per discounted payment). `CouponRow.uses` = organisations
  that used it; `status` uses `couponStatusFor`'s rule.
- **Checks** (`coupon-rules.ts` `checkCoupon`): same order and wording as `validateCoupon` in
  `pricing.ts` — not started, expired (valid through `validTo`), reserved for other orgs, plan,
  billing interval, usage limit (an org that already used a reusable coupon isn't a new use),
  once per org. Unknown code: "There's no coupon called X. Check the spelling."
- **Maths:** taken off the taxable value after any proration credit (`proration.charge` is the
  pre-coupon amount), percent rounded half up in paise, fixed capped at the amount; GST on what's
  left.
- **Preview:** a bad code is not an error — `coupon: null`, `couponError` set, full price.
  `couponRenewalsLeft`: renewals it still covers after this payment (99 = every one).
  **Start:** a code that doesn't apply → 400 `coupon_invalid` (the charge never differs from the
  preview). A ₹0 total (100% coupon) activates at once in either mode → `{ status: "activated",
  receipt }` with `reference: "free_coupon"`.
- **Renewals:** a `first_n` / `forever` coupon is attached to the subscription
  (`couponId`, `couponRenewalsLeft`, null = forever) when the purchase is applied (payment, ₹0,
  or Super Admin approval of a manual request). Renewal previews apply it by themselves
  (`couponsEnabled: false` — no field) while it covers the plan / interval of the next term, and
  each paid renewal counts one off; `renewalAmount` includes it. Any purchase without that
  coupon replaces it.
- **Admin:** `POST /admin/billing/coupons` (`{ coupon, isNew: true }`), `PUT
  /admin/billing/coupons/:code` (`{ coupon }`); validation codes `coupon_code`, `coupon_value`,
  `coupon_plans`, `coupon_duration` (first_n needs 2+), `coupon_dates`, `coupon_uses`,
  `coupon_orgs`, `coupon_exists`. `GET /admin/billing/coupons/:code` → `CouponDetail` (latest 200
  redemptions, `totalDiscount`). `GET /admin/billing/org-options` → every organisation with its
  city and current plan.

### Step 6 notes — choose what stays, fall back to Basic

- **What "paused" means** (nothing is ever deleted):
  - users: `users.billing_paused_at` — can't sign in (login → 403 `{ code: "account_paused",
    orgName, ownerName, planName, planUserLimit }`; an open session ends on its next request with
    `USER_INACTIVE`; refresh tokens are revoked), and doesn't take a seat;
  - projects: `projects.billing_view_only_at` — open but not editable (`ProjectEditableGuard` on
    the project / unit-type / unit / sales-agent edit routes → 403 `plan_locked` since the second
    round of fixes; deleting is allowed), and doesn't count towards the limit;
  - landing pages: status `unpublished` + `landing_pages.billing_offline_at` (thank-you pages
    follow), so the public slug route answers 404 and the publish limit sees room. Publishing it
    by hand is refused (`plan_locked`); it comes back through "Change what stays" or an upgrade.
  - templates (2026-10-27): `organisation_templates.billing_paused_at` (migration
    `20261027090000_template_retention`, guarded) — can't be used for NEW landing pages
    (`POST /org/landing-pages` with that `templateId` → 403 `plan_locked`, `lock:
    "template_paused"`; the signup site seeding skips it too). Landing pages already made from it
    are independent copies: they stay live and editable and keep following the landing page
    limits as before. Paused templates don't take a template slot. `GET /org/templates` and
    `/org/templates/available` (and Super Admin `GET /admin/organisations/:id/templates`) return
    `paused`; the template picker and Templates page show the "Paused" `PlanLockBadge` with its
    tooltip and disable "Use", and the Templates page has a "Paused" status filter. Super Admin
    `PUT /admin/organisations/:id/templates` now only removes/adds the changed rows, so kept
    assignments keep their pause and `assignedAt`.
  The counting rules (`plan-quota.util`) skip paused users, view-only projects and paused
  templates (`countOrgTemplates`).
- **What stays:** the org's saved choice for that plan (`billing.retention_choices`, one per
  org), else the default picks — owner, then admins, then latest sign-in (newest refresh token);
  projects by latest update; landing pages by most leads in 30 days; templates by most landing
  pages made from them (`sourceTemplateId`), then the most recently used (latest page made from
  it), then the most recently assigned (`retention.util.ts`, same rule as `default-picks.ts`).
  The owner always stays. `retention_choices.template_ids` holds the template picks; a choice
  saved before templates could be paused (empty list) uses the default picks for templates, and
  `templateIds` is optional on `PUT /org/billing/retention`.
- **When it applies:** on every plan change — `applyPlanChange` (purchase, renewal, approval:
  a bigger plan restores everything), a cancellation or "fall back to Basic" taking effect, a
  scheduled downgrade taking effect — and at once when Super Admin saves a choice for the plan the
  org is already on (the org itself can't since 2026-10-27: `what_stays_locked`).
- **Fall back to Basic:** `afterGrace: "fall_back_to_basic"` is now allowed
  (`supports.fallBackToBasic: true`): when grace ends unpaid the org moves to the free plan with
  the extras paused (notification "Moved to Basic"). A cancellation taking effect does the same.
  Either way the subscription keeps `movedToBasicAt` / `previousPlanId` / `previousInterval`;
  the overview shows `status: "moved_to_basic"`, `movedToBasicAt`, `paidPlan` = the plan to buy
  again, and `locked` counts. Buying any plan clears them.
- **API:** `GET /org/billing/retention?targetPlanId=` (default target: the scheduled downgrade,
  else the free plan; `appliesOn` = renewal date, grace end, or null when already there) and
  `PUT /org/billing/retention` → `RetentionChoices`. Refusals: `retention_over_limit` ("Basic
  allows 2 users."), `retention_owner`, `retention_unknown`, `plan_not_found`.
  `BillingOverview.retention` (a `RetentionSummary`) is filled while the org is heading to a
  smaller plan (grace with fall back, cancelling, downgrading) or is on Basic after a paid plan.
  `getAccessStatus` returns the real paused / view-only / offline ids (plus `pausedTemplateIds`).
  `RetentionChoices.templates`, `RetentionSummary.templates`, `BillingOverview.locked.templates`
  ("1 template paused" on the "You're on Basic now" banner) and `UsageConflict` key `templates`
  carry templates. The walkthrough mock doesn't fill them (all optional on the frontend).
- **Not changed:** `GET /public/site/page-by-id/:id` (the builder preview) still serves any page,
  as it does for drafts. The public slug route still falls back to unpublished pages for pages
  unpublished by hand (existing behaviour); only billing-offline pages are excluded.

### Plan versions (2026-10-30)

Every change to a plan's **price (monthly or yearly), limits or features** in Plans & Pricing
(either editor) creates the plan's next version. Name, description, colour, "popular" and the
marketing bullet points don't. A save whose price, limits and features are unchanged creates no
version. "Features" = the feature switches (team chat, Meta lead ads, publishing, premium
templates, …) plus the Meta pages limit.

- **Data:** `billing.plan_versions` (plan, version number, prices, `limits`, `capabilities`,
  created by / at); `subscriptions.plan_version_id` and `billing_checkouts.plan_version_id`
  (null = the plan's latest). The `plans` row always holds the latest version. The migration gives
  every plan a v1 from its current values and points every subscription and checkout at it
  (guarded, re-runnable).
- **Flag:** versions are always recorded, but only applied with `BILLING_V2=true` on the server;
  with it off every org follows the latest values, as before.
- **What an org gets:** a new purchase, a change to another plan, a plan assigned by Super Admin,
  buying again after Basic and a scheduled downgrade taking effect → the latest version. A
  checkout or manual request keeps the version that was quoted (and its price) even if the plan is
  edited before it's paid / approved.
- **What's enforced:** every org read uses the org's version (`effectivePlan` /
  `withEffectivePlan`): user / project / landing page / template limits, publishing, features,
  the overview's `plan` and usage, `getAccessStatus`, choose what stays, Super Admin's org list.
  An upgrade's credit uses the price of the org's version; the new plan its latest price. The
  renewal is quoted and charged at the latest price (`BillingOverview.renewalAmount`).
- **Renewal:** every renewal (online, manual approval, Super Admin offline renewal, legacy renew)
  moves the org to the latest version. Renewing a deactivated plan is allowed, onto its latest
  version. If limits go down, what doesn't fit is paused at renewal (their choice or the default
  picks), like a downgrade.
- **Notice (paid plans):** from the renewal window (`notifyDays` before) and in grace,
  `BillingOverview.nextVersion` = `{ planName, fromVersion, toVersion, at, reason, price,
  changes[], lower }` — `price` for the org's interval (null when unchanged), each `change` with
  `text` ("3 users instead of 5", "no Team chat"). The org sees it **only when the new
  version is worse for them** (a lower limit, a feature off, or a higher price for their
  interval), listing only what gets worse — see "Org UI". One in-app notification (type
  `subscription_expiring`) with the same rule and wording when the window opens. Not shown while
  a change to another plan or to Basic is scheduled.
- **Choose what stays for a lower version:** `getRetentionChoices` without a target returns the
  org's own plan at the new limits, `locked: false`, `appliesOn` = the renewal date; saving stores
  the choice and pauses nothing until the renewal. A manual-mode renewal request isn't refused
  for being over the new limits.
- **Basic** (no renewal): a new Basic version that isn't lower, or that the org fits, applies at
  once (on save, and on every lifecycle sweep). An org over a lower version keeps its version for
  **7 days** from when the version was made (`BASIC_NOTICE_DAYS`), is told once (banner +
  notification, with Choose what stays), then moves with what doesn't fit paused and a "Basic has
  changed" notification.
- **Super Admin:**
  - `GET /admin/billing/plans` adds `version` (newest) and `versions[]` `{ version, orgs }`:
    organisations currently subscribed, per version (none recorded counts as the newest; older
    versions listed only while someone is on them).
  - `POST /admin/billing/plans/:id/preview` (body = the plan being saved) → `PlanSavePreview`
    `{ planName, isFree, createsVersion, version, orgsOnPlan, basic }`. The edit form asks before a
    save that creates a version: "This creates v4. 16 organisations stay on their current version
    until their next renewal." Basic: "This creates Basic v3. 2 organisations on Basic are over
    the new limits; they get 7 days' notice. The 5 organisations on Basic that fit move to it now."
  - `PUT /admin/billing/plans/:id` accepts (and ignores) the read-only `version` / `versions`.
  - `SubscriptionRow` / `SubscriptionDetail`: `planVersion`, `latestVersion`,
    `versionAppliesOn` — shown as "Starter v2" and "v3 applies at renewal on 26 Nov 2026"
    (Basic: "v3 applies on …").
- **Org UI:** organisations never see version numbers — only the plan name (Billing, plan cards,
  checkout, Requests, banners, notifications, invoices). When the next version is worse, the
  current-plan card, the renewal banner and the renewal popup show one sentence
  (`renewalChangeNotice` in `frontend/lib/billing/versions.ts`; the backend twin is
  `worseNotice` in `plan-version-change.util.ts`): "From your next renewal on 26 Nov 2026,
  Starter includes 3 users (you have 5) and costs ₹1,199 + GST." During grace (or once the date
  has passed): "When you renew, …". Basic: "From 6 Nov 2026, Basic includes …". "Choose what
  stays" only when they're over a new limit. Nothing is shown when the new version is the same or
  better.

### Step 7 notes — invoices, payments, Super Admin tools

- **Invoices** (`billing.invoices`): a GST tax invoice for every paid plan payment — issued in
  the same transaction that applies the plan (online), or when a Super Admin records an offline
  payment. ₹0 checkouts and `needs_review` payments get none. Amounts come from the checkout
  (offline: the amount is GST-inclusive, taxable = total ÷ 1.18 rounded half up). Seller and
  buyer are snapshots (seller settings; the org profile — Settings → General — when the invoice is issued; later edits never change an issued invoice). Numbers run per Indian financial year
  (April–March): `INV/26-27/0001`; credit notes `CN/26-27/0001` (`billing.invoice_counters`).
- **Document:** `pdfUrl` / `receiptUrl` is a signed link valid for an hour,
  `/api/billing/invoices/:id/document?exp=&sig=` (through the frontend's /api proxy): a
  print-ready HTML invoice the browser saves as PDF. No PDF library was added. No SAC code is
  printed yet — add the right one with your accountant.
- **Payments:** `PaymentRecord` rows are Razorpay payments for billing checkouts (captured,
  failed, refunded) plus `billing.offline_payments` (`status: "offline"`, or refunded).
- **Super Admin:**
  - `GET /admin/billing/subscriptions` — every organisation, `countsByStatus`, filters
    status / planId / q, paged;
  - `GET /admin/billing/subscriptions/:orgId` — timeline (audit log + failed payments),
    payments, coupon;
  - `POST …/:orgId/extend-grace` `{ days: 1–60, note? }` — only in grace (`not_in_grace`);
  - `POST …/:orgId/offline-payment` — records and invoices the payment, then renews the plan
    (on Basic after a paid plan: buys it back);
  - `POST …/:orgId/coupon` `{ code }` — checked like at checkout, then attached for the next
    renewals (first payment = 1, first N = N, forever = all);
  - `POST …/:orgId/cancel` `{ when: "period_end" | "now", note? }`;
  - `GET /admin/billing/payments` (with totals) and `POST /admin/billing/payments/:id/refund`.
- **Refunds:** full amount only. Online → Razorpay refund API (`PaymentsService.refundInFull`;
  if Razorpay refuses, 502 with its reason and nothing changes); offline → marked refunded.
  Either way the invoice becomes `refunded` and a credit note is issued. The plan is not
  changed — cancel it separately if needed.

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
- **Lifecycle:** reminders are stored since the fixes (`supports.reminderSchedule: true`);
  `fallBackToBasic` is `true` since step 6. Read-only fields (`paymentMode`,
  `paymentModeReason`, `supports`, and a plan's `id` / `rank`) may be sent back and are ignored.
- **Access:** `getAccessStatus` returns the real plan's limits and modules (and, since step 6,
  the paused / view-only / offline ids).

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
| `previewCheckout(req)` | `POST /org/billing/checkout/preview` (`billing:view`) | `PreviewCheckoutRequest` (`purpose: "renewal"` for a renewal; the buyer state comes from the org profile) | `CheckoutPreview` (an invalid coupon is **not** an error: return `couponError`) |
| `startCheckout(req)` | `POST /org/billing/checkout` (`billing:edit`) | `StartCheckoutRequest` | `StartCheckoutResponse` — online: `payment_required` with a Razorpay order (`keyId`, `orderId`, `amountPaise`, `name`, `description`, `prefill`); manual: `pending_approval` with `requestId`; `activated` when the total is ₹0 (coupons, later) |
| `confirmCheckout(req)` | `POST /org/billing/checkout/confirm` | body is Razorpay's success payload: `razorpay_order_id`, `razorpay_payment_id`, `razorpay_signature` (the HTTP client maps `ConfirmCheckoutRequest`) | `ConfirmCheckoutResponse` `{ checkoutId, checkoutStatus, paymentStatus, toPlanId, toInterval }` — the signature is verified server-side; `checkoutStatus: "paid"` once the plan is applied |
| `updatePaymentMethod(req)` | `POST /org/billing/payment-method` | `UpdatePaymentMethodRequest` | `PaymentMethodSummary` |
| `cancelPlan(req)` | `POST /org/billing/cancel` | `CancelPlanRequest` | `BillingOverview` |
| `undoCancel()` | `DELETE /org/billing/cancel` | — | `BillingOverview` |
| `scheduleDowngrade(req)` | `POST /org/billing/downgrade` | `ScheduleDowngradeRequest` (`interval?` for yearly → monthly) | `BillingOverview` |
| `undoDowngrade()` | `DELETE /org/billing/downgrade` | — | `BillingOverview` |
| `getRetentionChoices(req)` | `GET /org/billing/retention?targetPlanId=&requestId=` | `GetRetentionChoicesRequest` | `RetentionChoices` (`locked` = view-only for the org) |
| `saveRetentionChoices(req)` | `PUT /org/billing/retention` | `SaveRetentionChoicesRequest` | `RetentionChoices` (reject over-limit picks or a missing owner; `what_stays_locked` once decided) |
| `getAccessStatus()` | `GET /org/billing/access` | — | `AccessStatus` (paused users, view-only projects, offline landing pages, limits, modules) |
| `listInvoices(req)` | `GET /org/billing/v2/invoices?page=&pageSize=` (`/org/billing/invoices` is the legacy list) | `PageRequest` | `Paged<Invoice>` (invoices and credit notes; `pdfUrl` = signed link to the printable document) |
| `listPayments(req)` | `GET /org/billing/v2/payments?page=&pageSize=` | `PageRequest` | `Paged<PaymentRecord>` (plan payments: Razorpay + offline) |
| `listOrgCoupons()` | `GET /org/billing/coupons` | — | `OrgCoupon[]` (reserved for the org + open ones listed for customers, with the org's status) |
| `listOrgRequests(req)` | `GET /org/billing/requests?page=&pageSize=` (`billing:view`) | `PageRequest` (10 a page) | `Paged<OrgPlanRequest>` — newest first, approval requests and scheduled changes (`kind`); `status` pending / approved / rejected / withdrawn (stored as `cancelled`), or for a scheduled change scheduled / done / undone / replaced with `startsAt` and `reason`; `amount` before GST + `amountNote`; `decidedAt`; `rejectionReason` when rejected |
| `withdrawRequest(id)` | `POST /org/billing/requests/:id/withdraw` (`billing:edit`) | — | `BillingOverview` — the request becomes `cancelled` (shown as Withdrawn), its checkout `cancelled`; plan buttons work again. Refused once marked paid (`request_paid`) |

**Login refusal for a paused user** (not part of `BillingClient`): `POST /auth/login` returns
403 with `{ code: "account_paused", orgName, ownerName, planName, planUserLimit }`. The login
page shows the paused message (`frontend/lib/billing/paused.ts`).

## Super Admin

| Method | Endpoint | Request | Response |
|---|---|---|---|
| `listAdminPlans()` | `GET /admin/billing/plans` | — | `BillingPlan[]` (with `version` and `versions[]` per plan) |
| `previewAdminPlanSave(plan)` | `POST /admin/billing/plans/:id/preview` | `BillingPlan` | `PlanSavePreview` (a new version? who it affects — the save confirm) |
| `saveAdminPlan(plan)` | `PUT /admin/billing/plans/:id` | `BillingPlan` | `BillingPlan` (a price / limit / feature change creates the next version) |
| `listCoupons()` | `GET /admin/billing/coupons` | — | `CouponRow[]` |
| `getCoupon(code)` | `GET /admin/billing/coupons/:code` | — | `CouponDetail` |
| `saveCoupon(req)` | `POST /admin/billing/coupons` (new) · `PUT /admin/billing/coupons/:code` | `SaveCouponRequest` | `CouponRow` |
| `listOrgOptions()` | `GET /admin/billing/org-options` | — | `OrgOption[]` |
| `listSubscriptions(req)` | `GET /admin/billing/subscriptions` | `ListSubscriptionsRequest` | `SubscriptionList` (includes `countsByStatus` over all orgs) |
| `getSubscription(orgId)` | `GET /admin/billing/subscriptions/:orgId` | — | `SubscriptionDetail` |
| `getAdminRetentionChoices(req)` | `GET /admin/billing/subscriptions/:orgId/retention?targetPlanId=&requestId=` | `AdminRetentionRequest` | `RetentionChoices` (never locked; default target: the org's current plan) |
| `saveAdminRetentionChoices(req)` | `PUT /admin/billing/subscriptions/:orgId/retention` | `AdminSaveRetentionRequest` | `RetentionChoices` (applied at once when the org is on that plan; `request_closed` for a change that never applied) |
| `extendGrace(req)` | `POST /admin/billing/subscriptions/:orgId/extend-grace` | `ExtendGraceRequest` | `SubscriptionDetail` |
| `markPaidOffline(req)` | `POST /admin/billing/subscriptions/:orgId/offline-payment` | `MarkPaidOfflineRequest` | `SubscriptionDetail` |
| `applyCoupon(req)` | `POST /admin/billing/subscriptions/:orgId/coupon` | `ApplyCouponRequest` | `SubscriptionDetail` |
| `cancelSubscription(req)` | `POST /admin/billing/subscriptions/:orgId/cancel` | `AdminCancelRequest` | `SubscriptionDetail` |
| `listAdminPayments(req)` | `GET /admin/billing/payments` | `ListAdminPaymentsRequest` | `AdminPaymentList` |
| `refundPayment(req)` | `POST /admin/billing/payments/:id/refund` | `RefundPaymentRequest` | `RefundPaymentResponse` (full amount only; issue a credit note) |
| `getLifecycleSettings()` | `GET /admin/billing/lifecycle` | — | `LifecycleSettings` (incl. `reminders`, `warnings`) |
| `saveLifecycleSettings(s)` | `PUT /admin/billing/lifecycle` | `LifecycleSettings` | `LifecycleSettings` (`afterGrace` is ignored: always fall back to Basic) |
| `runLifecycleCheck()` | `POST /admin/billing/lifecycle/run` (`super_admin` only) | — | `LifecycleRunResult` |
| `getCompanyDetails()` | `GET /admin/billing/company` (`admin_settings`) | — | `CompanyDetails` |
| `saveCompanyDetails(d)` | `PUT /admin/billing/company` | `CompanyDetails` | `CompanyDetails` |
| `listAdminCheckouts(status?)` | `GET /admin/billing/checkouts?status=` | `CheckoutStatus` (default `needs_review`) | `AdminCheckoutRow[]` (latest 100) |

The legacy `GET /admin/package-change-requests` rows now include `billingCheckout` (amounts in
paise, buyer GSTIN/state) when the request came from a manual-mode checkout, plus `label`,
`overdue`, `payment` and `movedToBasicAt`. Manual mode adds `PUT` / `DELETE
/admin/package-change-requests/:id/payment` (Mark as paid; Super Admin) — approve
(`POST …/:id/approve`) needs it first for a request with a price.

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
| Plans · checkout · success · failure · downgrade · cancel · invoices · choose what stays · coupons | `/org/settings/billing/...` | `components/billing/{plans,checkout,checkout-result,plan-changes,invoices,choose-what-stays,coupons-org}.tsx` |
| Banners + renewal popup | org shell (`components/org/shell.tsx` → `BillingV2Root`) | `components/billing/banners.tsx` |
| Locked states | login, project detail, landing pages list, team chat composer, Users "Create user" | `components/billing/locked.tsx` |
| Admin plans | `/admin-console/subscriptions` → "Plans & Pricing Matrices" tab: plan cards (price, description, limit chips, Edit / Delete). Edit Plan → `/admin-console/subscriptions/plans/:id/edit`, the full form on its own page (`FormPage`) | `components/billing/admin/plans-editor.tsx` |
| Admin subscriptions · payments | `/admin-console/subscriptions` → "Organisation Subscriptions" and "Payments & Invoicing" tabs (flag on; the tabs stay); org detail at `/admin-console/subscriptions/org/:orgId` | `components/billing/admin/{subscriptions,payments}.tsx` |
| Admin coupons | `/admin-console/coupons` (+ `new`, `:code`, `:code/edit`) | `components/billing/admin/coupons.tsx` |
| Admin lifecycle (+ Run lifecycle check now) | `/admin-console/settings` and the Subscriptions "Expiry & Grace Policy" tab | `components/billing/admin/lifecycle.tsx` |
| Admin company & tax details | `/admin-console/settings#company-tax` (linked from the Expiry card and Integrations → Razorpay) | `components/billing/admin/company.tsx` |
| Admin "Paid — needs review" + checkout amounts on requests | `/admin-console/subscriptions` → Package Requests tab (flag on) | `components/billing/admin/checkouts-review.tsx` |
| Walkthroughs (always on, not in nav) | `/org/billing-walkthrough`, `/org/billing-walkthrough/banners`, `/admin-console/billing-walkthrough` | `components/billing/walkthrough/*` |

With the flag off, every edited page renders exactly what it did before, and the new
`/org/settings/billing/*`, `/admin-console/coupons*` and `/admin-console/subscriptions/org/*`
routes return 404.
