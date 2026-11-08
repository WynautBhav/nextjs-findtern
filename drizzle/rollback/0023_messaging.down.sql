-- Rollback of drizzle/0023_messaging.sql. Never picked up by scripts/migrate.ts (subfolder).
-- Run as one transaction against an explicit scratch/target DATABASE_URL, e.g. psql "$DATABASE_URL" -1 -f <this file>.
-- DESTROYS DATA: drops all message threads, messages, presence, realtime events and notification preferences. Roll back 0027 first: it adds user_presence.show_activity and this file drops that table.
-- Roll back in reverse number order (0027 first). Run ONLY AFTER the code that uses it is reverted and deployed.
SET LOCAL lock_timeout = '5s';
DROP TABLE IF EXISTS "notification_prefs";
DROP TABLE IF EXISTS "realtime_events";
DROP TABLE IF EXISTS "user_presence";
DROP TABLE IF EXISTS "messages";
DROP TABLE IF EXISTS "threads";
DELETE FROM "_ft_migrations" WHERE "name" = '0023_messaging.sql';
