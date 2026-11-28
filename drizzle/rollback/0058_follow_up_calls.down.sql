-- Rollback of drizzle/0058_follow_up_calls.sql. Never picked up by scripts/migrate.ts (subfolder). Puts back the 0057 status
-- CHECK as NOT VALID, so call rows already written are kept (nothing is deleted) while new rows must use the old statuses.
SET LOCAL lock_timeout = '5s';
ALTER TABLE "admin_follow_ups" DROP CONSTRAINT IF EXISTS "admin_follow_ups_status_chk";
ALTER TABLE "admin_follow_ups" ADD CONSTRAINT "admin_follow_ups_status_chk" CHECK ("status" IN ('pending', 'followed_up', 'responded', 'no_response', 'escalated')) NOT VALID;
DELETE FROM "_ft_migrations" WHERE "name" = '0058_follow_up_calls.sql';
