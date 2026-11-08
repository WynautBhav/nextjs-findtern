-- Rollback of drizzle/0018_drive_orders.sql. Never picked up by scripts/migrate.ts (subfolder).
-- Run as one transaction against an explicit scratch/target DATABASE_URL, e.g. psql "$DATABASE_URL" -1 -f <this file>.
-- DESTROYS DATA: drops every drive order (the paid unit of a college drive) and the drive_order_id / order_id links on college_seat_batches and college_drives. Money rows elsewhere are not edited.
-- Roll back in reverse number order (0027 first). Run ONLY AFTER the code that uses it is reverted and deployed.
SET LOCAL lock_timeout = '5s';
DROP INDEX IF EXISTS "college_seat_batches_drive_order_unique";
ALTER TABLE "college_seat_batches" DROP COLUMN IF EXISTS "drive_order_id";
ALTER TABLE "college_drives" DROP COLUMN IF EXISTS "order_id";
DROP TABLE IF EXISTS "college_drive_orders";
DELETE FROM "_ft_migrations" WHERE "name" = '0018_drive_orders.sql';
