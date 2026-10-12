-- Razorpay payments foundation: billing.payments + billing.webhook_events.
--
-- Generated with `prisma migrate dev --create-only` against a throwaway
-- database built from the full migration history, then stripped down to the
-- payments objects only. The raw diff also contained unrelated pre-existing
-- drift (see docs/schema-drift-notes.md: templates.category/is_paid drops,
-- media_files, marketing updated_at defaults, org_domain_requests columns),
-- which is deliberately NOT applied here.
--
-- Purely additive and idempotent: every statement is guarded so a re-run or a
-- database that already has some of these objects is safe.

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "billing"."PaymentStatus" AS ENUM ('created', 'pending', 'captured', 'failed', 'refunded');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "billing"."PaymentPurpose" AS ENUM ('test');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "billing"."payments" (
    "id" TEXT NOT NULL,
    "organisation_id" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" "billing"."PaymentStatus" NOT NULL DEFAULT 'created',
    "purpose" "billing"."PaymentPurpose" NOT NULL,
    "reference_type" TEXT,
    "reference_id" TEXT,
    "notes" JSONB,
    "razorpay_order_id" TEXT NOT NULL,
    "razorpay_payment_id" TEXT,
    "razorpay_signature" TEXT,
    "failure_reason" TEXT,
    "captured_at" TIMESTAMP(3),
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "billing"."webhook_events" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'razorpay',
    "event_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),
    "error" TEXT,

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "payments_razorpay_order_id_key" ON "billing"."payments"("razorpay_order_id");
CREATE INDEX IF NOT EXISTS "payments_organisation_id_idx" ON "billing"."payments"("organisation_id");
CREATE INDEX IF NOT EXISTS "payments_status_idx" ON "billing"."payments"("status");
CREATE INDEX IF NOT EXISTS "payments_reference_type_reference_id_idx" ON "billing"."payments"("reference_type", "reference_id");
CREATE UNIQUE INDEX IF NOT EXISTS "webhook_events_event_id_key" ON "billing"."webhook_events"("event_id");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "billing"."payments" ADD CONSTRAINT "payments_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "identity"."organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "billing"."payments" ADD CONSTRAINT "payments_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "identity"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
