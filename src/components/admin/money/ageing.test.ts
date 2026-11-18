import assert from "node:assert/strict";
import { test } from "node:test";
import { ageFromDays, ageOf } from "./ageing.ts";

const now = new Date("2026-11-18T10:00:00Z");

test("ageOf: same day is today and ok", () => {
  assert.deepEqual(ageOf("2026-11-18T01:00:00Z", now), { days: 0, label: "today", band: "ok" });
});
test("ageOf: bands switch at 3 and 8 days", () => {
  assert.equal(ageOf("2026-11-16T09:00:00Z", now)?.band, "ok");
  assert.equal(ageOf("2026-11-15T09:00:00Z", now)?.band, "aging");
  assert.equal(ageOf("2026-11-10T09:00:00Z", now)?.band, "late");
  assert.equal(ageOf("2026-11-11T09:00:00Z", now)?.band, "aging");
});
test("ageOf: months past 60 days, future dates clamp to 0, junk is null", () => {
  assert.equal(ageOf("2026-08-01T00:00:00Z", now)?.label, "3 mo");
  assert.equal(ageOf("2026-12-01T00:00:00Z", now)?.days, 0);
  assert.equal(ageOf(null, now), null);
  assert.equal(ageOf("nope", now), null);
});

test("ageFromDays: 0 reads today, never 0 d; junk is null", () => {
  assert.equal(ageFromDays(0)?.label, "today");
  assert.equal(ageFromDays(17)?.band, "late");
  assert.equal(ageFromDays(NaN), null);
  assert.equal(ageFromDays(null), null);
});
