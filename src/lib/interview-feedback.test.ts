import assert from "node:assert/strict";
import { test } from "node:test";

import { feedbackTextOf } from "./interview-feedback.ts";

test("feedback keeps every line, not just the first", () => {
  const notes = "Intro call\nfeedback: https://ai.example/f\nrecording: https://ai.example/r\nfeedback_text: Line one: clear.\nLine two: strong SQL.\n\nLine four.";
  assert.equal(feedbackTextOf(notes), "Line one: clear.\nLine two: strong SQL.\n\nLine four.");
});

test("feedback on its own, with Windows line breaks, reads the same", () => {
  assert.equal(feedbackTextOf("feedback_text: One\r\nTwo"), "One\nTwo");
});

test("no feedback, an empty one, or nothing at all gives an empty string", () => {
  assert.equal(feedbackTextOf(null), "");
  assert.equal(feedbackTextOf(undefined), "");
  assert.equal(feedbackTextOf("just a note"), "");
  assert.equal(feedbackTextOf("feedback_text:   "), "");
});
