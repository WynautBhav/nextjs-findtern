-- Hand-written. A payroll invoice staff issue by hand (employer_payments.raw.kind = 'manual_invoice') is one per placement per
-- service month: this partial unique index is the backstop for the check the issue route makes (src/app/api/admin/invoices/payroll).
-- A voided invoice (status 'void') frees its month, so a corrected one can be issued; its number is never reused.
-- Additive only, no data change: no existing row has kind 'manual_invoice', so building it cannot fail on old data.
-- Plain CREATE UNIQUE INDEX (not CONCURRENTLY): the runner wraps each file in a transaction, where CONCURRENTLY is not allowed.
-- Rollback: drizzle/rollback/0049_manual_invoice_index.down.sql.
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "employer_payments_manual_invoice_period_uidx"
  ON "employer_payments" (("raw"->>'proposalId'), ("raw"->'period'->>'start'))
  WHERE "raw"->>'kind' = 'manual_invoice' AND "status" <> 'void';
