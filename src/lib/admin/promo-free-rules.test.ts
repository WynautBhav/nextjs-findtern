import assert from "node:assert/strict";
import test from "node:test";

import { promoMakesFree } from "./promo-edit-rules.ts";

const prices = { activationMinor: 249_900, subscriptionMinor: 1_000_000 };
const free = (discountType: string, discountValue: number, appliesTo: string | null) => promoMakesFree({ discountType, discountValue, appliesTo }, prices);

test("a full waiver and a 100% code make the price zero, whatever the audience", () => {
  assert.equal(free("full_waiver", 100, "employer"), true);
  assert.equal(free("percentage", 100, "intern"), true);
  assert.equal(free("percentage", 100, null), true);
});

test("a fixed code is free at or above the price of what it is for, and not below it", () => {
  assert.equal(free("fixed", 249_900, "intern"), true);
  assert.equal(free("fixed", 249_899, "intern"), false);
  assert.equal(free("fixed", 99_999_999, "both"), true);
  assert.equal(free("fixed", 99_999_999, null), true);
  assert.equal(free("fixed", 1_000_000, "subscription"), true);
  assert.equal(free("fixed", 999_999, "subscription"), false);
});

test("ordinary discounts are not free; an employer hiring code never takes the hiring charge to zero", () => {
  assert.equal(free("percentage", 99, "intern"), false);
  assert.equal(free("percentage", 10, "employer"), false);
  assert.equal(free("fixed", 99_999_999, "employer"), false);
});
