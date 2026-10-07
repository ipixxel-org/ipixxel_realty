-- Builder version history: full-content snapshots of a page's saved state
-- (page_revisions) so the Version History panel can restore older versions.

CREATE TABLE IF NOT EXISTS "templates"."page_revisions" (
  "id" TEXT NOT NULL,
  "landing_page_id" TEXT,
  "template_id" TEXT,
  "org_id" TEXT,
  "content" JSONB NOT NULL,
  "label" TEXT NOT NULL DEFAULT '',
  "created_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "page_revisions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "page_revisions_landing_page_id_created_at_idx"
  ON "templates"."page_revisions"("landing_page_id", "created_at");

CREATE INDEX IF NOT EXISTS "page_revisions_template_id_created_at_idx"
  ON "templates"."page_revisions"("template_id", "created_at");

ALTER TABLE "templates"."page_revisions"
  DROP CONSTRAINT IF EXISTS "page_revisions_landing_page_id_fkey";

ALTER TABLE "templates"."page_revisions"
  ADD CONSTRAINT "page_revisions_landing_page_id_fkey"
  FOREIGN KEY ("landing_page_id") REFERENCES "templates"."landing_pages"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "templates"."page_revisions"
  DROP CONSTRAINT IF EXISTS "page_revisions_template_id_fkey";

ALTER TABLE "templates"."page_revisions"
  ADD CONSTRAINT "page_revisions_template_id_fkey"
  FOREIGN KEY ("template_id") REFERENCES "templates"."templates"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
