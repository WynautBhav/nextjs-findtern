import assert from "node:assert/strict";
import { test } from "node:test";

import { buildRatingsPayload, clearScorePayload, ratingOutOfRange } from "./ratings-payload.ts";

const empty = { communication: "", coding: "", aptitude: "", interview: "" };
const base = { values: empty, ratings: {}, feedbackLink: "", recordingLink: "" };

test("a plain Save with all boxes empty sends nothing (an imported score must survive)", () => {
  assert.deepEqual(buildRatingsPayload(base), { ok: false, error: "Nothing changed." });
});

test("boxes matching the stored ratings send nothing", () => {
  const r = buildRatingsPayload({ ...base, values: { ...empty, coding: "7.5" }, ratings: { coding: 7.5 } });
  assert.deepEqual(r, { ok: false, error: "Nothing changed." });
});

test("only the changed axis is sent", () => {
  const r = buildRatingsPayload({ ...base, values: { ...empty, coding: "8", aptitude: "6" }, ratings: { aptitude: 6 } });
  assert.deepEqual(r, { ok: true, payload: { coding: 8 } });
});

test("emptying a box that had a rating clears just that rating", () => {
  const r = buildRatingsPayload({ ...base, values: empty, ratings: { coding: 7 } });
  assert.deepEqual(r, { ok: true, payload: { coding: null } });
});

test("out-of-range and non-numeric values are rejected", () => {
  assert.equal(buildRatingsPayload({ ...base, values: { ...empty, coding: "11" } }).ok, false);
  assert.equal(buildRatingsPayload({ ...base, values: { ...empty, coding: "abc" } }).ok, false);
});

test("a changed link is sent trimmed, alone", () => {
  const r = buildRatingsPayload({ ...base, feedbackLink: " https://x.test/r.pdf ", initialFeedbackLink: null });
  assert.deepEqual(r, { ok: true, payload: { aiFeedbackLink: "https://x.test/r.pdf" } });
});

test("clearScorePayload nulls all four axes", () => {
  assert.deepEqual(clearScorePayload(), { communication: null, coding: null, aptitude: null, interview: null });
});

test("an axis above 10 or below 0 is refused, 10 and 0 are fine", () => {
  const empty = { communication: "", coding: "", aptitude: "", interview: "" };
  assert.equal(buildRatingsPayload({ ...base, values: { ...empty, coding: "11" } }).ok, false);
  assert.equal(buildRatingsPayload({ ...base, values: { ...empty, coding: "-1" } }).ok, false);
  assert.equal(buildRatingsPayload({ ...base, values: { ...empty, coding: "10" } }).ok, true);
  assert.equal(buildRatingsPayload({ ...base, values: { ...empty, coding: "0" } }).ok, true);
});

test("ratingOutOfRange drives the inline error", () => {
  assert.equal(ratingOutOfRange("10.1"), true);
  assert.equal(ratingOutOfRange("-0.5"), true);
  assert.equal(ratingOutOfRange("abc"), true);
  assert.equal(ratingOutOfRange("7.5"), false);
  assert.equal(ratingOutOfRange(""), false);
});
