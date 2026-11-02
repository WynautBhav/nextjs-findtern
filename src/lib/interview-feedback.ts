/**
 * The employer's written feedback on a meeting. It is stored inside the
 * interview's `notes` as `feedback_text: <the whole text>`, always the last tag
 * (see admin/interview-notes.ts), and the text can run over several lines. Both
 * the employer's schedule and the intern's interviews page read it through here,
 * so neither cuts it at the first line break (bug sheet 30 Oct: "line break
 * feedback is not visible from candidate side").
 */
const MARK = "feedback_text:";

/** The feedback with its line breaks, or "" when there is none. */
export function feedbackTextOf(notes: string | null | undefined): string {
  const raw = notes ?? "";
  const at = raw.toLowerCase().indexOf(MARK);
  if (at < 0) return "";
  return raw.slice(at + MARK.length).replace(/\r\n?/g, "\n").trim();
}
