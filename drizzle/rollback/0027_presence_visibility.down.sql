-- Rollback of drizzle/0027_presence_visibility.sql. Never picked up by scripts/migrate.ts (subfolder).
-- Run as one transaction against an explicit scratch/target DATABASE_URL, e.g. psql "$DATABASE_URL" -1 -f <this file>.
-- Run ONLY AFTER the code that reads show_activity is reverted/deployed (otherwise the app errors on the missing column).
-- Drops every student's hide-activity choice: after this, employers see everyone's presence again.
SET LOCAL lock_timeout = '5s';
ALTER TABLE "user_presence" DROP COLUMN IF EXISTS "show_activity";
DELETE FROM "_ft_migrations" WHERE "name" = '0027_presence_visibility.sql';
