-- Rollback of drizzle/0047_work_exempt.sql. Never picked up by scripts/migrate.ts (subfolder).
-- Run as one transaction against an explicit scratch/target DATABASE_URL, e.g. psql "$DATABASE_URL" -1 -f <this file>.
-- Drops the work-exemption grants: every frozen intern is fully frozen again (their data is untouched).
SET LOCAL lock_timeout = '5s';
ALTER TABLE "users" DROP COLUMN IF EXISTS "work_exempt_at";
ALTER TABLE "users" DROP COLUMN IF EXISTS "work_exempt_by";
ALTER TABLE "users" DROP COLUMN IF EXISTS "work_decision_at";
ALTER TABLE "users" DROP COLUMN IF EXISTS "work_review_notified_at";
DELETE FROM "_ft_migrations" WHERE "name" = '0047_work_exempt.sql';
