-- Rollback of drizzle/0020_listings_saved_roles.sql. Never picked up by scripts/migrate.ts (subfolder).
-- Run as one transaction against an explicit DATABASE_URL, e.g. psql "$DATABASE_URL" -1 -f <this file>.
-- Roll back 0021 first. Drops saved roles, listing descriptions and take-down records.
SET LOCAL lock_timeout = '5s';
DROP TABLE IF EXISTS "intern_saved_projects";
ALTER TABLE "projects" DROP COLUMN IF EXISTS "description",
	DROP COLUMN IF EXISTS "taken_down_at",
	DROP COLUMN IF EXISTS "taken_down_by",
	DROP COLUMN IF EXISTS "taken_down_reason";
DELETE FROM "_ft_migrations" WHERE "name" = '0020_listings_saved_roles.sql';
