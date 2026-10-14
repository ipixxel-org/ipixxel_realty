-- Billing v2, step 2: buying and upgrading plans.
--   * platform_configs: the platform as GST seller (seller_*)
--   * PaymentPurpose 'plan_purchase'
--   * billing_profiles (the org as GST buyer) and billing_checkouts (quotes)
--
-- Generated with `prisma migrate dev --create-only` against a throwaway
-- database built from the full migration history, then stripped to these
-- objects; the rest of the raw diff is pre-existing drift (see
-- docs/schema-drift-notes.md) and is deliberately not applied here.
-- Additive, and every statement is guarded so a re-run is a no-op.

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "billing"."BillingCheckoutKind" AS ENUM ('new', 'upgrade_same_interval', 'interval_change');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "billing"."BillingCheckoutMode" AS ENUM ('online', 'manual');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "billing"."BillingCheckoutStatus" AS ENUM ('pending', 'paid', 'failed', 'expired', 'cancelled', 'approved', 'rejected', 'needs_review');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AlterEnum
ALTER TYPE "billing"."PaymentPurpose" ADD VALUE IF NOT EXISTS 'plan_purchase';

-- AlterTable
ALTER TABLE IF EXISTS "identity"."platform_configs"
  ADD COLUMN IF NOT EXISTS "seller_legal_name" TEXT,
  ADD COLUMN IF NOT EXISTS "seller_gstin" TEXT,
  ADD COLUMN IF NOT EXISTS "seller_state" TEXT,
  ADD COLUMN IF NOT EXISTS "seller_address_line1" TEXT,
  ADD COLUMN IF NOT EXISTS "seller_address_line2" TEXT,
  ADD COLUMN IF NOT EXISTS "seller_city" TEXT,
  ADD COLUMN IF NOT EXISTS "seller_pincode" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "billing"."billing_profiles" (
    "id" TEXT NOT NULL,
    "organisation_id" TEXT NOT NULL,
    "legal_name" TEXT NOT NULL,
    "address_line1" TEXT NOT NULL,
    "address_line2" TEXT,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "pincode" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'IN',
    "gstin" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "billing_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "billing"."billing_checkouts" (
    "id" TEXT NOT NULL,
    "organisation_id" TEXT NOT NULL,
    "from_plan_id" TEXT,
    "to_plan_id" TEXT NOT NULL,
    "from_interval" "billing"."BillingCycle",
    "to_interval" "billing"."BillingCycle" NOT NULL,
    "kind" "billing"."BillingCheckoutKind" NOT NULL,
    "subtotal_paise" INTEGER NOT NULL,
    "credit_paise" INTEGER NOT NULL,
    "taxable_paise" INTEGER NOT NULL,
    "cgst_paise" INTEGER NOT NULL,
    "sgst_paise" INTEGER NOT NULL,
    "igst_paise" INTEGER NOT NULL,
    "total_paise" INTEGER NOT NULL,
    "buyer_legal_name" TEXT NOT NULL,
    "buyer_state" TEXT NOT NULL,
    "buyer_gstin" TEXT,
    "seller_snapshot" JSONB NOT NULL,
    "mode" "billing"."BillingCheckoutMode" NOT NULL,
    "status" "billing"."BillingCheckoutStatus" NOT NULL DEFAULT 'pending',
    "payment_id" TEXT,
    "package_change_request_id" TEXT,
    "expires_at" TIMESTAMP(3),
    "created_by_id" TEXT NOT NULL,
    "fulfilled_at" TIMESTAMP(3),
    "review_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "billing_checkouts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "billing_profiles_organisation_id_key" ON "billing"."billing_profiles"("organisation_id");
CREATE UNIQUE INDEX IF NOT EXISTS "billing_checkouts_payment_id_key" ON "billing"."billing_checkouts"("payment_id");
CREATE UNIQUE INDEX IF NOT EXISTS "billing_checkouts_package_change_request_id_key" ON "billing"."billing_checkouts"("package_change_request_id");
CREATE INDEX IF NOT EXISTS "billing_checkouts_organisation_id_status_idx" ON "billing"."billing_checkouts"("organisation_id", "status");
CREATE INDEX IF NOT EXISTS "billing_checkouts_status_idx" ON "billing"."billing_checkouts"("status");

-- AddForeignKey (guarded: skipped when the constraint already exists)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'billing_profiles_organisation_id_fkey') THEN
    ALTER TABLE "billing"."billing_profiles" ADD CONSTRAINT "billing_profiles_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "identity"."organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'billing_checkouts_organisation_id_fkey') THEN
    ALTER TABLE "billing"."billing_checkouts" ADD CONSTRAINT "billing_checkouts_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "identity"."organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'billing_checkouts_from_plan_id_fkey') THEN
    ALTER TABLE "billing"."billing_checkouts" ADD CONSTRAINT "billing_checkouts_from_plan_id_fkey" FOREIGN KEY ("from_plan_id") REFERENCES "billing"."plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'billing_checkouts_to_plan_id_fkey') THEN
    ALTER TABLE "billing"."billing_checkouts" ADD CONSTRAINT "billing_checkouts_to_plan_id_fkey" FOREIGN KEY ("to_plan_id") REFERENCES "billing"."plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'billing_checkouts_payment_id_fkey') THEN
    ALTER TABLE "billing"."billing_checkouts" ADD CONSTRAINT "billing_checkouts_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "billing"."payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'billing_checkouts_package_change_request_id_fkey') THEN
    ALTER TABLE "billing"."billing_checkouts" ADD CONSTRAINT "billing_checkouts_package_change_request_id_fkey" FOREIGN KEY ("package_change_request_id") REFERENCES "billing"."package_change_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'billing_checkouts_created_by_id_fkey') THEN
    ALTER TABLE "billing"."billing_checkouts" ADD CONSTRAINT "billing_checkouts_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "identity"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
