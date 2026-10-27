-- Billing v2: templates in "choose what stays".
--   * organisation_templates.billing_paused_at — a template assignment
--     paused because the org is on a plan with fewer templates. A paused
--     template can't be used for new landing pages; pages already made from
--     it are independent copies and stay as they are.
--   * retention_choices.template_ids — which templates the org chose to keep.
-- Additive, and every statement is guarded so a re-run is a no-op.

ALTER TABLE IF EXISTS "templates"."organisation_templates"
  ADD COLUMN IF NOT EXISTS "billing_paused_at" TIMESTAMP(3);

ALTER TABLE IF EXISTS "billing"."retention_choices"
  ADD COLUMN IF NOT EXISTS "template_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
