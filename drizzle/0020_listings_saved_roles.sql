-- Hand-written. Listing description + admin take-down (OA8, separate from the legacy status column) and roles a
-- student saved (OA3). New columns are nullable; no FK to legacy tables. Idempotent (IF NOT EXISTS).
-- SET LOCAL: scoped to the runner's transaction.
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "description" text,
	ADD COLUMN IF NOT EXISTS "taken_down_at" timestamp,
	ADD COLUMN IF NOT EXISTS "taken_down_by" varchar,
	ADD COLUMN IF NOT EXISTS "taken_down_reason" text;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "intern_saved_projects" (
	"intern_id" varchar NOT NULL,
	"project_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	PRIMARY KEY ("intern_id", "project_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "intern_saved_projects_project_idx" ON "intern_saved_projects" USING btree ("project_id");
