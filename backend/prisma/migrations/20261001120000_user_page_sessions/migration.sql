-- Page presence for the Super Admin "Live now" / stuck-user card.
-- Hand-written and guarded so it is safe to apply on any environment.

CREATE SCHEMA IF NOT EXISTS "audit";

CREATE TABLE IF NOT EXISTS "audit"."user_page_sessions" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "org_id" TEXT NOT NULL,
  "route" TEXT NOT NULL,
  "session_id" TEXT NOT NULL,
  "entered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_heartbeat_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_interaction_at" TIMESTAMP(3),
  "visible" BOOLEAN NOT NULL DEFAULT true,
  "error_count" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'active',
  CONSTRAINT "user_page_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "user_page_sessions_session_id_key"
  ON "audit"."user_page_sessions"("session_id");

CREATE INDEX IF NOT EXISTS "user_page_sessions_status_last_heartbeat_at_idx"
  ON "audit"."user_page_sessions"("status", "last_heartbeat_at");
