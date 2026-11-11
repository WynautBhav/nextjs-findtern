-- Hand-written. One index per migration, so no single transaction holds locks on several tables.
-- proposals_employer_id_idx on "proposals": filtered by employer or project on the employer and admin dashboards and lists.
-- Plain CREATE INDEX (not CONCURRENTLY): the runner wraps each file in a transaction, where CONCURRENTLY is not allowed.
-- lock_timeout makes it give up after 5 s rather than queue behind a long write (and block everything behind it).
-- IF NOT EXISTS: safe to re-run. Additive only.
-- Rollback: drizzle/rollback/0029_proposals_employer_id_idx.down.sql (index only, no data touched).
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "proposals_employer_id_idx" ON "proposals" ("employer_id");
