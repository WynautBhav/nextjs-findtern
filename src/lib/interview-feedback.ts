/**
 * The employer's written feedback on a meeting. It is stored inside the
 * interview's `notes` as `feedback_text: <the whole text>`, always the last tag
 * (see admin/interview-notes.ts), and the text can run over several lines. Both
 * the employer's schedule and the intern's interviews page read it through here,
 * so neither cuts it at the first line break (bug sheet 30 Oct: "line break
 * feedback is not visible from candidate side").
 *
 * The tag only counts at the start of a line, and a "line" is a "\n" after the
 * notes have been normalised: a lone carriage return or a Unicode line separator
 * typed into free text must not be able to start a forged tag.
 */

/** The tag at the start of a line (after normaliseNotes). */
export const FEEDBACK_TAG_LINE = /(?:^|\n)[ \t]*feedback_text:/i;
/** The same rule as a Postgres regular expression, for a query on the notes column. */
// Written with char codes so no raw separator character sits inside a regex literal.
const LS = String.fromCharCode(0x2028);
const PS = String.fromCharCode(0x2029);
const LINE_BREAKS = new RegExp("\\r\\n?|[" + LS + PS + "]", "g");
/** Also counts a lone CR or a Unicode separator as a line start, as normaliseNotes does. */
export const FEEDBACK_TAG_LINE_SQL = "(^|\\n|\\r|" + LS + "|" + PS + ")[ \\t]*feedback_text:";

/** Every kind of line break becomes "\n". */
export function normaliseNotes(notes: string | null | undefined): string {
  return (notes ?? "").replace(LINE_BREAKS, "\n");
}

/** Whether the notes already carry employer feedback. */
export function hasFeedbackText(notes: string | null | undefined): boolean {
  return FEEDBACK_TAG_LINE.test(normaliseNotes(notes));
}

/** The feedback with its line breaks, or "" when there is none. */
export function feedbackTextOf(notes: string | null | undefined): string {
  const raw = normaliseNotes(notes);
  const found = FEEDBACK_TAG_LINE.exec(raw);
  if (!found) return "";
  return raw.slice(found.index + found[0].length).trim();
}
