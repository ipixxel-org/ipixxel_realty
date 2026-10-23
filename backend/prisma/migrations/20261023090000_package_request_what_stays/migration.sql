-- Manual-mode plan change requests keep a copy of what the org chose to keep
-- on the target plan (shown on Settings -> Billing -> Requests). Guarded.
ALTER TABLE "billing"."package_change_requests" ADD COLUMN IF NOT EXISTS "what_stays" JSONB;
