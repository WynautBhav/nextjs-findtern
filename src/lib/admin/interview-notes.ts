/**
 * Interview `notes` as legacy stores them: free text plus tagged lines.
 *
 *   <free text>
 *   feedback: <AI feedback link>
 *   recording: <AI recording link>
 *   feedback_text: <the employer's written feedback>
 *
 * The admin meeting-link API rewrites the first three. The employer's
 * `feedback_text:` line is never the admin's to change (ADP-33): it was being
 * matched as free text and dropped whenever `notes` was sent.
 */

import { FEEDBACK_TAG_LINE, normaliseNotes } from "../interview-feedback.ts";

const TAGGED = /^(feedback|recording): /;
const EMPLOYER_FEEDBACK = /^feedback_text:/i;

export function mergeInterviewNotes(
  existing: string | null | undefined,
  given: { notes?: string | null; feedbackLink?: string | null; recordingLink?: string | null },
): string | null {
  // The employer's feedback runs from its tag to the end of the field and can span several lines;
  // everything before it is the admin's free text and links.
  const raw = normaliseNotes(existing);
  const at = raw.search(FEEDBACK_TAG_LINE);
  const employerFeedback = at < 0 ? "" : raw.slice(at).replace(/^\n/, "").trimEnd();
  const oldLines = (at < 0 ? raw : raw.slice(0, at)).split("\n");
  const oldTag = (tag: string) => oldLines.find((l) => l.startsWith(`${tag}: `))?.slice(tag.length + 2) ?? "";
  const oldFree = oldLines
    .filter((l) => !TAGGED.test(l))
    .join("\n")
    .trim();

  // Sent empty clears that part; not sent at all keeps it.
  const pick = (value: string | null | undefined, old: string) => (value === undefined ? old : (value ?? "").trim());
  // A link is one line: a line break inside it could open a forged employer-feedback line.
  const oneLine = (value: string) => normaliseNotes(value).replace(/\n+/g, " ").trim();
  // Free text sent by the admin can't smuggle in a fake employer feedback line.
  const nextFree = normaliseNotes(pick(given.notes, oldFree))
    .split("\n")
    .filter((l) => !EMPLOYER_FEEDBACK.test(l.trim()) && !TAGGED.test(l))
    .join("\n")
    .trim();
  const nextFeedback = oneLine(pick(given.feedbackLink, oldTag("feedback")));
  const nextRecording = oneLine(pick(given.recordingLink, oldTag("recording")));

  const parts: string[] = [];
  if (nextFree) parts.push(nextFree);
  if (nextFeedback) parts.push(`feedback: ${nextFeedback}`);
  if (nextRecording) parts.push(`recording: ${nextRecording}`);
  if (employerFeedback) parts.push(employerFeedback);
  return parts.length > 0 ? parts.join("\n") : null;
}

/** Tag value from notes (`feedback`, `recording`), or "". */
export function noteTag(notes: string | null | undefined, tag: "feedback" | "recording"): string {
  // Only the part before the employer's feedback: a line inside that text is never an admin link.
  const raw = normaliseNotes(notes);
  const at = raw.search(FEEDBACK_TAG_LINE);
  return (at < 0 ? raw : raw.slice(0, at)).split("\n").find((l) => l.startsWith(`${tag}: `))?.slice(tag.length + 2) ?? "";
}

/**
 * Status after an admin saves a meeting link (ADP-07, legacy routes.ts
 * 11151-11157): every interview that is not finished becomes "scheduled",
 * for employer and AI interviews alike.
 */
export function statusAfterMeetingLink(current: string | null | undefined): string {
  const status = String(current ?? "").trim().toLowerCase();
  if (["completed", "expired", "cancelled", "canceled"].includes(status)) return String(current);
  return "scheduled";
}
