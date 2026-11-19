/**
 * Field-level validation messages for the admin ratings route, so a bad link names the field
 * instead of answering "Invalid input" for the whole form (B-37). Pure, so it is unit-tested.
 */

const AXIS_LABEL: Record<string, string> = {
  communication: "Communication",
  coding: "Coding",
  aptitude: "Aptitude",
  interview: "AI interview",
};

const LINK_LABEL: Record<string, string> = {
  aiFeedbackLink: "Incruiter report link",
  aiRecordingLink: "Incruiter recording link",
};

type IssueLike = { path: PropertyKey[]; message?: string };

/** Maps zod issues to `{ field: message }`; the first issue per field wins. */
export function ratingsFieldErrors(issues: readonly IssueLike[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of issues) {
    const field = typeof issue.path[0] === "string" ? issue.path[0] : "";
    if (!field || out[field]) continue;
    if (LINK_LABEL[field]) out[field] = `${LINK_LABEL[field]} must start with https://`;
    else if (AXIS_LABEL[field]) out[field] = `${AXIS_LABEL[field]} must be a number from 0 to 10.`;
    else out[field] = issue.message || "Invalid value.";
  }
  return out;
}

/** The one-line summary for callers that show a single banner. */
export function ratingsErrorSummary(fields: Record<string, string>): string {
  const first = Object.values(fields)[0];
  return first ?? "Invalid input";
}
