-- Rollback of drizzle/0024_projects_lifecycle.sql. Never picked up by scripts/migrate.ts (subfolder).
-- Run as one transaction against an explicit scratch/target DATABASE_URL, e.g. psql "$DATABASE_URL" -1 -f <this file>.
-- DESTROYS DATA: drops projects.rejection_reason, submitted_at and published_at (review history and publish dates), and rewrites lifecycle statuses back to legacy ones. Roll back 0025 first (take-down columns sit on the same table).
-- Roll back in reverse number order (0027 first). Run ONLY AFTER the code that uses it is reverted and deployed.
-- Status mapping is lossy: 0024 turned active->published, inactive->paused, archived->closed. Here published->active
-- and paused->inactive are reversed exactly; closed stays closed (legacy also had 'closed', and legacy code treats
-- closed and archived the same); draft/pending_review/rejected did not exist before and legacy code would show them
-- as live, so they become 'inactive'.
SET LOCAL lock_timeout = '5s';
ALTER TABLE "projects" DROP CONSTRAINT IF EXISTS "projects_status_check";
UPDATE "projects" SET "status" = 'active' WHERE "status" = 'published';
UPDATE "projects" SET "status" = 'inactive' WHERE "status" IN ('paused', 'draft', 'pending_review', 'rejected');
ALTER TABLE "projects" DROP COLUMN IF EXISTS "rejection_reason",
	DROP COLUMN IF EXISTS "submitted_at",
	DROP COLUMN IF EXISTS "published_at";
DELETE FROM "_ft_migrations" WHERE "name" = '0024_projects_lifecycle.sql';
