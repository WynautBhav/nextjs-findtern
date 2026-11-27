-- Rollback of drizzle/0056_drive_link_key.sql. Never picked up by scripts/migrate.ts (subfolder).
SET LOCAL lock_timeout = '5s';
ALTER TABLE "college_drives" DROP COLUMN IF EXISTS "link_key";
DELETE FROM "_ft_migrations" WHERE "name" = '0056_drive_link_key.sql';
