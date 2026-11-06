import { eq, lt } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { isRevoked } from "@/lib/security/session-revocation";
import { acceptsPvlessSession, passwordVersion } from "@/lib/security/session";
import { CURRENT_TERMS_VERSION } from "@/lib/terms";

/**
 * Deactivated accounts lose their existing sessions, not just future logins.
 * Checked on every session read, so the answer is cached briefly per account;
 * the (de)activate routes clear the entry so the change applies at once.
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

async function readStatus(role: string, uid: string): Promise<{ active: boolean; pv: string | null; terms?: string | null } | undefined> {
  const key = `${role}:${uid}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit;
  let status: { active: boolean; pv: string | null; terms?: string | null };
  try {
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
  } catch {
    return undefined; // a DB outage fails every request anyway; don't cache it
  }
  cache.set(key, { ...status, at: Date.now() });
  return status;
}

export async function isAccountActive(role: string, uid: string): Promise<boolean> {
  if (role !== "intern" && role !== "employer" && role !== "college") return true;
  const status = await readStatus(role, uid);
  return status ? status.active : true;
}

/**
 * Whether a session minted with password version `pv` is still current: a
 * password change (here or on the legacy site) ends every other session on
 * the account (INT-26). Sessions without a version predate the check; for colleges they are rejected.
 */
export async function isPasswordVersionCurrent(role: string, uid: string, pv: string | undefined): Promise<boolean> {
  if (!pv) return acceptsPvlessSession(role);
  const status = await readStatus(role, uid);
  if (!status) return true; // lookup failed: same fail-open as isAccountActive
  return status.pv === pv;
}

/**
 * Whether the account has accepted the current terms. Fails open on a lookup
 * failure, like isAccountActive. A cached "behind" is re-read first, so a user
 * who just accepted (maybe via another server instance) is never refused on a stale answer.
 */
export async function isTermsCurrent(role: string, uid: string): Promise<boolean> {
  if (role !== "intern" && role !== "employer" && role !== "college") return true;
  let status = await readStatus(role, uid);
  if (status && status.terms !== CURRENT_TERMS_VERSION) {
    forgetAccountStatus(role, uid);
    status = await readStatus(role, uid);
  }
  return status ? status.terms === CURRENT_TERMS_VERSION : true;
}

export function forgetAccountStatus(role: string, uid: string) {
  cache.delete(`${role}:${uid}`);
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
 * Logout and sid revocation. A revoked sid stays refused until its cookie
 * would have expired anyway. Per sid the answer is cached for TTL_MS; a revoke
 * on this process lands in the cache at once, another instance learns within TTL_MS.
 */
const revokedStore = globalThis as typeof globalThis & { __ftRevokedSids?: Map<string, { revoked: boolean; at: number }> };
const revokedCache = (revokedStore.__ftRevokedSids ??= new Map());

export async function isSessionRevoked(sid: string | undefined | null): Promise<boolean> {
  if (!sid) return false;
  const hit = revokedCache.get(sid);
  if (hit && (hit.revoked || Date.now() - hit.at < TTL_MS)) return hit.revoked;
  let revoked = false;
  try {
    const [row] = await getDb().select({ sid: schema.revokedSessions.sid }).from(schema.revokedSessions).where(eq(schema.revokedSessions.sid, sid)).limit(1);
    revoked = isRevoked(new Set(row ? [row.sid] : []), sid);
  } catch {
    return false; // lookup failed: same fail-open as isAccountActive (a DB outage fails every request anyway)
  }
  if (revokedCache.size > 5000) revokedCache.clear();
  revokedCache.set(sid, { revoked, at: Date.now() });
  return revoked;
}

/** End a session: record the sid until `exp` (ms) and refuse it on this process immediately. */
export async function revokeSession(sid: string, exp: number): Promise<void> {
  const db = getDb();
  await db.insert(schema.revokedSessions).values({ sid, exp: new Date(exp) }).onConflictDoNothing();
  revokedCache.set(sid, { revoked: true, at: Date.now() });
  // Rows past their cookie's expiry can never matter again.
  await db.delete(schema.revokedSessions).where(lt(schema.revokedSessions.exp, new Date())).catch(() => undefined);
}
