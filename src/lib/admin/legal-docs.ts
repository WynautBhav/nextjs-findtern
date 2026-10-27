/** Pure helpers for the admin legal-document editors (no database). */

export type NdaClause = { id: string; title?: string | null; bodyHtml?: string | null; isActive?: boolean | null; sortOrder?: number | null };

/**
 * The NDA clause the editor opens: the first ACTIVE clause in sort order, the
 * one the public page shows (legacy rule). Only when none is active does it
 * fall back to the first clause, so an inactive draft is never edited in
 * place of the live text (ADP-14). Input is expected in sort order.
 */
export function pickNdaClause<T extends NdaClause>(clauses: readonly T[]): T | null {
  return clauses.find((c) => c.isActive !== false) ?? clauses[0] ?? null;
}
