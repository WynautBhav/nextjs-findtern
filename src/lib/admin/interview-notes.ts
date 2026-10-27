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

const TAGGED = /^(feedback|recording): /;
const EMPLOYER_FEEDBACK = /^feedback_text:/i;

export function mergeInterviewNotes(
  existing: string | null | undefined,
  given: { notes?: string | null; feedbackLink?: string | null; recordingLink?: string | null },
): string | null {
  const oldLines = String(existing ?? "").split("\n");
  const oldTag = (tag: string) => oldLines.find((l) => l.startsWith(`${tag}: `))?.slice(tag.length + 2) ?? "";
  const employerFeedback = oldLines.filter((l) => EMPLOYER_FEEDBACK.test(l.trim()));
  const oldFree = oldLines
    .filter((l) => !TAGGED.test(l) && !EMPLOYER_FEEDBACK.test(l.trim()))
    .join("\n")
    .trim();

  // Sent empty clears that part; not sent at all keeps it.
  const pick = (value: string | null | undefined, old: string) => (value === undefined ? old : (value ?? "").trim());
  // Free text sent by the admin can't smuggle in a fake employer feedback line.
  const nextFree = pick(given.notes, oldFree)
    .split("\n")
    .filter((l) => !EMPLOYER_FEEDBACK.test(l.trim()) && !TAGGED.test(l))
    .join("\n")
    .trim();
  const nextFeedback = pick(given.feedbackLink, oldTag("feedback"));
  const nextRecording = pick(given.recordingLink, oldTag("recording"));

  const parts: string[] = [];
  if (nextFree) parts.push(nextFree);
  if (nextFeedback) parts.push(`feedback: ${nextFeedback}`);
  if (nextRecording) parts.push(`recording: ${nextRecording}`);
  parts.push(...employerFeedback);
  return parts.length > 0 ? parts.join("\n") : null;
}

/** Tag value from notes (`feedback`, `recording`), or "". */
export function noteTag(notes: string | null | undefined, tag: "feedback" | "recording"): string {
  return String(notes ?? "").split("\n").find((l) => l.startsWith(`${tag}: `))?.slice(tag.length + 2) ?? "";
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
