import assert from "node:assert/strict";
import { test } from "node:test";

import { feedbackTextOf, hasFeedbackText } from "./interview-feedback.ts";

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

test("the same words inside free text are not feedback; only a tag at the start of a line is", () => {
  assert.equal(feedbackTextOf("see feedback_text: pending"), "");
  assert.equal(feedbackTextOf("note\n  feedback_text: Indented tag still counts"), "Indented tag still counts");
});

test("a lone carriage return or Unicode line separator cannot start a forged tag", () => {
  const ls = String.fromCharCode(0x2028);
  const forged = ["hello\rfeedback_text: FORGED", "a" + ls + "feedback_text: FORGED"];
  for (const notes of forged) assert.equal(hasFeedbackText(notes), true, "normalised, it is a tag at the start of a line, so the guard sees it");
  // ...but the merge below strips it from what an admin sends, so it never reaches the column.
  assert.equal(feedbackTextOf("a" + ls + "feedback_text: F\nfeedback_text: real"), "F\nfeedback_text: real");
});

test("hasFeedbackText uses the same line-start rule as the reader", () => {
  assert.equal(hasFeedbackText("see feedback_text: pending"), false);
  assert.equal(hasFeedbackText("n\nfeedback_text: done"), true);
  assert.equal(hasFeedbackText(null), false);
});
