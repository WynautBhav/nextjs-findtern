-- Hand-written. Terms acceptance pop-up (4 Nov 2026). Columns only, all nullable: no backfill, so every
-- existing account is asked once. Interns live in "users", companies in "employers", placement officers
-- in "college_admins". SET LOCAL: scoped to the migration transaction (a plain SET would leak into later files).
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "terms_accepted_version" text, ADD COLUMN "terms_accepted_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "employers" ADD COLUMN "terms_accepted_version" text, ADD COLUMN "terms_accepted_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "college_admins" ADD COLUMN "terms_accepted_version" text, ADD COLUMN "terms_accepted_at" timestamp with time zone;
