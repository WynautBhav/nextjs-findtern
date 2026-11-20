-- Rollback of drizzle/0044_meeting_gate_acceptances.sql. Never picked up by scripts/migrate.ts (subfolder).
-- Run as one transaction against an explicit scratch/target DATABASE_URL.
-- Drops the table: every recorded gate acceptance is lost. Interviews and their Meet links are untouched.
SET LOCAL lock_timeout = '5s';
DROP INDEX IF EXISTS "meeting_gate_acceptances_uniq";
DROP TABLE IF EXISTS "meeting_gate_acceptances";
DELETE FROM "_ft_migrations" WHERE "name" = '0044_meeting_gate_acceptances.sql';
