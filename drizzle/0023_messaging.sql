-- Hand-written, idempotent. Messaging, presence and realtime events (WP-G). No FKs, like 0017.
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "threads" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employer_id" varchar NOT NULL,
	"intern_id" varchar NOT NULL,
	"proposal_id" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_message_at" timestamp
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "threads_pair_uniq" ON "threads" USING btree ("employer_id","intern_id",COALESCE("proposal_id", ''));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "threads_intern_idx" ON "threads" USING btree ("intern_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "threads_employer_idx" ON "threads" USING btree ("employer_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "messages" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" varchar NOT NULL,
	"sender_id" varchar NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"delivered_at" timestamp,
	"read_at" timestamp,
	CONSTRAINT "messages_body_len_chk" CHECK (char_length("body") BETWEEN 1 AND 4000)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "messages_thread_created_idx" ON "messages" USING btree ("thread_id","created_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_presence" (
	"user_id" varchar PRIMARY KEY NOT NULL,
	"last_seen_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "realtime_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "realtime_events_user_id_idx" ON "realtime_events" USING btree ("user_id","id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notification_prefs" (
	"user_id" varchar PRIMARY KEY NOT NULL,
	"email_messages" boolean DEFAULT true NOT NULL,
	"push_messages" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
