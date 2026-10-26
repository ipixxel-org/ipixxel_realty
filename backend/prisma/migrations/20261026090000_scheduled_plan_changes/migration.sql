-- Scheduled plan changes (to Basic, or to a smaller plan / yearly → monthly)
-- are recorded in package_change_requests as kind 'scheduled_change', so they
-- show in Settings → Billing → Requests. No approval: their statuses are
-- scheduled → done / undone / replaced, never 'pending'.
-- Additive, and every statement is guarded so a re-run is a no-op.

DO $$ BEGIN
  CREATE TYPE "billing"."PackageChangeRequestKind" AS ENUM ('request', 'scheduled_change');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TYPE "billing"."PackageChangeRequestStatus" ADD VALUE IF NOT EXISTS 'scheduled';
ALTER TYPE "billing"."PackageChangeRequestStatus" ADD VALUE IF NOT EXISTS 'done';
ALTER TYPE "billing"."PackageChangeRequestStatus" ADD VALUE IF NOT EXISTS 'undone';
ALTER TYPE "billing"."PackageChangeRequestStatus" ADD VALUE IF NOT EXISTS 'replaced';

ALTER TABLE "billing"."package_change_requests"
  ADD COLUMN IF NOT EXISTS "kind" "billing"."PackageChangeRequestKind" NOT NULL DEFAULT 'request',
  ADD COLUMN IF NOT EXISTS "reason" TEXT,
  ADD COLUMN IF NOT EXISTS "starts_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "scheduled_amount" INTEGER;
