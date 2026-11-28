/**
 * Is this placement a hire? Status "hired" is the normal mark, but a row can
 * carry `hiredAt` with an older status (seeded rows, and any migrated legacy
 * row written before the status was normalised). Either one counts, and so does a
 * finished internship (`completed`), so a
 * real hire never shows the intern "Hidden company" or masks the intern from
 * the company that hired them. The SQL twin is `hiredProposalSql` in
 * employer-visibility.
 */
/** The statuses that are a hire on their own: hired, and completed (the internship finished; it was a hire first). */
export const HIRED_STATUSES = ["hired", "completed"] as const;

export function isHiredProposal(p: { status?: string | null; hiredAt?: Date | string | null }): boolean {
  return (HIRED_STATUSES as readonly string[]).includes((p.status ?? "").toLowerCase()) || Boolean(p.hiredAt);
}
