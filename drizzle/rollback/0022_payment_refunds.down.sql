-- Rollback of drizzle/0022_payment_refunds.sql. Never picked up by scripts/migrate.ts (subfolder).
-- Run as one transaction against an explicit scratch/target DATABASE_URL, e.g. psql "$DATABASE_URL" -1 -f <this file>.
-- DESTROYS DATA: drops all refund records (status, gateway refund ids, idempotency keys). A refund already initiated at the gateway loses its local record.
-- Roll back in reverse number order (0027 first). Run ONLY AFTER the code that uses it is reverted and deployed.
SET LOCAL lock_timeout = '5s';
DROP TABLE IF EXISTS "payment_refunds";
DELETE FROM "_ft_migrations" WHERE "name" = '0022_payment_refunds.sql';
