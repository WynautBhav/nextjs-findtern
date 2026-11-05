-- Hand-written. 0002 seeded strike prices the public pricing page no longer shows (TS fallback dropped them, but a DB row wins).
-- Clears them only where the row still holds exactly the seeded value, so a figure an admin set from /admin/settings is kept.
-- Idempotent: a second run matches nothing. SET LOCAL: scoped to the runner's transaction.
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
UPDATE "pricing_plans" SET "compare_at_hourly_minor" = NULL WHERE lower("slug") = 'cappuccino' AND upper("currency") = 'INR' AND "compare_at_hourly_minor" = 15000;
--> statement-breakpoint
UPDATE "pricing_plans" SET "compare_at_hourly_minor" = NULL WHERE lower("slug") = 'latte' AND upper("currency") = 'INR' AND "compare_at_hourly_minor" = 30000;
--> statement-breakpoint
UPDATE "pricing_plans" SET "compare_at_per_hire_minor" = NULL WHERE lower("slug") = 'espresso' AND upper("currency") = 'INR' AND "compare_at_per_hire_minor" = 750000;
