-- Billing v2, choose what stays: remember that templates were chosen, so
-- "keep none" (an empty template_ids) isn't read back as "no choice yet" (the
-- default picks). Choices saved before this keep today's reading (false).
-- Additive and guarded: a re-run is a no-op.

ALTER TABLE IF EXISTS "billing"."retention_choices"
  ADD COLUMN IF NOT EXISTS "templates_chosen" BOOLEAN NOT NULL DEFAULT false;
