-- Hand-written: drop duplicate deduped notifications (keep the oldest) so the
-- unique index can be built on databases that already have repeats.
DELETE FROM "notifications" n USING "notifications" d
WHERE n."dedupe_key" IS NOT NULL
  AND n."recipient_type" = d."recipient_type"
  AND n."recipient_id" = d."recipient_id"
  AND n."dedupe_key" = d."dedupe_key"
  AND (n."created_at", n."id") > (d."created_at", d."id");--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_dedupe_uniq" ON "notifications" USING btree ("recipient_type","recipient_id","dedupe_key") WHERE "notifications"."dedupe_key" is not null;
