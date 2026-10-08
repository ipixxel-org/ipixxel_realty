-- Team Chat rebuild (Phase 1). See docs/team-chat-investigation.md for the
-- bug IDs referenced below.
--
-- Safe to re-run: every DDL is guarded (IF [NOT] EXISTS, or a pg_constraint
-- lookup for constraints), and the data fixes only touch rows that still
-- need them. The whole script runs in one transaction, so a failure part-way
-- leaves the database exactly as it was.
--
-- Nothing is dropped except: the old (channel_id, created_at) message index
-- (replaced by one with an id tie-breaker), duplicate DM channels (their
-- messages and members are merged into the oldest copy first), and DM
-- memberships of anyone who isn't one of the DM's two participants (S1).

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. New columns
-- ---------------------------------------------------------------------------

ALTER TABLE "access"."team_channels"
  ADD COLUMN IF NOT EXISTS "dm_key" TEXT,
  ADD COLUMN IF NOT EXISTS "last_message_at" TIMESTAMP(3);
-- S4: a deleted user must not take their conversations with them.
ALTER TABLE "access"."team_channels" ALTER COLUMN "created_by_id" DROP NOT NULL;

ALTER TABLE "access"."team_channel_members"
  ADD COLUMN IF NOT EXISTS "org_id" TEXT,
  ADD COLUMN IF NOT EXISTS "role" TEXT NOT NULL DEFAULT 'member',
  ADD COLUMN IF NOT EXISTS "last_read_message_id" TEXT;

ALTER TABLE "access"."team_messages"
  ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL DEFAULT 'text',
  ADD COLUMN IF NOT EXISTS "parent_id" TEXT,
  ADD COLUMN IF NOT EXISTS "forwarded" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "edited_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "pinned_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "pinned_by_id" TEXT,
  ADD COLUMN IF NOT EXISTS "client_msg_id" TEXT;
-- S4: messages survive their sender's deletion.
ALTER TABLE "access"."team_messages" ALTER COLUMN "sender_id" DROP NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. Creator / sender: ON DELETE CASCADE -> SET NULL (S4)
-- ---------------------------------------------------------------------------

ALTER TABLE "access"."team_channels" DROP CONSTRAINT IF EXISTS "team_channels_created_by_id_fkey";
ALTER TABLE "access"."team_channels" ADD CONSTRAINT "team_channels_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "identity"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "access"."team_messages" DROP CONSTRAINT IF EXISTS "team_messages_sender_id_fkey";
ALTER TABLE "access"."team_messages" ADD CONSTRAINT "team_messages_sender_id_fkey"
  FOREIGN KEY ("sender_id") REFERENCES "identity"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 3. Members carry their org (tenant key on every chat table)
-- ---------------------------------------------------------------------------

UPDATE "access"."team_channel_members" m
SET "org_id" = c."org_id"
FROM "access"."team_channels" c
WHERE m."channel_id" = c."id" AND m."org_id" IS NULL;

ALTER TABLE "access"."team_channel_members" ALTER COLUMN "org_id" SET NOT NULL;

-- ---------------------------------------------------------------------------
-- 4. Existing DMs: dm_key, intruders, duplicates (B2/B4, S1)
-- ---------------------------------------------------------------------------

-- The original two participants were the creator and dm_user_id.
UPDATE "access"."team_channels"
SET "dm_key" = LEAST("created_by_id", "dm_user_id") || ':' || GREATEST("created_by_id", "dm_user_id")
WHERE "kind" = 'dm'
  AND "dm_key" IS NULL
  AND "created_by_id" IS NOT NULL
  AND "dm_user_id" IS NOT NULL
  AND "created_by_id" <> "dm_user_id";

DO $$
DECLARE
  n_intruders INTEGER;
  n_dupes INTEGER;
  n_unkeyed INTEGER;
BEGIN
  -- Anyone who auto-joined a DM through the old read/post endpoints (S1).
  DELETE FROM "access"."team_channel_members" m
  USING "access"."team_channels" c
  WHERE m."channel_id" = c."id"
    AND c."kind" = 'dm'
    AND c."dm_key" IS NOT NULL
    AND m."user_id" NOT IN (split_part(c."dm_key", ':', 1), split_part(c."dm_key", ':', 2));
  GET DIAGNOSTICS n_intruders = ROW_COUNT;

  -- Duplicate DMs for the same pair (B2): keep the oldest, move the rest in.
  CREATE TEMP TABLE "_team_chat_dm_dupes" ON COMMIT DROP AS
  SELECT "id", "keeper" FROM (
    SELECT "id",
           first_value("id") OVER (PARTITION BY "org_id", "dm_key" ORDER BY "created_at", "id") AS "keeper"
    FROM "access"."team_channels"
    WHERE "kind" = 'dm' AND "dm_key" IS NOT NULL
  ) ranked
  WHERE "id" <> "keeper";
  SELECT count(*) INTO n_dupes FROM "_team_chat_dm_dupes";

  UPDATE "access"."team_messages" msg
  SET "channel_id" = d."keeper"
  FROM "_team_chat_dm_dupes" d
  WHERE msg."channel_id" = d."id";

  INSERT INTO "access"."team_channel_members"
    ("channel_id", "user_id", "org_id", "role", "last_read_at", "joined_at")
  SELECT d."keeper", m."user_id", m."org_id", m."role", m."last_read_at", m."joined_at"
  FROM "access"."team_channel_members" m
  JOIN "_team_chat_dm_dupes" d ON d."id" = m."channel_id"
  ON CONFLICT ("channel_id", "user_id") DO NOTHING;

  DELETE FROM "access"."team_channels" c
  USING "_team_chat_dm_dupes" d
  WHERE c."id" = d."id";

  SELECT count(*) INTO n_unkeyed
  FROM "access"."team_channels"
  WHERE "kind" = 'dm' AND "dm_key" IS NULL;

  RAISE NOTICE 'team chat rebuild: removed % non-participant DM memberships, merged % duplicate DMs, % DMs left without dm_key (a participant was deleted)',
    n_intruders, n_dupes, n_unkeyed;
