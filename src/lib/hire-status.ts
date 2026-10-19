/**
 * Is this placement a hire? Status "hired" is the normal mark, but a row can
 * carry `hiredAt` with an older status (seeded rows, and any migrated legacy
 * row written before the status was normalised). Either one counts, so a
 * real hire never shows the intern "Hidden company" or masks the intern from
 * the company that hired them. The SQL twin is `hiredProposalSql` in
 * employer-visibility.
 */
export function isHiredProposal(p: { status?: string | null; hiredAt?: Date | string | null }): boolean {
  return (p.status ?? "").toLowerCase() === "hired" || Boolean(p.hiredAt);
}
