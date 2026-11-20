import { eq, lt, sql } from "drizzle-orm";

import { getDb, schema } from "./db/index.ts";
import { isRevoked } from "./security/session-revocation.ts";
import { acceptsPvlessSession, passwordVersion } from "./security/session.ts";
import { CURRENT_TERMS_VERSION } from "./terms.ts";

/**
 * The 30 s cache below now serves only the terms-accepted answer (isTermsCurrent) and admin permissions. It must NOT
 * decide whether an account may use a session: that is loadSessionFacts, read fresh on every request, because the
 * admin's deactivate request can only clear the cache of the one instance it ran on (Vercel runs many).
 */
const TTL_MS = 30_000;

/**
 * Process-wide caches. Next bundles route handlers and pages separately, each
 * with its own copy of this module, so a module-level Map cleared by
 * forgetAccountStatus() in a route handler (deactivate, password change) left
 * the pages' copy stale for up to 30 s. On globalThis there is one Map per
 * process, whichever bundle reads or clears it.
 */
const store = globalThis as typeof globalThis & {
  __ftAccountStatus?: Map<string, { active: boolean; pv: string | null; terms?: string | null; at: number }>;
  __ftAdminPerms?: Map<string, { perms: string[] | null; at: number }>;
};
const cache = (store.__ftAccountStatus ??= new Map());

type Status = { active: boolean; pv: string | null; terms?: string | null };

/**
 * Lookup failures (pool timeout, outage) are not answered here: the validity reads below reject, and
 * validateSession() turns that into "signed out". Guessing "active" would accept a revoked or deactivated
 * session whenever the pool is merely busy. A failed read is never cached.
 */

/**
 * getSession asks "active?" and "password current?" in the same tick; both need
 * the same row, so concurrent callers for one account share a single query.
 */
const inflight = new Map<string, Promise<Status>>();

