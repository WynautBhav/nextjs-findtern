-- Rollback of drizzle/0042_college_leave_requests.sql. Never picked up by scripts/migrate.ts (subfolder).
-- Run as one transaction against an explicit scratch/target DATABASE_URL, e.g. psql "$DATABASE_URL" -1 -f <this file>.
-- Drops the leave-request history (pending and decided). Memberships already ended by an approval stay ended.
SET LOCAL lock_timeout = '5s';
DROP TABLE IF EXISTS "college_leave_requests";
DELETE FROM "_ft_migrations" WHERE "name" = '0042_college_leave_requests.sql';
