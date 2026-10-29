-- Landing pages keep the version visitors see separate from the one being
-- edited. landing_pages.published_content is a snapshot taken on Publish;
-- the public site serves it, so editing a live page no longer takes it
-- offline. Pages already live get their current content as the snapshot.
-- Additive, and every statement is guarded so a re-run is a no-op.

ALTER TABLE IF EXISTS "templates"."landing_pages"
  ADD COLUMN IF NOT EXISTS "published_content" JSONB;

UPDATE "templates"."landing_pages"
  SET "published_content" = "content"
  WHERE "status" = 'published' AND "published_content" IS NULL;
