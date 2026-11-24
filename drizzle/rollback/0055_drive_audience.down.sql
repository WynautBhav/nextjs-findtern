-- Rollback of drizzle/0055_drive_audience.sql. Never picked up by scripts/migrate.ts (subfolder).
SET LOCAL lock_timeout = '5s';
ALTER TABLE "college_drives" DROP COLUMN IF EXISTS "audience";
DELETE FROM "_ft_migrations" WHERE "name" = '0055_drive_audience.sql';
