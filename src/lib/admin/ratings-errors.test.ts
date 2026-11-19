import assert from "node:assert/strict";
import test from "node:test";

import { ratingsErrorSummary, ratingsFieldErrors } from "./ratings-errors.ts";

test("a bad Incruiter report link names that field (B-37)", () => {
  const fields = ratingsFieldErrors([{ path: ["aiFeedbackLink"], message: "x" }]);
  assert.deepEqual(fields, { aiFeedbackLink: "Incruiter report link must start with https://" });
  assert.equal(ratingsErrorSummary(fields), "Incruiter report link must start with https://");
});

test("the recording link and a rating axis get their own message", () => {
  const fields = ratingsFieldErrors([
    { path: ["aiRecordingLink"] },
    { path: ["coding"] },
    { path: ["coding"], message: "second issue is ignored" },
  ]);
  assert.deepEqual(fields, {
    aiRecordingLink: "Incruiter recording link must start with https://",
    coding: "Coding must be a number from 0 to 10.",
  });
});

test("an unknown field falls back to the validator message, and no issues to a generic summary", () => {
  assert.deepEqual(ratingsFieldErrors([{ path: ["other"], message: "Bad" }]), { other: "Bad" });
  assert.deepEqual(ratingsFieldErrors([{ path: [] }]), {});
  assert.equal(ratingsErrorSummary({}), "Invalid input");
});
