-- Team Chat Phase 4: @mention notifications in the org member's bell.
-- Additive and safe to re-run.
ALTER TYPE "audit"."NotificationType" ADD VALUE IF NOT EXISTS 'team_chat_mention';
