-- Rollback of drizzle/0045_meeting_transcripts.sql. Never picked up by scripts/migrate.ts (subfolder).
-- Run as one transaction against an explicit scratch/target DATABASE_URL.
-- Drops every stored transcript, summary, flag and review outcome (account_strikes rows made from a review stay; they only lose the link).
SET LOCAL lock_timeout = '5s';
DROP TABLE IF EXISTS "meeting_transcripts";
DELETE FROM "_ft_migrations" WHERE "name" = '0045_meeting_transcripts.sql';
