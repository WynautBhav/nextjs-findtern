-- Hand-written. College picker search (src/lib/college/membership.ts) matches
-- name and city with ILIKE '%term%'. With ~70k AISHE institutions that needs
-- trigram indexes; the plain btree on name cannot serve a leading wildcard.
-- pg_trgm is a trusted extension (PG13+), so the database owner can create it.
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "colleges_name_trgm_idx" ON "colleges" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "colleges_city_trgm_idx" ON "colleges" USING gin ("city" gin_trgm_ops);
