-- Hand-written. Two product rules (3 Nov 2026).
-- 1. Staff grant a completion bonus per hire: +1 Findtern Score (max 10). One grant per proposal.
-- 2. Every college gets a unique Findtern code that students can search by.
ALTER TABLE "proposals" ADD COLUMN "completion_bonus_at" timestamp, ADD COLUMN "completion_bonus_by" varchar;
--> statement-breakpoint
ALTER TABLE "colleges" ADD COLUMN "code" text;
--> statement-breakpoint
-- Backfill: "FT" + 5 characters with no 0/O/1/I/L, never reused. Idempotent: only rows without a code.
DO $$
DECLARE
  r record;
  c text;
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
BEGIN
  FOR r IN SELECT id FROM colleges WHERE code IS NULL LOOP
    LOOP
      c := 'FT';
      FOR i IN 1..5 LOOP
        c := c || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
      END LOOP;
      EXIT WHEN NOT EXISTS (SELECT 1 FROM colleges WHERE code = c);
    END LOOP;
    UPDATE colleges SET code = c WHERE id = r.id;
  END LOOP;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX "colleges_code_unique" ON "colleges" ("code");
