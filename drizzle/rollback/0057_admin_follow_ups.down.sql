-- Rollback of drizzle/0057_admin_follow_ups.sql. Never picked up by scripts/migrate.ts (subfolder). Drops the follow-up log.
SET LOCAL lock_timeout = '5s';
DROP TABLE IF EXISTS "admin_follow_ups";
DELETE FROM "_ft_migrations" WHERE "name" = '0057_admin_follow_ups.sql';
