-- Hand-written. Online time, one row per user per minute they had a Findtern tab open (POST /api/presence/heartbeat,
-- every 30 s while visible). Lets a TPO's drive summary say how long students and employers were online during a drive.
-- Additive only, idempotent. `minute` is UTC wall time, like the other plain timestamps. Rollback: rollback/0054_presence_minutes.down.sql.
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "presence_minutes" (
  "user_id" varchar NOT NULL,
  "minute" timestamp NOT NULL,
  CONSTRAINT "presence_minutes_pk" PRIMARY KEY ("user_id", "minute")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "presence_minutes_minute_idx" ON "presence_minutes" USING btree ("minute");
