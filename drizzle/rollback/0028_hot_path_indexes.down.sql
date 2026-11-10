-- Rollback of drizzle/0028_hot_path_indexes.sql. Never picked up by scripts/migrate.ts (subfolder).
-- Run as one transaction against an explicit scratch/target DATABASE_URL, e.g. psql "$DATABASE_URL" -1 -f <this file>.
-- Safe at any time: only indexes are removed, no code depends on them and no data changes (queries just get slower).
SET LOCAL lock_timeout = '5s';
DROP INDEX IF EXISTS "notifications_recipient_idx";
DROP INDEX IF EXISTS "proposals_employer_id_idx";
DROP INDEX IF EXISTS "proposals_project_id_idx";
DROP INDEX IF EXISTS "projects_employer_id_idx";
DROP INDEX IF EXISTS "interviews_employer_id_idx";
DROP INDEX IF EXISTS "employer_payments_employer_id_idx";
DROP INDEX IF EXISTS "timesheets_proposal_id_idx";
DELETE FROM "_ft_migrations" WHERE "name" = '0028_hot_path_indexes.sql';
