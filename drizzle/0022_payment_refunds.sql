-- Hand-written. Admin-reviewed refunds of individually paid AI-interview fees. amount_minor is copied from
-- intern_payments at creation. The partial unique index allows one live refund per payment. Idempotent, no FKs.
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payment_refunds" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"intern_payment_id" varchar NOT NULL,
	"entry_id" varchar,
	"amount_minor" integer NOT NULL CONSTRAINT "payment_refunds_amount_positive" CHECK ("amount_minor" > 0),
	"status" text NOT NULL DEFAULT 'eligible' CONSTRAINT "payment_refunds_status_valid" CHECK ("status" IN ('eligible','review','pending','initiated','refunded','failed')),
	"gateway_refund_id" text,
	"idempotency_key" text NOT NULL,
	"reason" text,
	"raw" jsonb DEFAULT '{}'::jsonb,
	"actor" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"initiated_at" timestamp,
	"settled_at" timestamp
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "payment_refunds_gateway_refund_unique" ON "payment_refunds" USING btree ("gateway_refund_id") WHERE "gateway_refund_id" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "payment_refunds_idempotency_key_unique" ON "payment_refunds" USING btree ("idempotency_key");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "payment_refunds_live_per_payment" ON "payment_refunds" USING btree ("intern_payment_id") WHERE "status" <> 'failed';
