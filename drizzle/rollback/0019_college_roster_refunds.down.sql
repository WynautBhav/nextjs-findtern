-- Rollback of drizzle/0019_college_roster_refunds.sql. Never picked up by scripts/migrate.ts (subfolder).
-- Run as one transaction against an explicit DATABASE_URL, e.g. psql "$DATABASE_URL" -1 -f <this file>.
-- Roll back 0021 and 0020 first. Drops roster imports, roster phone/match data and college contacts.
-- The refund ledger is money history, so it is KEPT: renamed to payment_refunds_bak_<timestamp> with its
-- indexes dropped and its primary key renamed, so re-applying 0019 creates a fresh table. Promo usages with
-- order_id 'refund:<id>' (seats refunds used) stay as they are; see OPS-NOTES before deleting any.
SET LOCAL lock_timeout = '5s';
DO $$
DECLARE bak text := 'payment_refunds_bak_' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISS');
BEGIN
	IF to_regclass('payment_refunds') IS NOT NULL THEN
		DROP INDEX IF EXISTS "payment_refunds_live_uniq", "payment_refunds_gateway_uniq", "payment_refunds_status_idx";
		EXECUTE format('ALTER TABLE "payment_refunds" RENAME CONSTRAINT "payment_refunds_pkey" TO %I', bak || '_pkey');
		EXECUTE format('ALTER TABLE "payment_refunds" RENAME TO %I', bak);
	END IF;
END $$;
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
