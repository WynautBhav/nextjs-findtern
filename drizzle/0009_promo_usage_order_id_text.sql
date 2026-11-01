-- Hand-written. The legacy database created promo_code_usages.order_id as
-- varchar(36); schema.ts declares it unbounded. Order ids for test, free and
-- fully discounted orders are longer than 36 characters ("test_" + a UUID is
-- 41), so recording the use of a promo code failed with "value too long for
-- type character varying(36)" and rolled the whole settlement back (HTTP 500,
-- the order marked failed). Make the database match the schema. Widening
-- varchar to text only changes the catalog; the table is not rewritten, and
-- running it again is a no-op.
ALTER TABLE "promo_code_usages" ALTER COLUMN "order_id" TYPE text;
