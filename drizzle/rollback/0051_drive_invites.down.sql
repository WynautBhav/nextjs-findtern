-- Rollback of drizzle/0051_drive_invites.sql. Never picked up by scripts/migrate.ts (subfolder).
-- Drops the invited companies list on each drive. The drives themselves are untouched.
SET LOCAL lock_timeout = '5s';
ALTER TABLE "college_drives" DROP COLUMN IF EXISTS "invited_employers";
DELETE FROM "_ft_migrations" WHERE "name" = '0051_drive_invites.sql';
