import type { SessionData } from "@/lib/security/session";

/**
 * The per-request checks that decide whether a signed session cookie is still
 * honoured. They are independent reads (revoked list, account row, admin
 * permissions), so they run together: a signed-in request pays one database
 * round trip for them instead of two or three in a row. Every check still has
 * to pass; the order only matters for which one is reported, and nothing
 * reports that.
 *
 * Fail closed: a check that cannot answer (pool timeout, outage) signs the session out for that request instead of
 * letting it through. Otherwise a busy pool would accept revoked, deactivated or stale-password sessions. The cookie
 * is not touched, so the next request that gets an answer carries on as normal.
 *
 * Kept free of database imports so it can be unit tested with fakes.
 */
export interface SessionChecks {
  isRevoked(sid: string): Promise<boolean>;
  isActive(role: string, uid: string): Promise<boolean>;
  isPasswordCurrent(role: string, uid: string, pv: string | undefined): Promise<boolean>;
  /** An admin's permissions: null = admin removed, undefined = lookup failed (both refuse the session). */
  adminPermissions(uid: string): Promise<string[] | null | undefined>;
}

export async function validateSession(session: SessionData, checks: SessionChecks): Promise<SessionData | null> {
  const wantsPermissions = session.role === "admin" && !session.impersonator;
  let results: [boolean, boolean, boolean, string[] | null | undefined];
  try {
    results = await Promise.all([
      checks.isRevoked(session.sid),
      checks.isActive(session.role, session.uid),
      checks.isPasswordCurrent(session.role, session.uid, session.pv),
      wantsPermissions ? checks.adminPermissions(session.uid) : Promise.resolve(undefined),
    ]);
  } catch (err) {
    console.error("[session] validity check failed; treating the request as signed out:", err instanceof Error ? err.message : err);
    return null;
  }
  const [revoked, active, passwordCurrent, perms] = results;
  if (revoked || !active || !passwordCurrent) return null;
  if (wantsPermissions) {
    if (!perms) return null; // admin removed (null) or permission lookup failed (undefined)
    return { ...session, permissions: perms };
  }
  return session;
}
