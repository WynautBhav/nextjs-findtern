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
  /** The account is frozen by an admin (on hold). Optional so a caller with no hold concept keeps working. */
  isHeld?(role: string, uid: string): Promise<boolean>;
  /** A frozen intern an admin let keep working (and whose paid hire still runs). Only asked when the account is held. */
  isWorkExempt?(role: string, uid: string): Promise<boolean>;
  /** An admin's permissions: null = admin removed, undefined = lookup failed (both refuse the session). */
  adminPermissions(uid: string): Promise<string[] | null | undefined>;
}

/**
 * Why a session was refused. "disabled" is only ever answered for a session that was otherwise good (signed by us, not
 * revoked, password current): its holder has proven who they are, so telling them the account was switched off leaks
 * nothing. Everything else is plain "signed out".
 */
export type SessionVerdict =
  | { session: SessionData }
  | { session: null; denied: "signed_out" | "disabled" }
  /** Frozen: the session is valid but RESTRICTED. `restricted` is that session, for the central guard (lib/auth.ts) to hand out only on allowlisted routes. */
  | { session: null; denied: "held"; restricted: SessionData; workExempt: boolean };

export async function validateSession(session: SessionData, checks: SessionChecks): Promise<SessionData | null> {
  return (await sessionVerdict(session, checks)).session;
}

export async function sessionVerdict(session: SessionData, checks: SessionChecks): Promise<SessionVerdict> {
  const wantsPermissions = session.role === "admin" && !session.impersonator;
  let results: [boolean, boolean, boolean, string[] | null | undefined, boolean];
  try {
    results = await Promise.all([
      checks.isRevoked(session.sid),
      checks.isActive(session.role, session.uid),
      checks.isPasswordCurrent(session.role, session.uid, session.pv),
      wantsPermissions ? checks.adminPermissions(session.uid) : Promise.resolve(undefined),
      checks.isHeld ? checks.isHeld(session.role, session.uid) : Promise.resolve(false),
    ]);
  } catch (err) {
    console.error("[session] validity check failed; treating the request as signed out:", err instanceof Error ? err.message : err);
    return { session: null, denied: "signed_out" };
  }
  const [revoked, active, passwordCurrent, perms, held] = results;
  if (revoked || !passwordCurrent) return { session: null, denied: "signed_out" };
  if (!active) return { session: null, denied: "disabled" };
  // Frozen: same proof of identity as "disabled" (signed, not revoked, password current), so telling them leaks nothing.
  // An admin's "View as" session is exempt so staff can still look at a frozen account while deciding.
  if (held && !session.impersonator) {
    const workExempt = checks.isWorkExempt ? await checks.isWorkExempt(session.role, session.uid).catch(() => false) : false;
    return { session: null, denied: "held", restricted: session, workExempt };
  }
  if (wantsPermissions) {
    if (!perms) return { session: null, denied: "signed_out" }; // admin removed (null) or permission lookup failed (undefined)
    return { session: { ...session, permissions: perms } };
  }
  return { session };
}
