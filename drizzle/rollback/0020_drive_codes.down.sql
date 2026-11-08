-- Rollback of drizzle/0020_drive_codes.sql. Never picked up by scripts/migrate.ts (subfolder).
-- Run as one transaction against an explicit scratch/target DATABASE_URL, e.g. psql "$DATABASE_URL" -1 -f <this file>.
-- DESTROYS DATA: drops every issued drive code (hash + last 4) and every redemption entitlement, so students who redeemed a code lose their entitlement.
-- Roll back in reverse number order (0027 first). Run ONLY AFTER the code that uses it is reverted and deployed.
SET LOCAL lock_timeout = '5s';
DROP TABLE IF EXISTS "drive_entitlements";
DROP TABLE IF EXISTS "drive_codes";
DELETE FROM "_ft_migrations" WHERE "name" = '0020_drive_codes.sql';
