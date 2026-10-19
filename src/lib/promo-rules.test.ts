import test from "node:test";
import assert from "node:assert/strict";

import { promoDiscount, promoProblem, type PromoRow } from "./promo-rules.ts";

const base: PromoRow = {
  code: "TEST",
  discountType: "percentage",
  discountValue: 25,
  maxUsages: null,
  usedCount: 0,
  minOrderAmountMinor: null,
  validFrom: null,
  validUntil: null,
  isActive: true,
};

test("percentage discount", () => {
  assert.equal(promoDiscount(base, 2100000, "INR"), 525000);
  assert.equal(promoDiscount(base, 21000, "USD"), 5250);
});

test("fixed discount converts for USD and is capped at the order", () => {
  const fixed = { ...base, discountType: "fixed", discountValue: 500000 }; // ₹5,000 in paise
  assert.equal(promoDiscount(fixed, 2100000, "INR"), 500000);
  assert.equal(promoDiscount(fixed, 21000, "USD"), 5000);
  assert.equal(promoDiscount(fixed, 300000, "INR"), 300000);
});

test("validity checks", () => {
  const now = new Date("2026-10-18T00:00:00Z");
  assert.equal(promoProblem(base, 1000, "INR", now), null);
  assert.equal(promoProblem({ ...base, isActive: false }, 1000, "INR", now), "Invalid promo code");
  assert.equal(
    promoProblem({ ...base, validUntil: new Date("2026-10-01") }, 1000, "INR", now),
    "Promo code expired",
  );
  assert.equal(
    promoProblem({ ...base, validFrom: new Date("2026-11-01") }, 1000, "INR", now),
    "Promo code is not active yet",
  );
  assert.equal(promoProblem({ ...base, maxUsages: 2, usedCount: 2 }, 1000, "INR", now), "Promo code exhausted");
});

test("minimum order converts for USD", () => {
  const min = { ...base, minOrderAmountMinor: 1000000 }; // ₹10,000
  assert.notEqual(promoProblem(min, 999999, "INR"), null);
  assert.equal(promoProblem(min, 1000000, "INR"), null);
  assert.notEqual(promoProblem(min, 9999, "USD"), null); // $99.99
  assert.equal(promoProblem(min, 10000, "USD"), null); // $100
});

test("promo audience and window", async () => {
  const { promoAudienceProblem, promoWindowProblem } = await import("./promo-rules.ts");
  assert.equal(promoAudienceProblem("both", "employer"), null);
  assert.equal(promoAudienceProblem(undefined, "intern"), null);
  assert.ok(promoAudienceProblem("intern", "employer"));
  assert.ok(promoAudienceProblem("employer", "intern"));
  assert.ok(promoWindowProblem(new Date("2026-11-02"), new Date("2026-11-01")));
  assert.equal(promoWindowProblem(new Date("2026-11-01"), new Date("2026-11-01")), null);
  assert.equal(promoWindowProblem(null, new Date("2026-11-01")), null);
});
