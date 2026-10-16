-- Billing v2 fixes from testing:
--   * subscriptions.grace_extension_days — extra grace days a Super Admin
--     granted ("Extend grace"); grace end = renews_at + grace days + these
--   * coupons.show_to_customers — open coupons listed on the org's
--     Billing → Coupons page
--   * platform_configs.billing_reminders — which renewal reminders are on
--
-- Generated with `prisma migrate dev --create-only` against a throwaway
-- database built from the full migration history, then stripped to these
-- objects; the rest of the raw diff is pre-existing drift (see
-- docs/schema-drift-notes.md) and is deliberately not applied here.
-- Additive, and every statement is guarded so a re-run is a no-op.

ALTER TABLE "billing"."subscriptions" ADD COLUMN IF NOT EXISTS "grace_extension_days" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "billing"."coupons" ADD COLUMN IF NOT EXISTS "show_to_customers" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "identity"."platform_configs" ADD COLUMN IF NOT EXISTS "billing_reminders" JSONB;
