import assert from "node:assert/strict";
import { test } from "node:test";

import {
  FEE_BANDS,
  PER_HIRE_FEE_DEFAULT,
  feeBandOf,
  parsePerHireFeeSetting,
  perHireChargedFor,
  perHireChargedForScore,
} from "./per-hire-fee.ts";

test("default: Espresso charged, Cappuccino and Latte free", () => {
  assert.deepEqual(PER_HIRE_FEE_DEFAULT, { standard: true, skilled: false, assured: false });
  assert.deepEqual(parsePerHireFeeSetting(undefined), PER_HIRE_FEE_DEFAULT);
  assert.deepEqual(parsePerHireFeeSetting(null), PER_HIRE_FEE_DEFAULT);
});

test("parse is tolerant of garbage and merges per band", () => {
  for (const bad of ["", "not json", "[]", 7, true, [], ["x"], "null", "12"]) {
    assert.deepEqual(parsePerHireFeeSetting(bad), PER_HIRE_FEE_DEFAULT, JSON.stringify(bad));
  }
  assert.deepEqual(parsePerHireFeeSetting({ skilled: true }), { standard: true, skilled: true, assured: false });
  assert.deepEqual(parsePerHireFeeSetting({ standard: false, skilled: "yes", assured: 1 }), { standard: false, skilled: false, assured: false });
  assert.deepEqual(parsePerHireFeeSetting('{"standard":false,"assured":true}'), { standard: false, skilled: false, assured: true });
});

test("parse never mutates the shared default", () => {
  const out = parsePerHireFeeSetting({ standard: false });
  out.skilled = true;
  assert.deepEqual(PER_HIRE_FEE_DEFAULT, { standard: true, skilled: false, assured: false });
});

test("band ids and plan slugs map to the same bands", () => {
  const cases: [string, "standard" | "skilled" | "assured"][] = [
    ["standard", "standard"], ["espresso", "standard"], ["Espresso-IN", "standard"],
    ["skilled", "skilled"], ["cappuccino", "skilled"], ["CAPPUCCINO", "skilled"],
    ["assured", "assured"], ["latte", "assured"], ["latte-plan", "assured"],
  ];
  for (const [input, band] of cases) assert.equal(feeBandOf(input), band, input);
  for (const none of ["", "  ", null, undefined, "zzz"]) assert.equal(feeBandOf(none as string), null);
});

test("perHireChargedFor follows each band; an unknown plan stays charged", () => {
  for (const band of FEE_BANDS) {
    for (const on of [true, false]) {
      const setting = { ...PER_HIRE_FEE_DEFAULT, standard: false, skilled: false, assured: false, [band]: on };
      assert.equal(perHireChargedFor(band, setting), on);
    }
  }
  assert.equal(perHireChargedFor("espresso", PER_HIRE_FEE_DEFAULT), true);
  assert.equal(perHireChargedFor("cappuccino", PER_HIRE_FEE_DEFAULT), false);
  assert.equal(perHireChargedFor("latte", PER_HIRE_FEE_DEFAULT), false);
  assert.equal(perHireChargedFor("zzz", { standard: false, skilled: false, assured: false }), true);
});

test("score bands: 0-6 Espresso, 6-8 Cappuccino, 8-10 Latte; no score is charged", () => {
  const s = PER_HIRE_FEE_DEFAULT;
  assert.equal(perHireChargedForScore(5.99, s), true);
  assert.equal(perHireChargedForScore(6, s), false);
  assert.equal(perHireChargedForScore(7.99, s), false);
  assert.equal(perHireChargedForScore(8, s), false);
  assert.equal(perHireChargedForScore(10, s), false);
  assert.equal(perHireChargedForScore(null, s), true);
  assert.equal(perHireChargedForScore(0, s), true);
  assert.equal(perHireChargedForScore(7, { standard: true, skilled: true, assured: false }), true);
});
