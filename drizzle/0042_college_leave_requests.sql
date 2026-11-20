-- Hand-written. A student asks to leave a college; the college's placement officer (or Findtern admin) decides.
-- Additive only: one new table and two indexes, nothing existing is touched. Idempotent (IF NOT EXISTS).
-- status: requested | approved | rejected | cancelled. decided_by_type: college_admin | admin | system | student.
-- The partial unique index allows one pending request per student and makes a double submit race-safe.
-- Rollback: drizzle/rollback/0042_college_leave_requests.down.sql.
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "college_leave_requests" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"college_id" varchar NOT NULL,
	"membership_id" varchar NOT NULL,
	"status" text DEFAULT 'requested' NOT NULL,
	"reason" text,
	"requested_at" timestamp DEFAULT now() NOT NULL,
	"decided_at" timestamp,
	"decided_by_type" text,
	"decided_by_id" varchar,
	"decision_note" text
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "college_leave_requests_one_pending_uniq" ON "college_leave_requests" USING btree ("user_id") WHERE "status" = 'requested';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "college_leave_requests_college_status_idx" ON "college_leave_requests" USING btree ("college_id", "status", "requested_at");
