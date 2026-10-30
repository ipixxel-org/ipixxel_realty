-- Billing v2 plan versions. Every change to a plan's price, limits or features
-- creates the next version; an org keeps the version it bought until its next
-- renewal (subscriptions.plan_version_id; null = the plan's latest).
-- Existing data: every plan gets a v1 from its current values, and every
-- subscription (and open checkout) points at its plan's v1.
-- Additive, and every statement is guarded so a re-run is a no-op.

CREATE TABLE IF NOT EXISTS "billing"."plan_versions" (
    "id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "price_monthly" INTEGER NOT NULL,
    "price_yearly" INTEGER NOT NULL,
    "limits" JSONB,
    "capabilities" JSONB NOT NULL DEFAULT '{}',
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "plan_versions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "plan_versions_plan_id_version_key"
    ON "billing"."plan_versions"("plan_id", "version");

DO $$ BEGIN
  ALTER TABLE "billing"."plan_versions"
    ADD CONSTRAINT "plan_versions_plan_id_fkey" FOREIGN KEY ("plan_id")
    REFERENCES "billing"."plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "billing"."subscriptions" ADD COLUMN IF NOT EXISTS "plan_version_id" TEXT;
ALTER TABLE "billing"."billing_checkouts" ADD COLUMN IF NOT EXISTS "plan_version_id" TEXT;

DO $$ BEGIN
  ALTER TABLE "billing"."subscriptions"
    ADD CONSTRAINT "subscriptions_plan_version_id_fkey" FOREIGN KEY ("plan_version_id")
    REFERENCES "billing"."plan_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "billing"."billing_checkouts"
    ADD CONSTRAINT "billing_checkouts_plan_version_id_fkey" FOREIGN KEY ("plan_version_id")
    REFERENCES "billing"."plan_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- v1 for every plan that has no version yet, from its current values.
INSERT INTO "billing"."plan_versions"
    ("id", "plan_id", "version", "price_monthly", "price_yearly", "limits", "capabilities", "created_at")
SELECT gen_random_uuid()::text, p."id", 1, p."price_monthly", p."price_yearly", p."limits", p."capabilities", CURRENT_TIMESTAMP
FROM "billing"."plans" p
WHERE NOT EXISTS (SELECT 1 FROM "billing"."plan_versions" v WHERE v."plan_id" = p."id");

-- Existing subscriptions and checkouts are on v1 of their plan.
UPDATE "billing"."subscriptions" s
SET "plan_version_id" = v."id"
FROM "billing"."plan_versions" v
WHERE s."plan_version_id" IS NULL AND v."plan_id" = s."plan_id" AND v."version" = 1;

UPDATE "billing"."billing_checkouts" c
SET "plan_version_id" = v."id"
FROM "billing"."plan_versions" v
WHERE c."plan_version_id" IS NULL AND v."plan_id" = c."to_plan_id" AND v."version" = 1;
