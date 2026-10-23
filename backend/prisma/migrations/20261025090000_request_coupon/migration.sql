-- Manual mode: the Super Admin can add a coupon to a pending request (Mark as
-- paid dialog). The checkout's amounts are re-quoted with it; this keeps the
-- request's original amounts so "Remove" restores them. Null = no coupon was
-- added on the request. Guarded, re-runnable.
ALTER TABLE "billing"."billing_checkouts"
  ADD COLUMN IF NOT EXISTS "quote_before_coupon" JSONB;
