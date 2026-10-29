-- Billing v2, online step 3: every online payment gets a row in
-- package_change_requests (kind 'online_payment', linked through
-- billing_checkouts.package_change_request_id), so it shows on Settings →
-- Billing → Requests and the Super Admin's Package requests, and counts as
-- the org's latest row for "choose what stays".
-- Statuses: awaiting_payment (open order) → approved (paid) / cancelled
-- (failed, expired or replaced by a newer checkout) / needs_review. Never
-- 'pending', so "one pending request" is untouched.
-- Additive, and every statement is guarded so a re-run is a no-op.

ALTER TYPE "billing"."PackageChangeRequestKind" ADD VALUE IF NOT EXISTS 'online_payment';
ALTER TYPE "billing"."PackageChangeRequestStatus" ADD VALUE IF NOT EXISTS 'awaiting_payment';
ALTER TYPE "billing"."PackageChangeRequestStatus" ADD VALUE IF NOT EXISTS 'needs_review';
