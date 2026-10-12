-- Razorpay credentials editable from Super Admin → Integrations → Razorpay.
--
-- Generated with `prisma migrate dev --create-only` against a throwaway
-- database built from the full migration history, then stripped to this one
-- table; the rest of the raw diff is pre-existing drift (see
-- docs/schema-drift-notes.md) and is deliberately not applied here.
-- Additive and idempotent.

-- CreateTable
CREATE TABLE IF NOT EXISTS "billing"."razorpay_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "key_id" TEXT,
    "key_secret" TEXT,
    "webhook_secret" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "updated_by_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "razorpay_settings_pkey" PRIMARY KEY ("id")
);
