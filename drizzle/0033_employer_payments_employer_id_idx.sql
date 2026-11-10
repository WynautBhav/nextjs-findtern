-- Hand-written. One index per migration, so no single transaction holds locks on several tables.
-- employer_payments_employer_id_idx on "employer_payments": the employer's orders and payable checks.
-- Plain CREATE INDEX (not CONCURRENTLY): the runner wraps each file in a transaction, where CONCURRENTLY is not allowed.
-- lock_timeout makes it give up after 5 s rather than queue behind a long write (and block everything behind it).
-- IF NOT EXISTS: safe to re-run. Additive only.
-- Rollback: drizzle/rollback/0033_employer_payments_employer_id_idx.down.sql (index only, no data touched).
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "employer_payments_employer_id_idx" ON "employer_payments" ("employer_id");
