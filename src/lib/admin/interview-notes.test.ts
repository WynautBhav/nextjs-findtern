import assert from "node:assert/strict";
import { test } from "node:test";

import { mergeInterviewNotes, noteTag, statusAfterMeetingLink } from "./interview-notes.ts";

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
  for (const s of ["completed", "expired", "cancelled", "canceled", "Completed"]) {
    assert.equal(statusAfterMeetingLink(s), s);
  }
});
