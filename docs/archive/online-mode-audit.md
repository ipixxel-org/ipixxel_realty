Online mode only partly follows the new flow. Plan direction, the paid-period rules, coupons, invoices and the "change scheduled" block already match manual mode. Five things don't:

1. Grace changes follow old rules.
2. "Choose what stays" is missing from the online checkout.
3. Online payments create no Requests row, so they can't show "View what stays" or count as the latest row.
4. An open checkout and a needs_review checkout don't block other changes.
5. The org action row still shows a standalone "Choose what stays".

I changed no code.

Audit

#: 1
Area: Plan direction
New-flow rule: Change plan always clickable; cards pick upgrade/downgrade by rank; wrong URL redirects
What online mode does today (file / function): "Change plan" is always a link (overview.tsx action row). Cards use planChangeRoute (lib/billing/direction.ts), which mirrors the backend's planChangeDirection.
Wrong URLs redirect both ways (checkout.tsx → downgrade; plan-changes.tsx → checkout).
Gap: none (except grace, row 3)
Proposed change: —
────────────────────────────────────────
#: 2a
Area: Paid period, bigger plan
New-flow rule: Pay the prorated difference now; applied on payment
What online mode does today (file / function): quoteCheckout gives upgrade_same_interval (prorated) or interval_change. fulfil → applyPaid → applyPlanChange runs on payment.captured.
Gap: none
Proposed change: —
────────────────────────────────────────
#: 2b
Area: Paid period, smaller plan / Basic
New-flow rule: Scheduled for the renewal date, nothing to pay, "Change to X scheduled", "Keep <plan>", no "cancel" wording
What online mode does today (file / function): scheduleDowngrade / cancel (billing-plan-change.service.ts) behave the same in both modes; recordScheduledChange writes the row; banners and undo are shared.
Gap: none
Proposed change: —
────────────────────────────────────────
#: 3a
Area: Grace, same plan
New-flow rule: Pay now (renewal)
What online mode does today (file / function): quoteRenewal + renewalPeriodEnd continue from renewsAt; Pay now is live online.
Gap: none
Proposed change: —
────────────────────────────────────────
#: 3b
Area: Grace, bigger paid plan
New-flow rule: Full price; period continues from the missed renewal date
What online mode does today (file / function): quoteKind: past_due isn't an "active paid plan", so the kind is new. The full price is right, but applyPlanChange uses freshRenewsAt (new period from today). The
overdue quote is manual-only (billing-checkout.service.ts ~861, mode.mode === 'manual'). A typed coupon also applies; manual uses the renewal coupon only (couponsEnabled: false).
Gap: big
Proposed change: Use quoteOverdueChange in both modes (kind renewal, overdue: true, continues from renewsAt, renewal-coupon rule).
────────────────────────────────────────
#: 3c
Area: Grace, smaller paid plan
New-flow rule: Same as 3b: pay the full price
What online mode does today (file / function): The UI routes smaller plans to /downgrade, because isOverdueManual is false online. The API then refuses: downgrade_not_now ("Your renewal is overdue. Renew your
plan first, or move to Basic."). So online can't change to a smaller paid plan in grace at all.
Gap: big
Proposed change: isOverdueManual → isOverdue (both modes): every paid plan goes to the checkout. Online, scheduleDowngrade in grace for a paid target sends the user to the checkout.
────────────────────────────────────────
#: 3d
Area: Grace, Basic
New-flow rule: Moves straight away, no payment
What online mode does today (file / function): cancel() moves immediately only when expired / paused / manualOverdue. Online it schedules for graceEndsAt, and DowngradeScreen shows "Takes effect <grace end>".
Gap: small
Proposed change: manualOverdue → "overdue, any mode", in cancel() and in DowngradeScreen's now.
────────────────────────────────────────
#: 3e
Area: Grace end
New-flow rule: Fall back to Basic
What online mode does today (file / function): The lifecycle sweep does this in both modes (subscription-lifecycle.util.ts).
Gap: none
Proposed change: —
────────────────────────────────────────
#: 4a
Area: Radios on downgrade / Move to Basic
New-flow rule: Two options when over the limits; button disabled until one is picked
What online mode does today (file / function): WhatStaysOptions in DowngradeScreen works in any mode; the backend checks with assertWhatStaysConfirmed.
Gap: none
Proposed change: —
────────────────────────────────────────
#: 4b
Area: Radios at the online checkout (grace change)
New-flow rule: Same radios and same disabled button
What online mode does today (file / function): usageFor returns usageConflict only in manual mode (~931). Online it returns usageError: start is refused with plan_too_small and the page shows "Choose a bigger
plan". My fallback from the last round is gated on !online.
Gap: big
Proposed change: usageFor: return usageConflict in both modes. Drop the !online gate. start already calls refuseUnlessPicked before splitting by mode, so the API check carries over.
────────────────────────────────────────
#: 4c
Area: Save → back to the checkout with fresh data
New-flow rule: —
What online mode does today (file / function): Generic (ChooseWhatStaysPage, no-store); works online once 4b shows the radios.
Gap: none (after 4b)
Proposed change: —
────────────────────────────────────────
#: 4d
Area: The picked option is used
New-flow rule: Default picks drop an earlier saved choice; the row keeps a copy
What online mode does today (file / function): startOnline ignores the choice. applyWhatStaysChoice and saveWhatStays run only in startManual.
Gap: big
Proposed change: Store whatStaysChoice on the checkout. At fulfil (= Approve): applyWhatStaysChoice, then the applied copy on the row.
────────────────────────────────────────
#: 4e
Area: Paid, but the choice no longer fits
New-flow rule: needs_review, not a silent failure
What online mode does today (file / function): applyPaid uses the strict assertPlanFitsCurrentUsage, so any over-limit payment goes to needs_review (Super Admins notified; the org sees the pending banner). Not
silent, but once 4b is on every over-limit payment would land in review.
Gap: big (with 4b)
Proposed change: Use assertPlanFitsAfterRetention, plus "saved choice still fits" when choice = saved. Otherwise needs_review with a clear reason.
────────────────────────────────────────
#: 5
Area: Lock rules
New-flow rule: Editable until payment completes / the change takes effect; then view-only with the support note; Super Admin edits the latest row only
What online mode does today (file / function): Without a requestId, whatStaysLockedForOrg locks once the org is on the target plan. So it's editable before payment and locked after, which is correct. But with
no online row, nothing ties the change to a row. Super Admin edits through the standalone button (whatStaysOrgLevel, from currentPlanSetByRow), which can pick up an older row for the same plan.
Gap: small (fixed by 6)
Proposed change: Covered by the online rows.
────────────────────────────────────────
#: 6
Area: Requests / history rows
New-flow rule: Every change is a row, so "View what stays" and the latest-row rule have a row
What online mode does today (file / function): listRequests (billing-ledger.service.ts) reads only package_change_requests. Online purchases, renewals and grace changes create only a billing_checkouts row, so
they're invisible there. Only scheduled changes show. latestRequest ignores online payments.
Gap: big
Proposed change: Proposal below.
────────────────────────────────────────
#: 7a
Area: A scheduled change blocks other changes
New-flow rule: change_scheduled
What online mode does today (file / function): scheduledChangeBlock runs at checkout start (all except renewal), scheduleDowngrade and cancel; the UI uses planChangeBlock. Both modes.
Gap: none
Proposed change: —
────────────────────────────────────────
#: 7b
Area: Open Razorpay checkout (< 30 min)
New-flow rule: One change at a time
What online mode does today (file / function): Starting another checkout cancels the older pending ones in the database (advisory lock), but the old Razorpay order can still be paid. applyPaid doesn't skip
cancelled (it skips only paid / approved / needs_review), so paying in the old tab applies the old quote. Scheduling a downgrade or Basic while an order is open isn't checked. If the order is paid later, the
upgrade applies and replaces the scheduled change.
Gap: small
Proposed change: scheduleDowngrade / cancel cancel open online checkouts (or refuse with "Finish or close the payment first"). A payment on a cancelled / superseded checkout goes to needs_review ("paid after a
newer checkout"). Needs a decision.
────────────────────────────────────────
#: 7c
Area: needs_review blocks changes
New-flow rule: Blocks until a Super Admin resolves it
What online mode does today (file / function): Only the checkout button is disabled (pendingUpgrade), and not for renewals. Plan cards aren't blocked (blockingRequest checks pending_approval only). The API
doesn't refuse start, downgrade or cancel. Super Admin "Mark paid offline" is refused only with a pending request row.
Gap: small
Proposed change: Add a payment_review block in planChangeBlock (backend and frontend), plus refusals at start (non-renewal), scheduleDowngrade, cancel and Mark paid offline.
────────────────────────────────────────
#: 8
Area: Coupons
New-flow rule: At checkout and on renewals; 100% → activated without Razorpay
What online mode does today (file / function): Preview/start handle coupons, withRenewalCoupon covers renewals, and activateFree handles ₹0 in either mode before the mode split. Online totals under ₹1 →
amount_too_small.
Gap: none (the grace-change coupon rule is in 3b)
Proposed change: —
────────────────────────────────────────
#: 9a
Area: Super Admin action row (online)
New-flow rule: Extend grace, Move to Basic, Choose what stays (standalone), Mark paid offline, Apply coupon
What online mode does today (file / function): All present: viaRequest hides offline/coupon only in manual mode, and the standalone button follows whatStaysOrgLevel.
Gap: none
Proposed change: —
────────────────────────────────────────
#: 9b
Area: Section order
New-flow rule: Same as manual
What online mode does today (file / function): Same component in both modes (built last round).
Gap: none
Proposed change: —
────────────────────────────────────────
#: 9c
Area: Package requests section (online)
New-flow rule: Online payments listed with what stays; no Approve / Reject
What online mode does today (file / function): Shows only scheduled-change rows and older manual rows, read-only. Online payments appear only under Payments. needs_review checkouts appear only in Subscriptions
→ Package Requests tab ("Paid — needs review", checkouts-review.tsx), not on the org page.
Gap: medium
Proposed change: Show online rows (proposal below), read-only, with what stays on the latest row and a "Needs review" tag that links to that list.
────────────────────────────────────────
#: 10
Area: Invoice + email once; Download invoice; failed / closed changes nothing
New-flow rule: —
What online mode does today (file / function): The invoice is issued in the fulfil transaction. The email is sent once (emailed_at claim). The success page finds the invoice by Invoice.checkoutId. onFailed →
failed. Closing the popup leaves the checkout pending until it expires after 30 min. ₹0 has no invoice.
Gap: none
Proposed change: —
────────────────────────────────────────
#: 11
Area: Timing / reminders / Pay now amount
New-flow rule: IST whole days; reminders with "Pay now"; "₹X + GST"
What online mode does today (file / function): IST isn't done: dates are still the UTC calendar day (Step 1 note; nothing in billing uses IST). Reminders are in-app with "Pay now to keep your plan" in both
modes (subscription-lifecycle.util.ts) and carry no amount. The UI shows "₹X + GST" (packagePriceText / renewalPriceText).
Gap: IST: big (its own task); rest none
Proposed change: IST as a separate prompt. Optionally put "₹X + GST" in the reminder text.
────────────────────────────────────────
#: 12
Area: Manual-only checks that should apply to both modes
New-flow rule: —
What online mode does today (file / function): See the list below.
Gap: —
Proposed change: —

Item 12: checks that should become mode-independent
- billing-checkout.service.ts ~861, quote(): overdue change (quoteOverdueChange) is manual-only. Should apply to both (3b).
- billing-checkout.service.ts ~931, usageFor(): usageConflict is manual-only. Should apply to both (4b).
- billing-checkout.service.ts: applyWhatStaysChoice and saveWhatStays run only in startManual. Online needs them at fulfil (4d).
- applyPaid: the strict assertPlanFitsCurrentUsage, where approval uses assertPlanFitsAfterRetention (4e).
- billing-plan-change.service.ts, manualOverdue(): Basic straight away in grace and the paid-plan-in-grace path. Basic should apply to both; a paid plan in grace online goes to the checkout (3c, 3d).
- Frontend isOverdueManual (direction.ts), used in plans.tsx and plan-changes.tsx: grace routing should apply to both. The labels ("Pay now" vs "Request renewal") stay by live.
- Frontend checkout.tsx: the !online gate on the over-limit fallback.
- Frontend overview.tsx: the standalone "Choose what stays" shows when paymentMode !== "manual". It should be hidden in both modes ("one place"), keeping the locked note on Basic.
- Correctly manual-only, keep as is: refuseInManualMode (Mark paid offline / Apply coupon), the Mark as paid / Approve / Reject UI, "Request renewal".

Proposal: online rows (area 6)
- Where: package_change_requests, new kind online_payment, created in startOnline and linked through billing_checkouts.package_change_request_id (the column exists). That makes latestRequest, whatStays copies, the View button and the admin lists work without merging two tables.
- Statuses: add awaiting_payment and needs_review (an enum migration, guarded). Reuse approved (paid), cancelled (failed, expired or superseded; the label comes from the checkout's status). Avoid pending, so request_pending and every status: 'pending' query stay untouched.
- How a row looks (org and Super Admin):
  - "Change to Pro" / "Renewal of Pro" / "Change to Growth · overdue renewal"
  - Status tag: "Waiting for payment" (open order), "Paid online · 27 Oct", "Payment failed", "Expired (not paid)", "Needs review"
  - "₹1,499 − ₹300 coupon + GST", Razorpay order ID, and "Invoice" (signed link) once paid
  - What stays: "Keeps 3 of 5 projects" + Change what stays (latest and open) / View
  - No Approve, Reject or Mark as paid. Super Admin "Needs review" links to the review list.
- Fulfil: approved plus the applied what-stays copy, like Approve. onFailed / expiry / superseded → cancelled. Review → needs_review.
- Super Admin: currentPlanSetByRow then also covers online payments, so the standalone button shows only when the plan was assigned directly or by an automatic move.

Suggested build prompts, in order

1. Grace changes online follow the manual rules.
   - Backend: overdue change quote in both modes (kind renewal, full price, continues from the missed renewsAt, renewal-coupon rule); Basic in grace moves at once in both modes; scheduleDowngrade in grace with a paid target never refuses online (the UI won't call it).
   - Frontend: isOverdue routing in both modes (every paid plan → checkout, labelled "Pay now" or "Change plan"; Basic → "Move to Basic now?").
2. "Choose what stays" at the online checkout.
   - usageFor returns usageConflict in both modes; drop the frontend !online gate.
   - Store whatStaysChoice on the checkout (small migration).
   - Fulfil = Approve: assertPlanFitsAfterRetention, a fit check for saved, applyWhatStaysChoice, then applyRetention; otherwise needs_review with a reason.
3. Online rows in Requests and Package requests. The online_payment kind and two statuses (migration). Create, update and close the rows from start, fulfil, failure, expiry and supersede; list fields (label, status tag, order ID, invoice link, what stays). Admin rows read-only. The latest-row rule and currentPlanSetByRow then cover online payments.
4. Blocking and clean-ups.
   - needs_review blocks plan changes (payment_review reason, API refusals, Mark paid offline refused).
   - An open checkout is cancelled (or the change refused) when a downgrade or Basic is scheduled.
   - A payment on a superseded checkout → needs_review.
   - Hide the org's standalone "Choose what stays" in online mode.
   - Update the contract doc.
5. (Separate) IST whole-day timing, and optionally "₹X + GST" in the reminder text.

Razorpay test-mode checks per step

Setup for all steps:
- Switch on, with rzp_test_ keys.
- ngrok webhook to /webhooks/razorpay.
- Test card 4111 1111 1111 1111 (any future expiry and CVV). UPI success@razorpay / failure@razorpay.
- BILLING_CLOCK_OVERRIDE to step into the renewal window, grace and grace end.

Step 1
- In grace, buy a bigger plan: the amount is the full price + GST, and after paying, renewsAt = missed renewal date + one period, not today + one period.
- In grace, pick a smaller paid plan: it goes to the checkout (not /downgrade), you pay the full price, and the period continues from the missed date.
- In grace, pick Basic: "Move to Basic now?", it applies at once, extras are paused, no payment.
- In grace, same plan: Pay now renews from the missed date.
- With the subscription still active: upgrade proration and the scheduled downgrade are unchanged.
- In grace, a typed coupon isn't offered; a renewal coupon on the subscription still applies.

Step 2
- Over the target's limits in grace: radios show, "Pay" is disabled, and becomes enabled after a pick.
- "I'll choose" → Choose what stays → Save → back on the checkout with "I'll choose" selected and fresh lists.
- Pay with "Keep the default picks": the default picks applied, and an earlier saved choice is dropped.
- Pay with "I'll choose": exactly the saved picks stay.
- Add a user while the Razorpay popup is open, then pay: needs_review with a clear reason, Super Admin notified, the plan not applied.
- A closed or failed payment leaves the choice and the plan unchanged.

Step 3
- Each of these shows a row with the right tag, order ID and invoice link: a purchase, a renewal, a grace change, a failed payment (failure@razorpay), an expired one (leave the popup open for 30+ min, or move the clock), and a needs_review one.
- The latest online row has "Change what stays" while waiting for payment, and View after.
- Older rows show the history header.
- Super Admin can edit only the latest row.
- The standalone button is hidden after an online purchase.
- Scheduled rows and manual rows look the same as before.
- Turning the switch off (manual mode) still works with the online rows present.

Step 4
- With a needs_review checkout: plan cards are disabled with the message, start / downgrade / cancel are refused by the API, renewal still works, and Super Admin Mark paid offline is refused.
- Start a checkout, then schedule Basic in another tab: the open order is cancelled, or the change is refused (whichever you choose). Pay the old order: needs_review, not applied.
- Two tabs, two orders: paying the older one never applies twice.
- The org action row in online mode has no standalone "Choose what stays".
