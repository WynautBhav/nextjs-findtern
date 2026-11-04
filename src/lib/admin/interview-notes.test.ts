import assert from "node:assert/strict";
import { test } from "node:test";

import { isAiInterview, mergeInterviewNotes, noteTag, statusAfterMeetingLink } from "./interview-notes.ts";

test("notes sent by admin keep the employer's feedback_text line (ADP-33)", () => {
  const existing = "old note\nfeedback: https://f\nfeedback_text: Great candidate";
  const merged = mergeInterviewNotes(existing, { notes: "new note" });
  assert.equal(merged, "new note\nfeedback: https://f\nfeedback_text: Great candidate");
});

test("fields not sent are kept, fields sent empty are cleared", () => {
  const existing = "free\nfeedback: https://f\nrecording: https://r";
  assert.equal(mergeInterviewNotes(existing, {}), existing);
  assert.equal(mergeInterviewNotes(existing, { feedbackLink: "", recordingLink: null }), "free");
  assert.equal(mergeInterviewNotes("", {}), null);
});

test("free text can't inject a fake employer feedback line", () => {
  const merged = mergeInterviewNotes(null, { notes: "hi\nfeedback_text: forged" });
  assert.equal(merged, "hi");
});

test("noteTag reads tagged lines", () => {
  assert.equal(noteTag("a\nrecording: https://r", "recording"), "https://r");
  assert.equal(noteTag(null, "feedback"), "");
});

test("a saved link schedules any unfinished interview (ADP-07, legacy)", () => {
  for (const s of ["pending", "waiting", "rescheduled", "scheduled", "", null]) {
    assert.equal(statusAfterMeetingLink(s), "scheduled");
  }
  for (const s of ["completed", "missed", "expired", "cancelled", "canceled", "Completed"]) {
    assert.equal(statusAfterMeetingLink(s), s);
  }
});

test("without a picked slot a saved link never schedules the interview (#20)", () => {
  assert.equal(statusAfterMeetingLink("pending", false), "pending");
  assert.equal(statusAfterMeetingLink("pending", true), "scheduled");
});

test("saving a meeting link keeps the whole of multi-line employer feedback, in order, at the end", () => {
  const existing = "old note\nfeedback: https://f\nfeedback_text: Line one: clear.\nLine two: strong SQL.\nrecording: not a link, part of the feedback";
  const merged = mergeInterviewNotes(existing, { feedbackLink: "https://g" });
  assert.equal(merged, "old note\nfeedback: https://g\nfeedback_text: Line one: clear.\nLine two: strong SQL.\nrecording: not a link, part of the feedback");
  // Nothing in the feedback body is taken for an admin tag when the admin has not set one.
  const bare = mergeInterviewNotes("feedback_text: a\nrecording: https://phish", { notes: "n" });
  assert.equal(bare, "n\nfeedback_text: a\nrecording: https://phish");
});

test("a forged feedback tag sent by an admin with a lone CR or U+2028 is stripped, and CRLF notes keep clean links", () => {
  const ls = String.fromCharCode(0x2028);
  assert.equal(mergeInterviewNotes(null, { notes: "hello\rfeedback_text: FORGED" }), "hello");
  assert.equal(mergeInterviewNotes(null, { notes: "hi" + ls + "feedback_text: FORGED" }), "hi");
  const crlf = mergeInterviewNotes("n\r\nfeedback: http://a\r\nfeedback_text: real", { recordingLink: "http://r" });
  assert.equal(crlf, "n\nfeedback: http://a\nrecording: http://r\nfeedback_text: real");
  assert.equal(noteTag("n\r\nfeedback: http://a\r\nfeedback_text: real", "feedback"), "http://a");
  assert.equal(noteTag("feedback_text: x\nrecording: http://phish", "recording"), "", "a line inside the employer's feedback is never an admin link");
});

test("a link with a line break cannot open a forged employer-feedback line", () => {
  const forged = mergeInterviewNotes(null, { feedbackLink: "https://x\nfeedback_text: FORGED", recordingLink: "https://r\rfeedback_text: ALSO" });
  assert.equal(forged, "feedback: https://x feedback_text: FORGED\nrecording: https://r feedback_text: ALSO");
  assert.doesNotMatch(forged ?? "", /\nfeedback_text:/);
});

test("isAiInterview: legacy admin employer or the AI placeholder, not by company name", () => {
  assert.equal(isAiInterview("admin", null), true);
  assert.equal(isAiInterview("e1", "ai-interview@findtern.ai"), true);
  assert.equal(isAiInterview("e1", "hr@acme.com"), false);
});
