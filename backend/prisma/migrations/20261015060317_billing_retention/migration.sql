-- Billing v2, step 6: "choose what stays" and fall back to Basic.
--   * users.billing_paused_at, projects.billing_view_only_at,
--     landing_pages.billing_offline_at — what's paused on a smaller plan
--   * subscriptions.moved_to_basic_at / previous_plan_id / previous_interval
--     — the paid plan the org moved down from
--   * retention_choices — what the org chose to keep on a smaller plan
--
-- Generated with `prisma migrate dev --create-only` against a throwaway
-- database built from the full migration history, then stripped to these
-- objects; the rest of the raw diff is pre-existing drift (see
-- docs/schema-drift-notes.md) and is deliberately not applied here.
-- Additive, and every statement is guarded so a re-run is a no-op.

-- AlterTable
ALTER TABLE IF EXISTS "billing"."subscriptions"
  ADD COLUMN IF NOT EXISTS "moved_to_basic_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "previous_interval" "billing"."BillingCycle",
  ADD COLUMN IF NOT EXISTS "previous_plan_id" TEXT;

ALTER TABLE IF EXISTS "identity"."users"
  ADD COLUMN IF NOT EXISTS "billing_paused_at" TIMESTAMP(3);

ALTER TABLE IF EXISTS "projects"."projects"
  ADD COLUMN IF NOT EXISTS "billing_view_only_at" TIMESTAMP(3);

ALTER TABLE IF EXISTS "templates"."landing_pages"
  ADD COLUMN IF NOT EXISTS "billing_offline_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE IF NOT EXISTS "billing"."retention_choices" (
    "id" TEXT NOT NULL,
    "organisation_id" TEXT NOT NULL,
    "target_plan_id" TEXT NOT NULL,
    "user_ids" TEXT[],
    "project_ids" TEXT[],
    "landing_page_ids" TEXT[],
    "updated_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "retention_choices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "retention_choices_organisation_id_key" ON "billing"."retention_choices"("organisation_id");
