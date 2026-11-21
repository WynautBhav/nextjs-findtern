-- Hand-written. Every paid employer order keeps the buyer it was invoiced to (raw.invoiceBuyer), so a company that later
-- changes its country (India <-> abroad), state or GSTIN can never change the GST on an invoice already issued.
-- Settlement freezes it from now on (lib/payments.ts); this backfills paid orders from before that, from the profile as it
-- is today (the best record there is). Data only, no schema change. Idempotent: rows that already have a snapshot are skipped.
-- Backfilled rows carry invoiceBuyerBackfilled = true so the rollback removes exactly these.
-- Rollback: drizzle/rollback/0048_freeze_invoice_buyer.down.sql.
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
UPDATE "employer_payments" ep
SET "raw" = coalesce(ep."raw", '{}'::jsonb) || jsonb_build_object(
  'invoiceBuyer', jsonb_build_object(
    'name', coalesce(e."company_name", 'Customer'),
    'email', e."company_email",
    'gstin', e."gst_number",
    'city', e."city",
    'state', e."state",
    'country', e."country",
    'pincode', e."billing_pincode"
  ),
  'invoiceBuyerBackfilled', true
)
FROM "employers" e
WHERE e."id" = ep."employer_id"
  AND ep."status" = 'paid'
  AND NOT (coalesce(ep."raw", '{}'::jsonb) ? 'invoiceBuyer');