function readStatus(role: string, uid: string): Promise<Status> {
  const key = `${role}:${uid}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return Promise.resolve(hit);
  const pending = inflight.get(key);
  if (pending) return pending;
  const p: Promise<Status> = loadStatus(role, uid, key).finally(() => {
    if (inflight.get(key) === p) inflight.delete(key);
  });
  inflight.set(key, p);
  return p;
}

async function loadStatus(role: string, uid: string, key: string): Promise<Status> {
  let status: { active: boolean; pv: string | null; terms?: string | null };
  if (role === "admin") {
    const [row] = await getDb().select({ password: schema.admins.password }).from(schema.admins).where(eq(schema.admins.id, uid)).limit(1);
    status = { active: Boolean(row), pv: row ? passwordVersion(row.password) : null };
  } else if (role === "college") {
    // A placement officer is locked out when either they or their college is switched off.
    const [row] = await getDb()
      .select({ admin: schema.collegeAdmins.isActive, college: schema.colleges.isActive, password: schema.collegeAdmins.password, terms: schema.collegeAdmins.termsAcceptedVersion })
      .from(schema.collegeAdmins)
      .innerJoin(schema.colleges, eq(schema.colleges.id, schema.collegeAdmins.collegeId))
      .where(eq(schema.collegeAdmins.id, uid))
      .limit(1);
    status = { active: Boolean(row?.admin && row?.college), pv: row ? passwordVersion(row.password) : null, terms: row?.terms };
  } else {
    const table = role === "intern" ? schema.users : schema.employers;
    const [row] = await getDb()
      .select({ isActive: table.isActive, password: table.password, terms: table.termsAcceptedVersion })
      .from(table)
      .where(eq(table.id, uid))
      .limit(1);
    status = { active: Boolean(row?.isActive), pv: row ? passwordVersion(row.password) : null, terms: row?.terms };
  }
  cache.set(key, { ...status, at: Date.now() });
  return status;
}

/**
 * Everything the per-request session check needs, in ONE statement and never cached:
 * is the sid on the revoked list, is the account (and for a college officer, the college) active, and what is the
 * stored password's version. A deactivation, a logout or a password change written by the admin's request, on any
 * instance, is therefore seen by the very next request on every instance; there is no per-process window to close.
 * Cost: one indexed primary-key read per request, run inside validateSession's Promise.all (no extra round trip),
 * and shared by every getSession() call of that request (see getSessionState).
 */
export type SessionFacts = {
  revoked: boolean;
  active: boolean;
  pv: string | null;
  /** An admin has frozen the account (account_strikes policy). Always false for admins and college officers. Read fresh, so a freeze stops existing sessions at their next request. */
  held: boolean;
};

export async function loadSessionFacts(role: string, uid: string, sid: string | undefined): Promise<SessionFacts> {
  const revoked = sid
    ? sql<boolean>`exists (select 1 from ${schema.revokedSessions} where ${schema.revokedSessions.sid} = ${sid})`
    : sql<boolean>`false`;
  const db = getDb();
  if (role === "admin") {
    const [row] = await db.select({ password: schema.admins.password, revoked }).from(schema.admins).where(eq(schema.admins.id, uid)).limit(1);
    return { revoked: Boolean(row?.revoked), active: Boolean(row), pv: row ? passwordVersion(row.password) : null, held: false };
  }
  if (role === "college") {
    // A placement officer is locked out when either they or their college is switched off.
    const [row] = await db
      .select({ admin: schema.collegeAdmins.isActive, college: schema.colleges.isActive, password: schema.collegeAdmins.password, revoked })
      .from(schema.collegeAdmins)
      .innerJoin(schema.colleges, eq(schema.colleges.id, schema.collegeAdmins.collegeId))
      .where(eq(schema.collegeAdmins.id, uid))
      .limit(1);
    return { revoked: Boolean(row?.revoked), active: Boolean(row?.admin && row?.college), pv: row ? passwordVersion(row.password) : null, held: false };
  }
  const table = role === "intern" ? schema.users : schema.employers;
  const [row] = await db.select({ isActive: table.isActive, password: table.password, frozenAt: table.frozenAt, revoked }).from(table).where(eq(table.id, uid)).limit(1);
  return { revoked: Boolean(row?.revoked), active: Boolean(row?.isActive), pv: row ? passwordVersion(row.password) : null, held: Boolean(row?.frozenAt) };
}

/**
 * Whether a session minted with password version `pv` is still current: a password change (here or on the legacy
 * site) ends every other session on the account (INT-26). Sessions without a version predate the check; for colleges
 * they are rejected.
 */
export function passwordVersionCurrent(role: string, sessionPv: string | undefined, storedPv: string | null): boolean {
  if (!sessionPv) return acceptsPvlessSession(role);
  return storedPv === sessionPv;
}

/**
 * Whether the account has accepted the current terms. Not a session check, so it still fails open on a lookup
 * failure (the session itself was validated, fail-closed, before this runs). A cached "behind" is re-read
 * first, so a user who just accepted (maybe via another server instance) is never refused on a stale answer.
 */
export async function isTermsCurrent(role: string, uid: string): Promise<boolean> {
  if (role !== "intern" && role !== "employer" && role !== "college") return true;
  try {
    let status = await readStatus(role, uid);
    if (status.terms !== CURRENT_TERMS_VERSION) {
      forgetAccountStatus(role, uid);
      status = await readStatus(role, uid);
    }
    return status.terms === CURRENT_TERMS_VERSION;
  } catch {
    return true;
  }
}

export function forgetAccountStatus(role: string, uid: string) {
  cache.delete(`${role}:${uid}`);
  inflight.delete(`${role}:${uid}`); // a read already in flight may predate the change
}

const adminCache = (store.__ftAdminPerms ??= new Map());

/** Drop one admin's cached permissions (or all, after a role's permissions change) so the change applies on the next request. */
export function forgetAdminPermissions(uid?: string) {
  if (uid) adminCache.delete(uid);
  else adminCache.clear();
}

/**
 * An admin's current permissions (null if the account was removed), so a
 * role change or removal applies within seconds rather than at next login.
 * Same resolution as login and the legacy app: super_admin is "*", a role
 * key with no row is nothing. `undefined` means the lookup failed.
 */
export async function currentAdminPermissions(uid: string): Promise<string[] | null | undefined> {
  const hit = adminCache.get(uid);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.perms;
  let perms: string[] | null = null;
  try {
    const db = getDb();
    const [admin] = await db.select({ role: schema.admins.role }).from(schema.admins).where(eq(schema.admins.id, uid)).limit(1);
    if (admin) {
      const key = String(admin.role ?? "").trim();
      if (key.toLowerCase() === "super_admin") perms = ["*"];
      else if (!key) perms = [];
      else {
        const [role] = await db.select({ p: schema.adminRoles.permissions }).from(schema.adminRoles).where(eq(schema.adminRoles.key, key)).limit(1);
        perms = Array.isArray(role?.p) ? role.p : [];
      }
    }
  } catch {
    return undefined; // DB outage: the caller keeps the session's own list
  }
  adminCache.set(uid, { perms, at: Date.now() });
  return perms;
}

/**
 * Logout and sid revocation. A revoked sid stays refused until its cookie would have expired anyway. Read from the
 * database every time (no per-process cache): a revoke written on one instance is honoured by all of them at once.
 */
export async function isSessionRevoked(sid: string | undefined | null): Promise<boolean> {
  if (!sid) return false;
  // A failed lookup rejects: the caller must not read it as "not revoked".
  const [row] = await getDb().select({ sid: schema.revokedSessions.sid }).from(schema.revokedSessions).where(eq(schema.revokedSessions.sid, sid)).limit(1);
  return isRevoked(new Set(row ? [row.sid] : []), sid);
}

/** End a session: record the sid until `exp` (ms); every instance refuses it from its next request. */
export async function revokeSession(sid: string, exp: number): Promise<void> {
  const db = getDb();
  await db.insert(schema.revokedSessions).values({ sid, exp: new Date(exp) }).onConflictDoNothing();
  // Rows past their cookie's expiry can never matter again.
  await db.delete(schema.revokedSessions).where(lt(schema.revokedSessions.exp, new Date())).catch(() => undefined);
}
