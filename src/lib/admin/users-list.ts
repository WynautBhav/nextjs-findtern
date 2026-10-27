import { sql, type SQL } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { AI_INTERVIEW_EMAIL, TEST_EMPLOYER_ID } from "@/lib/admin/scope";

/**
 * Every sign-in account in one list: candidates (`users`), companies
 * (`employers`, test employers left out) and, for people who manage staff,
 * admins. One UNION so search, filters, sorting and paging run in the
 * database across all three, and the CSV reads the same rows the screen does.
 */

export type AccountKind = "intern" | "employer" | "admin";

export type AccountRow = {
  id: string;
  kind: AccountKind;
  name: string;
  company: string | null;
  email: string;
  phone: string;
  isActive: boolean;
  emailVerified: boolean;
  createdAt: Date | null;
};

export const USER_SORTS = ["created", "name", "email"] as const;
export type UserSort = (typeof USER_SORTS)[number];

function accounts(showStaff: boolean): SQL {
  const u = schema.users;
  const e = schema.employers;
  const a = schema.admins;
  const parts = [
    sql`SELECT ${u.id}::text AS id, 'intern' AS kind,
        trim(coalesce(${u.firstName}, '') || ' ' || coalesce(${u.lastName}, '')) AS name, NULL::text AS company,
        ${u.email} AS email, trim(coalesce(${u.countryCode}, '') || ' ' || coalesce(${u.phoneNumber}, '')) AS phone,
        ${u.isActive} AS is_active, coalesce(${u.emailVerified}, false) AS email_verified, ${u.createdAt} AS created_at
      FROM ${u} WHERE coalesce(${u.role}, 'intern') = 'intern'`,
    sql`SELECT ${e.id}::text, 'employer', coalesce(nullif(trim(${e.name}), ''), ${e.companyName}), ${e.companyName},
        ${e.companyEmail}, trim(coalesce(${e.countryCode}, '') || ' ' || coalesce(${e.phoneNumber}, '')),
        ${e.isActive}, coalesce(${e.emailVerified}, false), ${e.createdAt}
      FROM ${e} WHERE ${e.id} <> ${TEST_EMPLOYER_ID} AND lower(coalesce(${e.companyEmail}, '')) <> ${AI_INTERVIEW_EMAIL}`,
  ];
  if (showStaff) {
    parts.push(sql`SELECT ${a.id}::text, 'admin', coalesce(nullif(trim(${a.name}), ''), 'Admin'), NULL, ${a.email}, '',
        true, true, ${a.createdAt} FROM ${a}`);
  }
  return sql.join(parts, sql` UNION ALL `);
}

function where(params: Record<string, string>): SQL {
  const conds: SQL[] = [sql`true`];
  if (params.role === "intern" || params.role === "employer" || params.role === "admin") conds.push(sql`kind = ${params.role}`);
  if (params.status === "active") conds.push(sql`is_active`);
  if (params.status === "inactive") conds.push(sql`NOT is_active`);
  if (params.verified === "yes") conds.push(sql`email_verified`);
  if (params.verified === "no") conds.push(sql`NOT email_verified`);
  const words = (params.q ?? "").trim().split(/\s+/).filter(Boolean);
  for (const word of words) {
    const like = `%${word.replace(/([%_\\])/g, "\\$1")}%`;
    conds.push(sql`(name ILIKE ${like} ESCAPE '\\' OR email ILIKE ${like} ESCAPE '\\' OR phone ILIKE ${like} ESCAPE '\\' OR coalesce(company, '') ILIKE ${like} ESCAPE '\\')`);
  }
  return sql.join(conds, sql` AND `);
}

function orderBy(sort: UserSort, dir: "asc" | "desc"): SQL {
  const d = sql.raw(dir === "asc" ? "ASC" : "DESC");
  if (sort === "name") return sql`lower(name) ${d} NULLS LAST, id`;
  if (sort === "email") return sql`lower(email) ${d} NULLS LAST, id`;
  return sql`created_at ${d} NULLS LAST, id`;
}

type Raw = {
  id: string;
  kind: AccountKind;
  name: string | null;
  company: string | null;
  email: string | null;
  phone: string | null;
  is_active: boolean | null;
  email_verified: boolean | null;
  created_at: Date | string | null;
};

const toRow = (r: Raw): AccountRow => ({
  id: r.id,
  kind: r.kind,
  name: r.name?.trim() || r.email || "Unnamed",
  company: r.company,
  email: r.email ?? "",
  phone: r.phone?.trim() ?? "",
  isActive: r.is_active !== false,
  emailVerified: Boolean(r.email_verified),
  createdAt: r.created_at ? new Date(r.created_at) : null,
});

export async function loadAccounts(
  params: Record<string, string>,
  opts: { showStaff: boolean; sort: UserSort; dir: "asc" | "desc"; limit: number; offset: number },
): Promise<{ rows: AccountRow[]; total: number; byKind: Record<AccountKind, number> }> {
  const db = getDb();
  const base = sql`(${accounts(opts.showStaff)}) AS acct`;
  const [rows, totals, kinds] = await Promise.all([
    db.execute<Raw>(sql`SELECT * FROM ${base} WHERE ${where(params)} ORDER BY ${orderBy(opts.sort, opts.dir)} LIMIT ${opts.limit} OFFSET ${opts.offset}`),
    db.execute<{ c: string | number }>(sql`SELECT count(*) AS c FROM ${base} WHERE ${where(params)}`),
    db.execute<{ kind: AccountKind; c: string | number }>(sql`SELECT kind, count(*) AS c FROM ${base} GROUP BY kind`),
  ]);
  const byKind: Record<AccountKind, number> = { intern: 0, employer: 0, admin: 0 };
  for (const k of kinds.rows) byKind[k.kind] = Number(k.c);
  return { rows: rows.rows.map(toRow), total: Number(totals.rows[0]?.c ?? 0), byKind };
}
