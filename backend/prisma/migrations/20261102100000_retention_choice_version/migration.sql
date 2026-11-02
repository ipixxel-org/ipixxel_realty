-- Plan versions: a "choose what stays" answer for an upcoming version of the
-- org's own plan (lower limits). target_version_id says which version it
-- answers; default_picks marks "Keep the default picks". Existing rows: null
-- / false (not an answer to a version change).
-- Additive and guarded: a re-run is a no-op.

ALTER TABLE IF EXISTS "billing"."retention_choices"
  ADD COLUMN IF NOT EXISTS "target_version_id" TEXT;
ALTER TABLE IF EXISTS "billing"."retention_choices"
  ADD COLUMN IF NOT EXISTS "default_picks" BOOLEAN NOT NULL DEFAULT false;