END $$;

-- ---------------------------------------------------------------------------
-- 5. Roles, rail ordering
-- ---------------------------------------------------------------------------

-- A channel's creator administers it.
UPDATE "access"."team_channel_members" m
SET "role" = 'admin'
FROM "access"."team_channels" c
WHERE m."channel_id" = c."id"
  AND c."kind" = 'channel'
  AND m."user_id" = c."created_by_id"
  AND m."role" <> 'admin';

UPDATE "access"."team_channels" c
SET "last_message_at" = latest."at"
FROM (
  SELECT "channel_id", max("created_at") AS "at"
  FROM "access"."team_messages"
  GROUP BY "channel_id"
) latest
WHERE c."id" = latest."channel_id" AND c."last_message_at" IS NULL;

-- ---------------------------------------------------------------------------
-- 6. General: one per org, every non-disabled member, no system messages
-- ---------------------------------------------------------------------------

INSERT INTO "access"."team_channels" ("id", "org_id", "kind", "name", "created_at", "updated_at")
SELECT gen_random_uuid()::text, o."id", 'general', 'General', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "identity"."organisations" o
WHERE NOT EXISTS (
  SELECT 1 FROM "access"."team_channels" c
  WHERE c."org_id" = o."id" AND c."kind" = 'general'
);

INSERT INTO "access"."team_channel_members" ("channel_id", "user_id", "org_id", "role", "joined_at")
SELECT c."id", u."id", u."org_id", 'member', CURRENT_TIMESTAMP
FROM "identity"."users" u
JOIN "access"."team_channels" c ON c."org_id" = u."org_id" AND c."kind" = 'general'
WHERE u."status" <> 'disabled'
ON CONFLICT ("channel_id", "user_id") DO NOTHING;

