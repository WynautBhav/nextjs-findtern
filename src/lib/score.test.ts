import test from "node:test";
import assert from "node:assert/strict";

import {
  BANDS,
  BANDS_USD,
  bandFor,
  bandsForRegion,
  currencyForRegion,
} from "./score.ts";

test("USD bands mirror INR geometry with whole-dollar money", () => {
  assert.equal(BANDS_USD.length, BANDS.length);
  for (const [i, usd] of BANDS_USD.entries()) {
    const inr = BANDS[i];
    assert.equal(usd.id, inr.id);
    assert.equal(usd.min, inr.min);
    assert.equal(usd.max, inr.max);
    assert.equal(usd.name, inr.name);
    // Whole major units only - never $1.20/hr.
    assert.equal(usd.rateMinor % 100, 0);
    assert.equal(usd.perHireMinor % 100, 0);
  }
});

test("USD card reads $0 / $1 / $2 with a $50 per-hire charge", () => {
  const byId = Object.fromEntries(BANDS_USD.map((b) => [b.id, b]));
  assert.equal(byId.standard.rateMinor, 0);
  assert.equal(byId.standard.perHireMinor, 5000);
  assert.equal(byId.skilled.rateMinor, 100);
  assert.equal(byId.skilled.perHireMinor, 5000);
  assert.equal(byId.assured.rateMinor, 200);
  assert.equal(byId.assured.perHireMinor, 5000);
});

test("bandsForRegion picks the right card", () => {
  assert.equal(bandsForRegion(true), BANDS);
  assert.equal(bandsForRegion(false), BANDS_USD);
  assert.equal(currencyForRegion(true), "INR");
  assert.equal(currencyForRegion(false), "USD");
});

test("band geometry is shared across regions", () => {
  for (const score of [0, 5.9, 6, 7.5, 8, 10]) {
    const inr = bandFor(score);
    const usd = bandsForRegion(false).find((b) => b.id === inr.id);
    assert.ok(usd, `band ${inr.id} exists in USD set`);
  }
});
