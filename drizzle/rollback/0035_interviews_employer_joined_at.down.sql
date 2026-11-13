-- Rollback of drizzle/0035_interviews_employer_joined_at.sql. Never picked up by scripts/migrate.ts (subfolder).
-- Run as one transaction against an explicit scratch/target DATABASE_URL, e.g. psql "$DATABASE_URL" -1 -f <this file>.
-- Run ONLY AFTER the code that reads employer_joined_at is reverted/deployed (otherwise the app errors on the missing column).
-- Drops the record of who joined: afterwards no interview can be told apart as joined, so the no-show rule must be gone too.
SET LOCAL lock_timeout = '5s';
ALTER TABLE "interviews" DROP COLUMN IF EXISTS "employer_joined_at";
DELETE FROM "_ft_migrations" WHERE "name" = '0035_interviews_employer_joined_at.sql';
