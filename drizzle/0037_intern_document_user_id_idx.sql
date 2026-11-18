-- Hand-written. One index per migration, so no single transaction holds locks on several tables.
-- intern_document_user_id_idx on "intern_document": the intern layout and profile read the row by user_id on every page.
-- Plain CREATE INDEX (not CONCURRENTLY): the runner wraps each file in a transaction, where CONCURRENTLY is not allowed.
-- lock_timeout makes it give up after 5 s rather than queue behind a long write (and block everything behind it).
-- IF NOT EXISTS: safe to re-run. Additive only.
-- Rollback: drizzle/rollback/0037_intern_document_user_id_idx.down.sql (index only, no data touched).
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "intern_document_user_id_idx" ON "intern_document" ("user_id");
