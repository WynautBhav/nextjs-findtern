-- Rollback of drizzle/0049_manual_invoice_index.sql. Never picked up by scripts/migrate.ts (subfolder).
-- Run as one transaction against an explicit scratch/target DATABASE_URL, e.g. psql "$DATABASE_URL" -1 -f <this file>.
-- Drops only the index; the invoices themselves stay.
SET LOCAL lock_timeout = '5s';
DROP INDEX IF EXISTS "employer_payments_manual_invoice_period_uidx";
DELETE FROM "_ft_migrations" WHERE "name" = '0049_manual_invoice_index.sql';
