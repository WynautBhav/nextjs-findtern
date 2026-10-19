-- Hand-written data backfill (no schema change). Idempotent: every statement
-- only touches rows that are still missing the value.
--
-- 1. Employers now see Approved interns only, and a live AI-interview score
--    approves automatically. Interns who were scored before that rule existed
--    are approved once here; Rejected and Pending rows are left alone.
UPDATE "intern_onboarding"
SET "extra_data" = COALESCE("extra_data", '{}'::jsonb)
  || jsonb_build_object('approvalStatus', 'Approved', 'approvedAt', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'approvedBy', 'auto:backfill')
WHERE jsonb_typeof("extra_data"->'findternScore') = 'number'
  AND ("extra_data"->>'findternScore')::float8 > 0
  AND COALESCE("extra_data"->>'approvalStatus', '') NOT IN ('Approved', 'Rejected');
--> statement-breakpoint
-- 2. GST invoice numbers for payments that were paid before numbering
--    existed: one serial per Indian financial year (IST), in payment order,
--    shared by employer orders and paid intern fees. Zero-value (100% promo)
--    intern rows are not invoices and get no number.
WITH paid AS (
  SELECT 'e' AS src, "id", COALESCE("paid_at", "updated_at", "created_at") AS at
  FROM "employer_payments" WHERE "status" = 'paid' AND "invoice_number" IS NULL
  UNION ALL
  SELECT 'i', "id", COALESCE("paid_at", "updated_at", "created_at")
  FROM "intern_payments" WHERE "status" = 'paid' AND "invoice_number" IS NULL AND "amount_minor" > 0
), years AS (
  SELECT src, "id", at,
    CASE WHEN extract(month FROM at + interval '330 minutes') >= 4
      THEN extract(year FROM at + interval '330 minutes')::int
      ELSE extract(year FROM at + interval '330 minutes')::int - 1 END AS y
  FROM paid
), labelled AS (
  SELECT src, "id", at, y::text || '-' || lpad(((y + 1) % 100)::text, 2, '0') AS fy FROM years
), numbered AS (
  SELECT l.src, l."id", l.fy,
    row_number() OVER (PARTITION BY l.fy ORDER BY l.at, l."id")
      + COALESCE((SELECT c."last" FROM "invoice_counters" c WHERE c."fy" = l.fy), 0) AS n
  FROM labelled l
), upd_e AS (
  UPDATE "employer_payments" e SET "invoice_number" = 'FT/' || n.fy || '/' || lpad(n.n::text, 4, '0')
  FROM numbered n WHERE n.src = 'e' AND e."id" = n."id"
  RETURNING 1
), upd_i AS (
  UPDATE "intern_payments" i SET "invoice_number" = 'FT/' || n.fy || '/' || lpad(n.n::text, 4, '0')
  FROM numbered n WHERE n.src = 'i' AND i."id" = n."id"
  RETURNING 1
)
INSERT INTO "invoice_counters" ("fy", "last", "updated_at")
SELECT fy, max(n), now() FROM numbered GROUP BY fy
ON CONFLICT ("fy") DO UPDATE SET "last" = GREATEST("invoice_counters"."last", EXCLUDED."last"), "updated_at" = now();
