-- Hand-written. Campaign emails queue (outbox) with retry, tracking and resend. Idempotent, no FKs.
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "email_campaigns" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" text NOT NULL,
	"kind" text NOT NULL,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"counts" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "email_campaigns_status_check" CHECK ("status" IN ('draft','running','done','cancelled'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "email_outbox" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" text NOT NULL,
	"entry_id" text NOT NULL,
	"to_email" text NOT NULL,
	"template" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_at" timestamp DEFAULT now() NOT NULL,
	"last_error" text,
	"provider_id" text,
	"idempotency_key" text NOT NULL,
	"sent_at" timestamp,
	"opened_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "email_outbox_status_check" CHECK ("status" IN ('queued','sending','sent','failed','dead')),
	CONSTRAINT "email_outbox_idempotency_key_unique" UNIQUE ("idempotency_key")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_outbox_status_next_idx" ON "email_outbox" USING btree ("status","next_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_outbox_campaign_idx" ON "email_outbox" USING btree ("campaign_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_campaigns_order_idx" ON "email_campaigns" USING btree ("order_id");
