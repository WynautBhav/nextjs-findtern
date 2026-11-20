-- Rollback of drizzle/0046_account_strikes.sql. Never picked up by scripts/migrate.ts (subfolder).
-- Run as one transaction against an explicit scratch/target DATABASE_URL, e.g. psql "$DATABASE_URL" -1 -f <this file>.
-- Drops the strike history and the freeze columns: every frozen account is released (their data is untouched).
SET LOCAL lock_timeout = '5s';
DROP TABLE IF EXISTS "account_strikes";
ALTER TABLE "users" DROP COLUMN IF EXISTS "frozen_at";
ALTER TABLE "users" DROP COLUMN IF EXISTS "frozen_reason";
ALTER TABLE "employers" DROP COLUMN IF EXISTS "frozen_at";
ALTER TABLE "employers" DROP COLUMN IF EXISTS "frozen_reason";
DELETE FROM "_ft_migrations" WHERE "name" = '0046_account_strikes.sql';
