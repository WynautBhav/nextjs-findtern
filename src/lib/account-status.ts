import { eq } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { passwordVersion } from "@/lib/security/session";

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
  __ftAccountStatus?: Map<string, { active: boolean; pv: string | null; at: number }>;
  __ftAdminPerms?: Map<string, { perms: string[] | null; at: number }>;
};
const cache = (store.__ftAccountStatus ??= new Map());

async function readStatus(role: string, uid: string): Promise<{ active: boolean; pv: string | null } | undefined> {
  const key = `${role}:${uid}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit;
  let status: { active: boolean; pv: string | null };
  try {
    if (role === "admin") {
      const [row] = await getDb().select({ password: schema.admins.password }).from(schema.admins).where(eq(schema.admins.id, uid)).limit(1);
      status = { active: Boolean(row), pv: row ? passwordVersion(row.password) : null };
    } else if (role === "college") {
      // A placement officer is locked out when either they or their college is switched off.
      const [row] = await getDb()
        .select({ admin: schema.collegeAdmins.isActive, college: schema.colleges.isActive, password: schema.collegeAdmins.password })
        .from(schema.collegeAdmins)
        .innerJoin(schema.colleges, eq(schema.colleges.id, schema.collegeAdmins.collegeId))
        .where(eq(schema.collegeAdmins.id, uid))
        .limit(1);
      status = { active: Boolean(row?.admin && row?.college), pv: row ? passwordVersion(row.password) : null };
    } else {
      const table = role === "intern" ? schema.users : schema.employers;
      const [row] = await getDb()
        .select({ isActive: table.isActive, password: table.password })
        .from(table)
        .where(eq(table.id, uid))
        .limit(1);
      status = { active: Boolean(row?.isActive), pv: row ? passwordVersion(row.password) : null };
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
 * the account (INT-26). Sessions without a version predate the check.
 */
export async function isPasswordVersionCurrent(role: string, uid: string, pv: string | undefined): Promise<boolean> {
  if (!pv) return true;
  const status = await readStatus(role, uid);
  if (!status) return true; // lookup failed: same fail-open as isAccountActive
  return status.pv === pv;
}

export function forgetAccountStatus(role: string, uid: string) {
  cache.delete(`${role}:${uid}`);
}

const adminCache = (store.__ftAdminPerms ??= new Map());

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
