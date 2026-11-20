-- Rollback of drizzle/0043_meeting_proposals.sql. Never picked up by scripts/migrate.ts (subfolder).
-- Run as one transaction against an explicit scratch/target DATABASE_URL.
-- Drops the six columns: who proposed, round, respond-by, cancel reason/by and gate tokens are lost
-- (an intern-proposed meeting reads as employer-proposed afterwards). Slots, status and links are untouched.
SET LOCAL lock_timeout = '5s';
DROP INDEX IF EXISTS "interviews_gate_token_uniq";
ALTER TABLE "interviews" DROP COLUMN IF EXISTS "gate_token";
ALTER TABLE "interviews" DROP COLUMN IF EXISTS "cancel_reason";
ALTER TABLE "interviews" DROP COLUMN IF EXISTS "cancelled_by";
ALTER TABLE "interviews" DROP COLUMN IF EXISTS "respond_by";
ALTER TABLE "interviews" DROP COLUMN IF EXISTS "round";
ALTER TABLE "interviews" DROP COLUMN IF EXISTS "proposed_by";
DELETE FROM "_ft_migrations" WHERE "name" = '0043_meeting_proposals.sql';
