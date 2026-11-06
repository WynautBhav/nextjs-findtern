-- Hand-written. Sessions ended by logout: the signed cookie is self-contained, so a copied cookie stayed valid
-- until it expired. A row here (sid = the session id inside the cookie) makes it invalid at once.
-- exp lets old rows be purged. Idempotent.
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "revoked_sessions" (
	"sid" text PRIMARY KEY NOT NULL,
	"exp" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "revoked_sessions_exp_idx" ON "revoked_sessions" USING btree ("exp");
