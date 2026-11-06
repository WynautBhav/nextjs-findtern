-- Rollback of drizzle/0019_college_roster_refunds.sql. Never picked up by scripts/migrate.ts (subfolder).
-- Run as one transaction against an explicit DATABASE_URL, e.g. psql "$DATABASE_URL" -1 -f <this file>.
-- Roll back 0021 and 0020 first. Drops refund rows, roster imports, roster phone/match data and college contacts.
SET LOCAL lock_timeout = '5s';
DROP TABLE IF EXISTS "payment_refunds";
DROP TABLE IF EXISTS "college_roster_imports";
DROP INDEX IF EXISTS "college_roster_matched_user_uniq";
DROP INDEX IF EXISTS "college_roster_review_idx";
ALTER TABLE "college_roster" DROP COLUMN IF EXISTS "phone",
	DROP COLUMN IF EXISTS "import_id",
	DROP COLUMN IF EXISTS "matched_user_id",
	DROP COLUMN IF EXISTS "match_status",
	DROP COLUMN IF EXISTS "match_candidates",
	DROP COLUMN IF EXISTS "match_decided_by",
	DROP COLUMN IF EXISTS "match_decided_at";
ALTER TABLE "colleges" DROP COLUMN IF EXISTS "contact_name",
	DROP COLUMN IF EXISTS "contact_email",
	DROP COLUMN IF EXISTS "contact_phone",
	DROP COLUMN IF EXISTS "address";
DELETE FROM "_ft_migrations" WHERE "name" = '0019_college_roster_refunds.sql';
