-- Rollback of drizzle/0054_presence_minutes.sql. Never picked up by scripts/migrate.ts (subfolder).
SET LOCAL lock_timeout = '5s';
DROP TABLE IF EXISTS "presence_minutes";
DELETE FROM "_ft_migrations" WHERE "name" = '0054_presence_minutes.sql';
