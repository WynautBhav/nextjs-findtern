import assert from "node:assert/strict";
import { test } from "node:test";

import { discountLabel, paymentPromo } from "./payment-promo.ts";

test("new-app intern fee: flat promoCode + discountMinor", () => {
  assert.deepEqual(paymentPromo({ promoCode: "WELCOME20", discountMinor: 49980 }), { code: "WELCOME20", discountMinor: 49980 });
});

test("new-app employer order: nested promo object", () => {
  assert.deepEqual(paymentPromo({ promo: { promoCode: "ACME10", discountMinor: 500 } }), { code: "ACME10", discountMinor: 500 });
});

test("legacy Razorpay order: raw.order.notes", () => {
  const raw = { order: { notes: { promoCode: "CAMPUS99", discountAmountMinor: 247401, originalAmountMinor: 249900 } } };
  assert.deepEqual(paymentPromo(raw), { code: "CAMPUS99", discountMinor: 247401 });
});

test("legacy older order: raw.notes, discount without a code", () => {
  const raw = { notes: { discountAmountMinor: 200000 } };
  assert.deepEqual(paymentPromo(raw), { code: null, discountMinor: 200000 });
});

test("legacy free activation: flat discountAmountMinor", () => {
  const raw = { reason: "free_promo", promoCode: "ANUDIP100", originalAmountMinor: 249900, discountAmountMinor: 249900 };
  assert.deepEqual(paymentPromo(raw, undefined, 0), { code: "ANUDIP100", discountMinor: 249900 });
});

test("falls back to the onboarding payment block (flag-only interns)", () => {
  const fallback = { isPaid: true, promoCode: "GRRASPILOT", discountAmountMinor: 249900 };
  assert.deepEqual(paymentPromo({}, fallback), { code: "GRRASPILOT", discountMinor: 249900 });
  // The payment row wins over the fallback.
  assert.equal(paymentPromo({ promoCode: "ROW" }, fallback).code, "ROW");
});

test("derives the discount from the original price when none is stored", () => {
  assert.equal(paymentPromo({ originalAmountMinor: 249900, promoCode: "X" }, undefined, 199900).discountMinor, 50000);
  assert.equal(paymentPromo({ originalAmountMinor: 249900 }, undefined, 249900).discountMinor, 0);
});

test("nothing recorded: no code, zero discount; blanks ignored", () => {
  assert.deepEqual(paymentPromo(null), { code: null, discountMinor: 0 });
  assert.deepEqual(paymentPromo({ promoCode: "  ", discountMinor: 0 }), { code: null, discountMinor: 0 });
});

test("discount label: code wins, otherwise legacy 'Discount (x%)'", () => {
  assert.equal(discountLabel({ code: "ACME10", discountMinor: 100 }, 900), "ACME10");
  assert.equal(discountLabel({ code: null, discountMinor: 200000 }, 1800000), "Discount (10%)");
  assert.equal(discountLabel({ code: null, discountMinor: 0 }, 1800000), null);
});
