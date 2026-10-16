-- Billing v2, step 3: paid renewals ("pay each time").
--   * BillingCheckoutKind 'renewal'
--   * billing_checkouts.from_renews_at — the subscription's renewsAt when a
--     renewal was quoted; a payment applies only while it still matches.
--
-- Generated with `prisma migrate dev --create-only` against a throwaway
-- database built from the full migration history, then stripped to these
-- objects; the rest of the raw diff is pre-existing drift (see
-- docs/schema-drift-notes.md) and is deliberately not applied here.
-- Additive, and every statement is guarded so a re-run is a no-op.

-- AlterEnum
ALTER TYPE "billing"."BillingCheckoutKind" ADD VALUE IF NOT EXISTS 'renewal';

-- AlterTable
ALTER TABLE IF EXISTS "billing"."billing_checkouts"
  ADD COLUMN IF NOT EXISTS "from_renews_at" TIMESTAMP(3);
