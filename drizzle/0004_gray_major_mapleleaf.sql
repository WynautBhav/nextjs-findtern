CREATE TABLE "invoice_counters" (
	"fy" text PRIMARY KEY NOT NULL,
	"last" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "employer_payments" ADD COLUMN "invoice_number" text;--> statement-breakpoint
ALTER TABLE "intern_payments" ADD COLUMN "invoice_number" text;--> statement-breakpoint
ALTER TABLE "promo_codes" ADD COLUMN "applies_to" text DEFAULT 'both' NOT NULL;--> statement-breakpoint
ALTER TABLE "employer_payments" ADD CONSTRAINT "employer_payments_invoice_number_unique" UNIQUE("invoice_number");--> statement-breakpoint
ALTER TABLE "intern_payments" ADD CONSTRAINT "intern_payments_invoice_number_unique" UNIQUE("invoice_number");