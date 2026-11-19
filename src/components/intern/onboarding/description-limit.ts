/** One limit for an experience description: the form's counter, the API schema and its error all read it. */
export const MAX_EXPERIENCE_DESCRIPTION = 4000;

/** Field-level API error for an over-long description; the key matches the form's field id (`exp.<id>.description`). */
export function descriptionLimitError(rowId: unknown): { field: string; message: string } | null {
  if (typeof rowId !== "string" || !rowId) return null;
  return { field: `exp.${rowId}.description`, message: `This description is too long. Keep it within ${MAX_EXPERIENCE_DESCRIPTION} characters.` };
}
