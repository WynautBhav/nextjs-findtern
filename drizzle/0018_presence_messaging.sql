-- Hand-written. Intern presence (activity-based, OA2), employer-intern message threads (OA1) and the partial index
-- behind the unread notification counter. New tables only; no FK to legacy tables. Idempotent (IF NOT EXISTS).
-- SET LOCAL: scoped to the runner's transaction.
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_unread_idx" ON "notifications" USING btree ("recipient_type", "recipient_id") WHERE "is_read" = false;
--> statement-breakpoint
-- user_type: 'intern' (employer reserved). last_seen_at = any beat (tab visible); last_active_at = beat with active=true.
-- hidden = the student switched presence off (OA2).
CREATE TABLE IF NOT EXISTS "user_presence" (
	"user_type" text NOT NULL,
	"user_id" varchar NOT NULL,
	"last_seen_at" timestamp DEFAULT now() NOT NULL,
	"last_active_at" timestamp,
	"hidden" boolean DEFAULT false NOT NULL,
	PRIMARY KEY ("user_type", "user_id")
);
--> statement-breakpoint
-- One thread per employer-intern pair, opened by a proposal (OA1).
CREATE TABLE IF NOT EXISTS "message_threads" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employer_id" varchar NOT NULL,
	"intern_id" varchar NOT NULL,
	"proposal_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_message_at" timestamp,
	"employer_last_read_at" timestamp,
	"intern_last_read_at" timestamp,
	"employer_emailed_at" timestamp,
	"intern_emailed_at" timestamp,
	"closed_at" timestamp,
	"closed_reason" text
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "message_threads_pair_uniq" ON "message_threads" USING btree ("employer_id", "intern_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "message_threads_intern_idx" ON "message_threads" USING btree ("intern_id", "last_message_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "message_threads_employer_idx" ON "message_threads" USING btree ("employer_id", "last_message_at" DESC);
--> statement-breakpoint
-- sender_type: intern | employer. client_id makes a retried send idempotent. redacted = contact info was hidden.
CREATE TABLE IF NOT EXISTS "messages" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" varchar NOT NULL REFERENCES "message_threads"("id"),
	"sender_type" text NOT NULL,
	"sender_id" varchar NOT NULL,
	"body" text NOT NULL CONSTRAINT "messages_body_len" CHECK (char_length("body") BETWEEN 1 AND 2000),
	"client_id" varchar NOT NULL,
	"redacted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "messages_client_uniq" ON "messages" USING btree ("thread_id", "sender_id", "client_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "messages_thread_idx" ON "messages" USING btree ("thread_id", "created_at");
