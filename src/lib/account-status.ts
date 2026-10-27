import { eq } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";

/**
 * Deactivated accounts lose their existing sessions, not just future logins.
 * Checked on every session read, so the answer is cached briefly per account;
 * the (de)activate routes clear the entry so the change applies at once.
 */
const TTL_MS = 30_000;
const cache = new Map<string, { active: boolean; at: number }>();

export async function isAccountActive(role: string, uid: string): Promise<boolean> {
  if (role !== "intern" && role !== "employer" && role !== "college") return true;
  const key = `${role}:${uid}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.active;
  let active = true;
  try {
    if (role === "college") {
      // A placement officer is locked out when either they or their college is switched off.
      const [row] = await getDb()
        .select({ admin: schema.collegeAdmins.isActive, college: schema.colleges.isActive })
        .from(schema.collegeAdmins)
        .innerJoin(schema.colleges, eq(schema.colleges.id, schema.collegeAdmins.collegeId))
        .where(eq(schema.collegeAdmins.id, uid))
        .limit(1);
      active = Boolean(row?.admin && row?.college);
      cache.set(key, { active, at: Date.now() });
      return active;
    }
    const table = role === "intern" ? schema.users : schema.employers;
    const [row] = await getDb().select({ isActive: table.isActive }).from(table).where(eq(table.id, uid)).limit(1);
    active = Boolean(row?.isActive);
  } catch {
    return true; // a DB outage fails every request anyway; don't cache it
  }
  cache.set(key, { active, at: Date.now() });
  return active;
}

export function forgetAccountStatus(role: string, uid: string) {
  cache.delete(`${role}:${uid}`);
}

const adminCache = new Map<string, { perms: string[] | null; at: number }>();

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
