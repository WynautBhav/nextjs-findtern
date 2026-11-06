/** Whether a session id is on the revoked list. Pure, so it is testable without a database. */
export function isRevoked(revoked: ReadonlySet<string>, sid: string | undefined | null): boolean {
  return Boolean(sid) && revoked.has(String(sid));
}
