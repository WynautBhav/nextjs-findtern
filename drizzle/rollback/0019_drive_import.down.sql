-- Rollback of drizzle/0019_drive_import.sql. Never picked up by scripts/migrate.ts (subfolder).
-- Run as one transaction against an explicit scratch/target DATABASE_URL, e.g. psql "$DATABASE_URL" -1 -f <this file>.
-- DESTROYS DATA: drops uploaded drive rosters (names, college emails, phones), import records and identity reviews. Roll back 0020 first (drive_codes point at roster entries).
-- Roll back in reverse number order (0027 first). Run ONLY AFTER the code that uses it is reverted and deployed.
SET LOCAL lock_timeout = '5s';
DROP TABLE IF EXISTS "identity_reviews";
DROP TABLE IF EXISTS "drive_roster_entries";
DROP TABLE IF EXISTS "drive_imports";
DELETE FROM "_ft_migrations" WHERE "name" = '0019_drive_import.sql';
