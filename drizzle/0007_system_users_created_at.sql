-- Hand-written (DB-22). users.created_at arrived in 0001 with DEFAULT now(),
-- so every legacy user got the migration time as their signup date. The
-- backfill (scripts/legacy-backfill.sql) fixes onboarded users from their
-- onboarding row; the ~125 who never onboarded kept the migration date.
-- Their earliest trace in the shared tables is the closest evidence of when
-- they signed up: the profile nudge the legacy scheduler sends within a day
-- of signup, or a payment, interview or offer. Only ever moves a date
-- earlier, so it is safe to re-run and never touches a correct value.
UPDATE "users" u SET "created_at" = e.first_seen
FROM (
  SELECT id, min(at) AS first_seen FROM (
    SELECT n."recipient_id" AS id, n."created_at" AS at FROM "notifications" n WHERE n."recipient_type" = 'intern'
    UNION ALL SELECT p."intern_id", p."created_at" FROM "intern_payments" p
    UNION ALL SELECT i."intern_id", i."created_at" FROM "interviews" i
    UNION ALL SELECT r."intern_id", r."created_at" FROM "proposals" r
  ) t
  WHERE at IS NOT NULL
  GROUP BY id
) e
WHERE e.id = u."id" AND (u."created_at" IS NULL OR e.first_seen < u."created_at");
