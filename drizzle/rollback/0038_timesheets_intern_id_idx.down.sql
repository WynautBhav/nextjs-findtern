-- Rollback of drizzle/0038_timesheets_intern_id_idx.sql. Never picked up by scripts/migrate.ts (subfolder).
-- Run as one transaction against an explicit scratch/target DATABASE_URL, e.g. psql "$DATABASE_URL" -1 -f <this file>.
-- Drops the index only; no data is touched and no code depends on it.
SET LOCAL lock_timeout = '5s';
DROP INDEX IF EXISTS "timesheets_intern_id_idx";
DELETE FROM "_ft_migrations" WHERE "name" = '0038_timesheets_intern_id_idx.sql';
