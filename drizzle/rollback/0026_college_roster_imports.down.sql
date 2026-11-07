-- Rollback of drizzle/0026_college_roster_imports.sql. Never picked up by scripts/migrate.ts (subfolder).
-- Run as one transaction against an explicit scratch/target DATABASE_URL, e.g. psql "$DATABASE_URL" -1 -f <this file>.
-- Drops all roster upload previews (they are re-creatable by uploading the file again).
SET LOCAL lock_timeout = '5s';
DROP TABLE IF EXISTS "college_roster_imports";
DELETE FROM "_ft_migrations" WHERE "name" = '0026_college_roster_imports.sql';
