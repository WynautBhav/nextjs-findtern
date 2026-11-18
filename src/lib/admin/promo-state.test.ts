import assert from "node:assert/strict";
import { test } from "node:test";

import { expiryRelative, isUsedUp, promoState, usedShare } from "./promo-state.ts";

const now = new Date("2026-11-18T10:00:00Z");
const base = { isActive: true, maxUsages: null, usedCount: 0, validUntil: null };

test("a live code with room and no end date is active", () => {
  assert.equal(promoState(base, now), "active");
  assert.equal(promoState({ ...base, maxUsages: 50, usedCount: 49 }, now), "active");
});

test("switched off is paused", () => {
  assert.equal(promoState({ ...base, isActive: false }, now), "paused");
});

test("at or over the limit is used up, even when paused or expired (the page's Used up count)", () => {
  assert.equal(promoState({ ...base, maxUsages: 50, usedCount: 50 }, now), "used_up");
  assert.equal(promoState({ ...base, maxUsages: 50, usedCount: 51, isActive: false }, now), "used_up");
  assert.equal(promoState({ ...base, maxUsages: 1, usedCount: 1, validUntil: "2026-11-01T00:00:00Z" }, now), "used_up");
});

test("no limit (null) or a zero limit is never used up", () => {
  assert.equal(isUsedUp({ maxUsages: null, usedCount: 9999 }), false);
  assert.equal(isUsedUp({ maxUsages: 0, usedCount: 3 }), false);
});

test("past the end date is expired; the end instant itself is not", () => {
  assert.equal(promoState({ ...base, validUntil: "2026-11-18T09:59:59Z" }, now), "expired");
  assert.equal(promoState({ ...base, validUntil: "2026-11-18T10:00:00Z" }, now), "active");
  assert.equal(promoState({ ...base, isActive: false, validUntil: "2026-11-01T00:00:00Z" }, now), "expired");
});

test("the bar is the true share, capped at the whole, and absent without a limit", () => {
  assert.equal(usedShare({ maxUsages: 200, usedCount: 50 }), 0.25);
  assert.equal(usedShare({ maxUsages: 50, usedCount: 0 }), 0);
  assert.equal(usedShare({ maxUsages: 50, usedCount: 80 }), 1);
  assert.equal(usedShare({ maxUsages: null, usedCount: 5 }), null);
});

test("expiry reads in whole days", () => {
  assert.equal(expiryRelative(null, now), "no expiry");
  assert.equal(expiryRelative("2026-11-18T18:00:00Z", now), "today");
  assert.equal(expiryRelative("2026-11-19T09:59:00Z", now), "today");
  assert.equal(expiryRelative("2026-11-19T10:00:00Z", now), "tomorrow");
  assert.equal(expiryRelative("2026-11-25T10:00:00Z", now), "in 7 days");
  assert.equal(expiryRelative("2026-11-17T10:00:00Z", now), "yesterday");
  assert.equal(expiryRelative("2026-11-10T09:00:00Z", now), "8 days ago");
  assert.equal(expiryRelative("2026-11-18T08:00:00Z", now), "earlier today");
});
