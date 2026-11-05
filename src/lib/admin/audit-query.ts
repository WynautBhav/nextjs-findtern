import { and, count, desc, eq, inArray, sql, type SQL } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { searchAny } from "@/lib/admin/params";
import { parseDateRange } from "@/lib/admin/date-range";
import { actionLabel, summarizeMeta } from "@/lib/admin/audit";

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

/** Where a target lives in the admin, when it has a page. Payouts point at their intern. */
export function targetHref(type: string | null, id: string | null, meta: unknown): string | null {
  const internId = (meta as { internId?: unknown } | null)?.internId;
  if (type === "payout") return typeof internId === "string" ? `/admin/interns/${internId}` : null;
  if (!id) return null;
  if (type === "intern") return `/admin/interns/${id}`;
  if (type === "employer") return `/admin/companies/${id}`;
  if (type === "college") return "/admin/colleges";
  if (type === "promo_code") return "/admin/promo-codes";
  if (type === "role") return "/admin/roles";
  return null;
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

  // Names for the targets on this page only (three small lookups).
  const ids = (t: string) => [...new Set(raw.filter((r) => r.targetType === t && r.targetId).map((r) => r.targetId as string))];
  const [users, employers, colleges] = await Promise.all([
    ids("intern").length ? db.select({ id: schema.users.id, a: schema.users.firstName, b: schema.users.lastName }).from(schema.users).where(inArray(schema.users.id, ids("intern"))) : [],
    ids("employer").length ? db.select({ id: schema.employers.id, a: schema.employers.companyName }).from(schema.employers).where(inArray(schema.employers.id, ids("employer"))) : [],
    ids("college").length ? db.select({ id: schema.colleges.id, a: schema.colleges.name }).from(schema.colleges).where(inArray(schema.colleges.id, ids("college"))) : [],
  ]);
  const names = new Map<string, string>();
  for (const u of users) names.set(u.id, [u.a, u.b].filter(Boolean).join(" "));
  for (const e of [...employers, ...colleges]) names.set(e.id, e.a);

  const rows: AuditRow[] = raw.map((r) => ({
    id: r.id,
    when: r.when,
    staffName: r.staffName,
    staffEmail: r.staffEmail,
    action: r.action,
    actionLabel: actionLabel(r.action),
    targetType: r.targetType,
    targetId: r.targetId,
    targetName: r.targetId ? (names.get(r.targetId) ?? null) : null,
    targetHref: targetHref(r.targetType, r.targetId, r.meta),
    details: summarizeMeta(r.meta),
  }));
  return { rows, total: Number(total?.c ?? 0) };
}
