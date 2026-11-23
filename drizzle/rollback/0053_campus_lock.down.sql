-- Rollback of drizzle/0053_campus_lock.sql. Never picked up by scripts/migrate.ts (subfolder).
-- Drops the drive activity log and the drive pricing stamps on offers. Offers keep their discounted price in offer_details.
SET LOCAL lock_timeout = '5s';
DROP TABLE IF EXISTS "drive_activity_logs";
DROP INDEX IF EXISTS "proposals_drive_idx";
ALTER TABLE "proposals" DROP COLUMN IF EXISTS "ppo_fee_percent";
ALTER TABLE "proposals" DROP COLUMN IF EXISTS "discount_percent";
ALTER TABLE "proposals" DROP COLUMN IF EXISTS "pricing_tier";
ALTER TABLE "proposals" DROP COLUMN IF EXISTS "drive_id";
DROP INDEX IF EXISTS "college_drive_employers_employer_idx";
ALTER TABLE "college_drive_employers" DROP COLUMN IF EXISTS "completed_at";
ALTER TABLE "college_drive_employers" DROP COLUMN IF EXISTS "exited_at";
ALTER TABLE "college_drive_employers" DROP COLUMN IF EXISTS "via";
ALTER TABLE "college_drive_employers" DROP COLUMN IF EXISTS "status";
DELETE FROM "_ft_migrations" WHERE "name" = '0053_campus_lock.sql';
