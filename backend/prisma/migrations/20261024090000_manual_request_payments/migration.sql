-- Manual mode: the Super Admin marks a plan change request as paid before
-- approving it. The payment is an offline payment linked to the request
-- (status awaiting_approval → received on approval, refund_due on reject).
-- Requests also record when the org fell back to Basic while waiting.
-- Guarded, re-runnable.
ALTER TABLE "billing"."offline_payments"
  ADD COLUMN IF NOT EXISTS "package_change_request_id" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "offline_payments_package_change_request_id_key"
  ON "billing"."offline_payments"("package_change_request_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'offline_payments_package_change_request_id_fkey'
  ) THEN
    ALTER TABLE "billing"."offline_payments"
      ADD CONSTRAINT "offline_payments_package_change_request_id_fkey"
      FOREIGN KEY ("package_change_request_id")
      REFERENCES "billing"."package_change_requests" ("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "billing"."package_change_requests"
  ADD COLUMN IF NOT EXISTS "moved_to_basic_at" TIMESTAMP(3);

-- A request quoted while the renewal was overdue ("overdue renewal" tag).
ALTER TABLE "billing"."billing_checkouts"
  ADD COLUMN IF NOT EXISTS "overdue" BOOLEAN NOT NULL DEFAULT false;
