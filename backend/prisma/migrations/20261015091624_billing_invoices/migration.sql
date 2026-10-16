-- Billing v2, step 7: invoices, credit notes and offline payments.
--   * invoices (GST tax invoices and credit notes) + invoice_counters (numbering
--     per financial year)
--   * offline_payments — plan payments a Super Admin records ("mark paid offline")
--
-- Generated with `prisma migrate dev --create-only` against a throwaway
-- database built from the full migration history, then stripped to these
-- objects; the rest of the raw diff is pre-existing drift (see
-- docs/schema-drift-notes.md) and is deliberately not applied here.
-- Additive, and every statement is guarded so a re-run is a no-op.

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "billing"."InvoiceKind" AS ENUM ('invoice', 'credit_note');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "billing"."InvoiceStatus" AS ENUM ('paid', 'refunded', 'void');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "billing"."invoices" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "kind" "billing"."InvoiceKind" NOT NULL DEFAULT 'invoice',
    "status" "billing"."InvoiceStatus" NOT NULL DEFAULT 'paid',
    "organisation_id" TEXT NOT NULL,
    "checkout_id" TEXT,
    "payment_id" TEXT,
    "offline_payment_id" TEXT,
    "credit_for_id" TEXT,
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "description" TEXT NOT NULL,
    "seller" JSONB NOT NULL,
    "buyer" JSONB NOT NULL,
    "subtotal_paise" INTEGER NOT NULL,
    "discount_paise" INTEGER NOT NULL DEFAULT 0,
    "taxable_paise" INTEGER NOT NULL,
    "cgst_paise" INTEGER NOT NULL,
    "sgst_paise" INTEGER NOT NULL,
    "igst_paise" INTEGER NOT NULL,
    "total_paise" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "billing"."invoice_counters" (
    "series" TEXT NOT NULL,
    "next" INTEGER NOT NULL,

    CONSTRAINT "invoice_counters_pkey" PRIMARY KEY ("series")
);

CREATE TABLE IF NOT EXISTS "billing"."offline_payments" (
    "id" TEXT NOT NULL,
    "organisation_id" TEXT NOT NULL,
    "amount_paise" INTEGER NOT NULL,
    "method" TEXT NOT NULL,
    "reference" TEXT NOT NULL DEFAULT '',
    "received_on" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'received',
    "recorded_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "offline_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "invoices_number_key" ON "billing"."invoices"("number");
CREATE INDEX IF NOT EXISTS "invoices_organisation_id_idx" ON "billing"."invoices"("organisation_id");
CREATE INDEX IF NOT EXISTS "invoices_checkout_id_idx" ON "billing"."invoices"("checkout_id");
CREATE INDEX IF NOT EXISTS "invoices_payment_id_idx" ON "billing"."invoices"("payment_id");
CREATE INDEX IF NOT EXISTS "offline_payments_organisation_id_idx" ON "billing"."offline_payments"("organisation_id");
