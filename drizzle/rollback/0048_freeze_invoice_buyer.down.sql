-- Rollback of drizzle/0048_freeze_invoice_buyer.sql. Never picked up by scripts/migrate.ts (subfolder).
-- Run as one transaction against an explicit scratch/target DATABASE_URL, e.g. psql "$DATABASE_URL" -1 -f <this file>.
-- Removes only the snapshots the backfill wrote; snapshots frozen at settlement stay.
SET LOCAL lock_timeout = '5s';
UPDATE "employer_payments" SET "raw" = "raw" - 'invoiceBuyer' - 'invoiceBuyerBackfilled' WHERE "raw" ? 'invoiceBuyerBackfilled';
DELETE FROM "_ft_migrations" WHERE "name" = '0048_freeze_invoice_buyer.sql';
