-- Hand-written. One index per migration, so no single transaction holds locks on several tables.
-- intern_onboarding_user_id_idx on "intern_onboarding": the intern layout and profile read the row by user_id on every page (the table has only unique indexes on PAN/Aadhaar).
-- Plain CREATE INDEX (not CONCURRENTLY): the runner wraps each file in a transaction, where CONCURRENTLY is not allowed.
-- lock_timeout makes it give up after 5 s rather than queue behind a long write (and block everything behind it).
-- IF NOT EXISTS: safe to re-run. Additive only.
-- Rollback: drizzle/rollback/0036_intern_onboarding_user_id_idx.down.sql (index only, no data touched).
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "intern_onboarding_user_id_idx" ON "intern_onboarding" ("user_id");
