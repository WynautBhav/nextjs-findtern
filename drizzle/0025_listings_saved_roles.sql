-- Hand-written. Listing description + admin take-down (separate from the lifecycle status column) and roles a
-- student saved. Ported from integrate/employer-1107 0020 onto master's schema. New columns are nullable; no FK to
-- legacy tables. Idempotent (IF NOT EXISTS). Rollback: drizzle/rollback/0025_listings_saved_roles.down.sql.
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
	CONSTRAINT "intern_saved_projects_pkey" PRIMARY KEY ("intern_id", "project_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "intern_saved_projects_project_idx" ON "intern_saved_projects" USING btree ("project_id");
