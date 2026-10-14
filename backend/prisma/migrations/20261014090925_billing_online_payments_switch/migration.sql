-- Billing v2: Super Admin switch for online (Razorpay) plan payments.
-- Default off = upgrades go to Super Admin for manual approval, i.e. exactly
-- today's behaviour until someone turns it on.
--
-- Generated with `prisma migrate dev --create-only` against a throwaway
-- database built from the full migration history, then stripped to this one
-- column; the rest of the raw diff is pre-existing drift (see
-- docs/schema-drift-notes.md — primary_color / secondary_color are created at
-- runtime by PlatformConfigService.ensureTable) and is deliberately not
-- applied here. Additive and idempotent.

-- AlterTable
ALTER TABLE IF EXISTS "identity"."platform_configs"
  ADD COLUMN IF NOT EXISTS "online_payments_enabled" BOOLEAN NOT NULL DEFAULT false;
