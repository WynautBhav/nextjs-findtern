import assert from "node:assert/strict";
import { test } from "node:test";

import { hasSlotProblem, slotProblem, slotProblems } from "./meeting-slots-model.ts";

// 2026-11-19 11:00 in India.
const NOW = Date.parse("2026-11-19T11:00:00+05:30");
const IST = "Asia/Kolkata";

test("a past date gets a sentence under the field, not a browser tooltip (B-42)", () => {
  assert.equal(slotProblem("2026-11-18T09:00", IST, NOW), "This date has passed. Pick today or a later date.");
  assert.equal(slotProblem("2020-01-01T09:00", IST, NOW), "This date has passed. Pick today or a later date.");
});

test("today: a time that has passed is refused, a later one is fine", () => {
  assert.equal(slotProblem("2026-11-19T10:45", IST, NOW), "This time has passed. Pick a later time.");
  assert.equal(slotProblem("2026-11-19T11:00", IST, NOW), "This time has passed. Pick a later time.");
  assert.equal(slotProblem("2026-11-19T11:15", IST, NOW), null);
});

test("the day is judged in the meeting's zone, not the browser's", () => {
  // 11:00 IST is 00:30 on the 19th in New York: 00:45 is still ahead there, long gone in India.
  assert.equal(slotProblem("2026-11-19T00:45", "America/New_York", NOW), null);
  assert.equal(slotProblem("2026-11-19T00:45", IST, NOW), "This time has passed. Pick a later time.");
});

test("more than 14 days out is refused; the 14th day is fine", () => {
  assert.equal(slotProblem("2026-12-03T10:00", IST, NOW), null);
  assert.equal(slotProblem("2026-12-04T10:00", IST, NOW), "Pick a date within the next 14 days.");
});

test("an empty or half-typed slot is not judged here (required handles it)", () => {
  assert.equal(slotProblem("", IST, NOW), null);
  assert.equal(slotProblem("2026-1", IST, NOW), null);
});

test("hasSlotProblem disables submit while any slot is wrong and frees it once fixed", () => {
  const slots = ["2026-11-20T10:00", "2026-11-18T10:00", "2026-11-21T10:00"];
  assert.deepEqual(slotProblems(slots, IST, NOW).map(Boolean), [false, true, false]);
  assert.equal(hasSlotProblem(slots, IST, NOW), true);
  assert.equal(hasSlotProblem(["2026-11-20T10:00", "2026-11-20T11:00", "2026-11-21T10:00"], IST, NOW), false);
});
