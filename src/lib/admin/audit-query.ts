import { and, count, desc, eq, inArray, sql, type SQL } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { searchAny } from "@/lib/admin/params";
import { parseDateRange } from "@/lib/admin/date-range";
import { actionLabel } from "@/lib/admin/audit";
import { describeAudit, describeTarget, emptyNames, type AuditNames } from "@/lib/admin/audit-details";

const L = schema.adminAuditLog;
const IST_MS = 330 * 60_000;

export type AuditRow = {
  id: string;
  when: Date | null;
  staffName: string | null;
  staffEmail: string | null;
  action: string;
  actionLabel: string;
  targetType: string | null;
  targetId: string | null;
  targetName: string | null;
  targetHref: string | null;
  details: string;
};

/** Filters → WHERE. The date range is in IST days (the page shows IST). */
export function auditConditions(params: Record<string, string>, search = ""): SQL[] {
  const { from, toExclusive } = parseDateRange(params);
  return [
    params.action ? eq(L.action, params.action) : undefined,
    params.staff ? eq(L.adminId, params.staff) : undefined,
    from ? sql`${L.createdAt} >= ${new Date(from.getTime() - IST_MS)}` : undefined,
    toExclusive ? sql`${L.createdAt} < ${new Date(toExclusive.getTime() - IST_MS)}` : undefined,
    searchAny([sql`${L.action}`, sql`${schema.admins.name}`, sql`${schema.admins.email}`, sql`${L.targetId}`], search),
  ].filter((c): c is SQL => Boolean(c));
}

export async function loadAudit(params: Record<string, string>, search: string, page: { limit: number; offset: number } | null) {
  const db = getDb();
  const where = and(...auditConditions(params, search));
  let q = db
    .select({
      id: L.id,
      when: L.createdAt,
      staffName: schema.admins.name,
      staffEmail: schema.admins.email,
      action: L.action,
      targetType: L.targetType,
      targetId: L.targetId,
      meta: L.meta,
    })
    .from(L)
    .leftJoin(schema.admins, eq(schema.admins.id, L.adminId))
    .where(where)
    .orderBy(desc(L.createdAt), desc(L.id))
    .$dynamic();
  if (page) q = q.limit(page.limit).offset(page.offset);
  const [raw, [total]] = await Promise.all([
    q,
    db.select({ c: count() }).from(L).leftJoin(schema.admins, eq(schema.admins.id, L.adminId)).where(where),
  ]);

  // Names for the ids on this page only (a few small lookups).
  const metaStr = (meta: unknown, ...keys: string[]) => keys.map((k) => (meta as Record<string, unknown> | null)?.[k]).filter((v): v is string => typeof v === "string");
  const collect = (type: string, ...metaKeys: string[]) =>
    [...new Set(raw.flatMap((r) => [...(r.targetType === type && r.targetId ? [r.targetId] : []), ...metaStr(r.meta, ...metaKeys)]))];
  const internIds = collect("intern", "internId");
  const employerIds = collect("employer", "employerId", "companyId");
  const collegeIds = collect("college", "collegeId");
  const adminIds = collect("admin");
  const promoIds = collect("promo_code");
  const [users, employers, colleges, admins, promos, roles] = await Promise.all([
    internIds.length ? db.select({ id: schema.users.id, a: schema.users.firstName, b: schema.users.lastName }).from(schema.users).where(inArray(schema.users.id, internIds)) : [],
    employerIds.length ? db.select({ id: schema.employers.id, a: schema.employers.companyName }).from(schema.employers).where(inArray(schema.employers.id, employerIds)) : [],
    collegeIds.length ? db.select({ id: schema.colleges.id, a: schema.colleges.name }).from(schema.colleges).where(inArray(schema.colleges.id, collegeIds)) : [],
    adminIds.length ? db.select({ id: schema.admins.id, a: schema.admins.name, b: schema.admins.email }).from(schema.admins).where(inArray(schema.admins.id, adminIds)) : [],
    promoIds.length ? db.select({ id: schema.promoCodes.id, code: schema.promoCodes.code }).from(schema.promoCodes).where(inArray(schema.promoCodes.id, promoIds)) : [],
    db.select({ id: schema.adminRoles.id, key: schema.adminRoles.key, name: schema.adminRoles.name }).from(schema.adminRoles),
  ]);
  const names: AuditNames = emptyNames();
  for (const u of users) names.intern.set(u.id, [u.a, u.b].filter(Boolean).join(" ") || "Candidate");
  for (const e of employers) names.company.set(e.id, e.a);
  for (const c of colleges) names.college.set(c.id, c.a);
  for (const a of admins) names.admin.set(a.id, a.a || a.b);
  for (const p of promos) names.promo.set(p.id, p.code);
  for (const r of roles) {
    names.role.set(r.key, r.name);
    names.role.set(r.id, r.name);
  }

  const rows: AuditRow[] = raw.map((r) => {
    const target = describeTarget(r.action, r.targetType, r.targetId, r.meta, names);
    return {
      id: r.id,
      when: r.when,
      staffName: r.staffName,
      staffEmail: r.staffEmail,
      action: r.action,
      actionLabel: actionLabel(r.action),
      targetType: r.targetType,
      targetId: r.targetId,
      targetName: target.name,
      targetHref: target.href,
      details: describeAudit(r.action, r.meta, names),
    };
  });
  return { rows, total: Number(total?.c ?? 0) };
}