-- ---------------------------------------------------------------------------
-- 7. Allowed values (TEXT + CHECK rather than Prisma enums)
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'team_channels_kind_check') THEN
    ALTER TABLE "access"."team_channels"
      ADD CONSTRAINT "team_channels_kind_check" CHECK ("kind" IN ('general', 'channel', 'dm'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'team_channel_members_role_check') THEN
    ALTER TABLE "access"."team_channel_members"
      ADD CONSTRAINT "team_channel_members_role_check" CHECK ("role" IN ('admin', 'member'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'team_messages_kind_check') THEN
    ALTER TABLE "access"."team_messages"
      ADD CONSTRAINT "team_messages_kind_check" CHECK ("kind" IN ('text', 'system', 'file'));
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 8. New tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "access"."team_message_attachments" (
    "id" TEXT NOT NULL,
    "message_id" TEXT,
    "org_id" TEXT NOT NULL,
    "uploaded_by_id" TEXT,
    "storage_key" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "duration_sec" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_message_attachments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "access"."team_message_mentions" (
    "message_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,

    CONSTRAINT "team_message_mentions_pkey" PRIMARY KEY ("message_id", "user_id")
);

CREATE TABLE IF NOT EXISTS "access"."team_message_reactions" (
    "id" TEXT NOT NULL,
    "message_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_message_reactions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "access"."team_chat_presence" (
    "user_id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "last_seen_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "team_chat_presence_pkey" PRIMARY KEY ("user_id")
);

-- ---------------------------------------------------------------------------
-- 9. Indexes
-- ---------------------------------------------------------------------------

-- B7: (created_at, id) is the cursor; the old index had no tie-breaker.
DROP INDEX IF EXISTS "access"."team_messages_channel_id_created_at_idx";
CREATE INDEX IF NOT EXISTS "team_messages_channel_id_created_at_id_idx" ON "access"."team_messages"("channel_id", "created_at", "id");
CREATE INDEX IF NOT EXISTS "team_messages_parent_id_idx" ON "access"."team_messages"("parent_id");
-- B8: idempotent sends.
CREATE UNIQUE INDEX IF NOT EXISTS "team_messages_channel_id_client_msg_id_key" ON "access"."team_messages"("channel_id", "client_msg_id");

-- P4: rail ordering.
CREATE INDEX IF NOT EXISTS "team_channels_org_id_last_message_at_idx" ON "access"."team_channels"("org_id", "last_message_at");
-- B2: one DM per pair.
CREATE UNIQUE INDEX IF NOT EXISTS "team_channels_org_id_dm_key_key" ON "access"."team_channels"("org_id", "dm_key");
-- At most one General per org. Partial index: not representable in Prisma.
CREATE UNIQUE INDEX IF NOT EXISTS "team_channels_one_general_per_org" ON "access"."team_channels"("org_id") WHERE "kind" = 'general';

CREATE INDEX IF NOT EXISTS "team_channel_members_org_id_user_id_idx" ON "access"."team_channel_members"("org_id", "user_id");

CREATE INDEX IF NOT EXISTS "team_message_attachments_message_id_idx" ON "access"."team_message_attachments"("message_id");
CREATE INDEX IF NOT EXISTS "team_message_attachments_org_id_idx" ON "access"."team_message_attachments"("org_id");
CREATE INDEX IF NOT EXISTS "team_message_mentions_user_id_idx" ON "access"."team_message_mentions"("user_id");
CREATE INDEX IF NOT EXISTS "team_message_reactions_message_id_idx" ON "access"."team_message_reactions"("message_id");
CREATE UNIQUE INDEX IF NOT EXISTS "team_message_reactions_message_id_user_id_key" ON "access"."team_message_reactions"("message_id", "user_id");
CREATE INDEX IF NOT EXISTS "team_chat_presence_org_id_idx" ON "access"."team_chat_presence"("org_id");

-- ---------------------------------------------------------------------------
-- 10. Foreign keys (team_messages_org_id_fkey was in schema.prisma but never
--     created by the original team chat migration)
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  fk RECORD;
BEGIN
  FOR fk IN
    SELECT * FROM (VALUES
      ('team_messages_org_id_fkey', 'ALTER TABLE "access"."team_messages" ADD CONSTRAINT "team_messages_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "identity"."organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE'),
      ('team_messages_pinned_by_id_fkey', 'ALTER TABLE "access"."team_messages" ADD CONSTRAINT "team_messages_pinned_by_id_fkey" FOREIGN KEY ("pinned_by_id") REFERENCES "identity"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE'),
      ('team_messages_parent_id_fkey', 'ALTER TABLE "access"."team_messages" ADD CONSTRAINT "team_messages_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "access"."team_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE'),
      ('team_channel_members_org_id_fkey', 'ALTER TABLE "access"."team_channel_members" ADD CONSTRAINT "team_channel_members_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "identity"."organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE'),
      ('team_message_attachments_message_id_fkey', 'ALTER TABLE "access"."team_message_attachments" ADD CONSTRAINT "team_message_attachments_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "access"."team_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE'),
      ('team_message_attachments_org_id_fkey', 'ALTER TABLE "access"."team_message_attachments" ADD CONSTRAINT "team_message_attachments_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "identity"."organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE'),
      ('team_message_attachments_uploaded_by_id_fkey', 'ALTER TABLE "access"."team_message_attachments" ADD CONSTRAINT "team_message_attachments_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "identity"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE'),
      ('team_message_mentions_message_id_fkey', 'ALTER TABLE "access"."team_message_mentions" ADD CONSTRAINT "team_message_mentions_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "access"."team_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE'),
      ('team_message_mentions_user_id_fkey', 'ALTER TABLE "access"."team_message_mentions" ADD CONSTRAINT "team_message_mentions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "identity"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE'),
      ('team_message_mentions_org_id_fkey', 'ALTER TABLE "access"."team_message_mentions" ADD CONSTRAINT "team_message_mentions_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "identity"."organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE'),
      ('team_message_reactions_message_id_fkey', 'ALTER TABLE "access"."team_message_reactions" ADD CONSTRAINT "team_message_reactions_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "access"."team_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE'),
      ('team_message_reactions_user_id_fkey', 'ALTER TABLE "access"."team_message_reactions" ADD CONSTRAINT "team_message_reactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "identity"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE'),
      ('team_message_reactions_org_id_fkey', 'ALTER TABLE "access"."team_message_reactions" ADD CONSTRAINT "team_message_reactions_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "identity"."organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE'),
      ('team_chat_presence_user_id_fkey', 'ALTER TABLE "access"."team_chat_presence" ADD CONSTRAINT "team_chat_presence_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "identity"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE'),
      ('team_chat_presence_org_id_fkey', 'ALTER TABLE "access"."team_chat_presence" ADD CONSTRAINT "team_chat_presence_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "identity"."organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE')
    ) AS t(name, ddl)
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = fk.name) THEN
      EXECUTE fk.ddl;
    END IF;
  END LOOP;
END $$;

COMMIT;
