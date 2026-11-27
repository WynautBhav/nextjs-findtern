-- Hand-written. A per-link random key: the drive link token is HMAC(server secret, key), so the officer can be shown the link again.
-- Existing drives have no key (null) and keep the "shown once" message. Additive only, idempotent. Rollback: rollback/0056_drive_link_key.down.sql.
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
ALTER TABLE "college_drives" ADD COLUMN IF NOT EXISTS "link_key" text;
