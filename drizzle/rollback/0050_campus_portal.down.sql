-- Rollback of drizzle/0050_campus_portal.sql. Never picked up by scripts/migrate.ts (subfolder).
-- Drops the record of which students each college removed: they can rejoin with a code again. Memberships are untouched.
SET LOCAL lock_timeout = '5s';
DROP TRIGGER IF EXISTS college_membership_denied_guard ON "college_memberships";
DROP FUNCTION IF EXISTS college_membership_denied_guard();
DROP TABLE IF EXISTS "college_denials";
ALTER TABLE "college_memberships" DROP COLUMN IF EXISTS "decided_at";
ALTER TABLE "college_memberships" DROP COLUMN IF EXISTS "decided_by_type";
ALTER TABLE "college_memberships" DROP COLUMN IF EXISTS "decided_by_id";
ALTER TABLE "college_roster" DROP COLUMN IF EXISTS "phone";
DELETE FROM "_ft_migrations" WHERE "name" = '0050_campus_portal.sql';
