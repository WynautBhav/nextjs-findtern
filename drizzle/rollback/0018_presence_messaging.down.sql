-- Rollback of drizzle/0018_presence_messaging.sql. Never picked up by scripts/migrate.ts (subfolder).
-- Run as one transaction against an explicit DATABASE_URL, e.g. psql "$DATABASE_URL" -1 -f <this file>.
-- Roll back 0021, 0020, 0019 first. Drops every message: export first if the data matters.
SET LOCAL lock_timeout = '5s';
DROP TABLE IF EXISTS "messages";
DROP TABLE IF EXISTS "message_threads";
DROP TABLE IF EXISTS "user_presence";
DROP INDEX IF EXISTS "notifications_unread_idx";
DELETE FROM "_ft_migrations" WHERE "name" = '0018_presence_messaging.sql';
