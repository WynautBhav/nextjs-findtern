import assert from "node:assert/strict";
import { test } from "node:test";

import { ageOf, daysPhrase } from "./age-label.ts";

const now = new Date("2026-11-18T10:00:00Z");
const ago = (ms: number) => new Date(now.getTime() - ms);

test("ageOf picks the coarsest useful unit", () => {
  assert.equal(ageOf(ago(20_000), now).label, "now");
  assert.equal(ageOf(ago(12 * 60_000), now).label, "12 min");
  assert.equal(ageOf(ago(5 * 3_600_000), now).label, "5 h");
  assert.deepEqual(ageOf(ago(3 * 86_400_000 + 1000), now), { label: "3 d", days: 3 });
  assert.deepEqual(ageOf(ago(30 * 86_400_000), now), { label: "4 wk", days: 30 });
});

test("ageOf never goes negative and survives bad dates", () => {
  assert.equal(ageOf(new Date(now.getTime() + 9e6), now).label, "now");
  assert.deepEqual(ageOf(null, now), { label: "-", days: 0 });
  assert.deepEqual(ageOf("nonsense", now), { label: "-", days: 0 });
});

test("daysPhrase words the days", () => {
  assert.equal(daysPhrase(0), "today");
  assert.equal(daysPhrase(1), "1 day");
  assert.equal(daysPhrase(9), "9 days");
});
