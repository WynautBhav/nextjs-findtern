-- Rollback of drizzle/0029_proposals_employer_id_idx.sql. Never picked up by scripts/migrate.ts (subfolder).
-- Run as one transaction against an explicit scratch/target DATABASE_URL, e.g. psql "$DATABASE_URL" -1 -f <this file>.
-- Safe at any time: only the index is removed, no code depends on it and no data changes (queries just get slower).
SET LOCAL lock_timeout = '5s';
DROP INDEX IF EXISTS "proposals_employer_id_idx";
DELETE FROM "_ft_migrations" WHERE "name" = '0029_proposals_employer_id_idx.sql';
