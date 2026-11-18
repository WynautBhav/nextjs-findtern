-- Hand-written. One index per migration, so no single transaction holds locks on several tables.
-- intern_payouts_intern_id_idx on "intern_payouts": loadInternData reads the intern's payouts by intern_id on every intern page.
-- Plain CREATE INDEX (not CONCURRENTLY): the runner wraps each file in a transaction, where CONCURRENTLY is not allowed.
-- lock_timeout makes it give up after 5 s rather than queue behind a long write (and block everything behind it).
-- IF NOT EXISTS: safe to re-run. Additive only.
-- Rollback: drizzle/rollback/0040_intern_payouts_intern_id_idx.down.sql (index only, no data touched).
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "intern_payouts_intern_id_idx" ON "intern_payouts" ("intern_id");
