import { desc, eq, sql, type SQL } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { realEmployers } from "@/lib/admin/scope";
import { allowedGroups, cleanQuery, likePattern, SEARCH_LIMIT, type SearchResponse } from "@/lib/admin/palette-search";

/**
 * Command palette record search. Read-only. The proxy applies the `[]` rule
 * (any admin); this handler checks the session itself and then each group
 * against its own permission, so a role only ever sees records it could open.
 * Only `{ id, label, sublabel }` leaves the server, never a raw row.
 */
const NO_STORE = { "Cache-Control": "no-store" };

/** Case-insensitive contains across the given SQL expressions (`ESCAPE '\'`). */
function anyLike(columns: SQL[], pattern: string): SQL {
  return sql`(${sql.join(
    columns.map((c) => sql`${c} ILIKE ${pattern} ESCAPE '\\'`),
    sql` OR `,
  )})`;
}

export async function GET(req: Request) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE });
  }

  const q = cleanQuery(new URL(req.url).searchParams.get("q"));
  const groups = new Set(allowedGroups(session.permissions));
  const out: SearchResponse = { candidates: [], companies: [], invoices: [] };
  if (!q) return NextResponse.json(out, { headers: NO_STORE });

  const pattern = likePattern(q);
  const db = getDb();
  const u = schema.users;
  const e = schema.employers;
  const fullName = (first: SQL, last: SQL) => sql`concat_ws(' ', ${first}, ${last})`;

  try {
    await Promise.all([
      groups.has("candidates")
        ? db
            .select({ id: u.id, firstName: u.firstName, lastName: u.lastName, email: u.email })
            .from(u)
            .where(
              sql`${eq(u.role, "intern")} AND ${anyLike(
                [fullName(sql`${u.firstName}`, sql`${u.lastName}`), sql`${u.email}`, sql`${u.phoneNumber}`],
                pattern,
              )}`,
            )
            .orderBy(desc(u.createdAt))
            .limit(SEARCH_LIMIT)
            .then((rows) => {
              out.candidates = rows.map((r) => ({
                id: r.id,
                label: `${r.firstName ?? ""} ${r.lastName ?? ""}`.trim() || "Candidate",
                sublabel: r.email ?? "",
              }));
            })
        : null,
      groups.has("companies")
        ? db
            .select({ id: e.id, companyName: e.companyName, companyEmail: e.companyEmail })
            .from(e)
            .where(sql`${realEmployers()} AND ${anyLike([sql`${e.companyName}`, sql`${e.companyEmail}`, sql`${e.phoneNumber}`], pattern)}`)
            .orderBy(desc(e.createdAt))
            .limit(SEARCH_LIMIT)
            .then((rows) => {
              out.companies = rows.map((r) => ({ id: r.id, label: r.companyName || "Company", sublabel: r.companyEmail ?? "" }));
            })
        : null,
      groups.has("invoices") ? searchInvoices(pattern).then((rows) => (out.invoices = rows)) : null,
    ]);
  } catch (error) {
    console.error("[admin/search] failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "Search failed" }, { status: 500, headers: NO_STORE });
  }

  return NextResponse.json(out, { headers: NO_STORE });
}

/** Employer orders and intern activation fees, matched on invoice number. */
async function searchInvoices(pattern: string): Promise<SearchResponse["invoices"]> {
  const db = getDb();
  const ep = schema.employerPayments;
  const ip = schema.internPayments;
  const [orders, fees] = await Promise.all([
    db
      .select({ id: ep.id, invoiceNumber: ep.invoiceNumber, companyName: schema.employers.companyName })
      .from(ep)
      .leftJoin(schema.employers, eq(schema.employers.id, ep.employerId))
      .where(sql`${ep.invoiceNumber} ILIKE ${pattern} ESCAPE '\\'`)
      .orderBy(desc(ep.createdAt))
      .limit(SEARCH_LIMIT),
    db
      .select({ id: ip.id, invoiceNumber: ip.invoiceNumber, firstName: schema.users.firstName, lastName: schema.users.lastName })
      .from(ip)
      .leftJoin(schema.users, eq(schema.users.id, ip.internId))
      .where(sql`${ip.invoiceNumber} ILIKE ${pattern} ESCAPE '\\'`)
      .orderBy(desc(ip.createdAt))
      .limit(SEARCH_LIMIT),
  ]);
  return [
    ...orders.map((r) => ({ id: r.id, kind: "order" as const, label: r.invoiceNumber ?? "", sublabel: r.companyName ?? "Employer order" })),
    ...fees.map((r) => ({
      id: r.id,
      kind: "intern" as const,
      label: r.invoiceNumber ?? "",
      sublabel: `${r.firstName ?? ""} ${r.lastName ?? ""}`.trim() || "Intern invoice",
    })),
  ]
    .filter((r) => r.label)
    .slice(0, SEARCH_LIMIT);
}
