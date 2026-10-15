-- Billing v2, step 5: coupons.
--   * coupons (Super Admin-defined discount codes) and coupon_redemptions
--     (one row per discounted payment)
--   * billing_checkouts.coupon_id / coupon_discount_paise — the coupon on a quote
--   * subscriptions.coupon_id / coupon_renewals_left — a first_n / forever
--     coupon still discounting renewals
--
-- Generated with `prisma migrate dev --create-only` against a throwaway
-- database built from the full migration history, then stripped to these
-- objects; the rest of the raw diff is pre-existing drift (see
-- docs/schema-drift-notes.md) and is deliberately not applied here.
-- Additive, and every statement is guarded so a re-run is a no-op.

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "billing"."CouponKind" AS ENUM ('percent', 'fixed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "billing"."CouponDuration" AS ENUM ('first_payment', 'first_n', 'forever');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "billing"."CouponIntervalScope" AS ENUM ('any', 'monthly', 'yearly');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AlterTable
ALTER TABLE IF EXISTS "billing"."billing_checkouts"
  ADD COLUMN IF NOT EXISTS "coupon_discount_paise" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "coupon_id" TEXT;

ALTER TABLE IF EXISTS "billing"."subscriptions"
  ADD COLUMN IF NOT EXISTS "coupon_id" TEXT,
  ADD COLUMN IF NOT EXISTS "coupon_renewals_left" INTEGER;

-- CreateTable
CREATE TABLE IF NOT EXISTS "billing"."coupons" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "kind" "billing"."CouponKind" NOT NULL,
    "percent_off" INTEGER,
    "amount_off_paise" INTEGER,
    "plan_ids" TEXT[],
    "interval" "billing"."CouponIntervalScope" NOT NULL DEFAULT 'any',
    "duration" "billing"."CouponDuration" NOT NULL,
    "duration_count" INTEGER,
    "valid_from" TIMESTAMP(3) NOT NULL,
    "valid_to" TIMESTAMP(3),
    "total_uses" INTEGER,
    "once_per_org" BOOLEAN NOT NULL DEFAULT true,
    "org_ids" TEXT[],
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coupons_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "billing"."coupon_redemptions" (
    "id" TEXT NOT NULL,
    "coupon_id" TEXT NOT NULL,
    "organisation_id" TEXT NOT NULL,
    "checkout_id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "discount_paise" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coupon_redemptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "coupons_code_key" ON "billing"."coupons"("code");
CREATE UNIQUE INDEX IF NOT EXISTS "coupon_redemptions_checkout_id_key" ON "billing"."coupon_redemptions"("checkout_id");
CREATE INDEX IF NOT EXISTS "coupon_redemptions_coupon_id_idx" ON "billing"."coupon_redemptions"("coupon_id");
CREATE INDEX IF NOT EXISTS "coupon_redemptions_organisation_id_idx" ON "billing"."coupon_redemptions"("organisation_id");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "billing"."billing_checkouts" ADD CONSTRAINT "billing_checkouts_coupon_id_fkey" FOREIGN KEY ("coupon_id") REFERENCES "billing"."coupons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "billing"."coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_coupon_id_fkey" FOREIGN KEY ("coupon_id") REFERENCES "billing"."coupons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
