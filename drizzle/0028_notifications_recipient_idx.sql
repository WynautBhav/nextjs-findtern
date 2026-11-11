-- Hand-written. One index per migration, so no single transaction holds locks on several tables.
-- notifications_recipient_idx on "notifications": read by the bell, the dashboards and the layout unread count on every request (measured 9-14 ms seq scans at 300k rows).
-- Plain CREATE INDEX (not CONCURRENTLY): the runner wraps each file in a transaction, where CONCURRENTLY is not allowed.
-- lock_timeout makes it give up after 5 s rather than queue behind a long write (and block everything behind it).
-- IF NOT EXISTS: safe to re-run. Additive only.
-- Rollback: drizzle/rollback/0028_notifications_recipient_idx.down.sql (index only, no data touched).
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_recipient_idx" ON "notifications" ("recipient_id", "recipient_type", "created_at");
