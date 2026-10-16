-- Billing v2, step 4: downgrades and cancellations at the end of the term.
--   * subscriptions.cancel_at_period_end / cancel_reason — move to the free
--     plan when the term ends
--   * subscriptions.scheduled_plan_id / scheduled_interval — switch to a
--     smaller plan (or monthly billing) when the term ends
--   * subscriptions.change_scheduled_at — when either was scheduled
--
-- Generated with `prisma migrate dev --create-only` against a throwaway
-- database built from the full migration history, then stripped to these
-- objects; the rest of the raw diff is pre-existing drift (see
-- docs/schema-drift-notes.md) and is deliberately not applied here.
-- Additive, and every statement is guarded so a re-run is a no-op.

-- AlterTable
ALTER TABLE IF EXISTS "billing"."subscriptions"
  ADD COLUMN IF NOT EXISTS "cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "cancel_reason" TEXT,
  ADD COLUMN IF NOT EXISTS "change_scheduled_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "scheduled_interval" "billing"."BillingCycle",
  ADD COLUMN IF NOT EXISTS "scheduled_plan_id" TEXT;
