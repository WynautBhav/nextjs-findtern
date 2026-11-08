-- Rollback of drizzle/0021_email_outbox.sql. Never picked up by scripts/migrate.ts (subfolder).
-- Run as one transaction against an explicit scratch/target DATABASE_URL, e.g. psql "$DATABASE_URL" -1 -f <this file>.
-- DESTROYS DATA: drops the campaign email queue: queued/failed mails are never sent and send history, tracking and idempotency keys are lost.
-- Roll back in reverse number order (0027 first). Run ONLY AFTER the code that uses it is reverted and deployed.
SET LOCAL lock_timeout = '5s';
DROP TABLE IF EXISTS "email_outbox";
DROP TABLE IF EXISTS "email_campaigns";
DELETE FROM "_ft_migrations" WHERE "name" = '0021_email_outbox.sql';
