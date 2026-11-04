import { count, desc, inArray, sql } from "drizzle-orm";

import { AdminEmpty, AdminPageHeader, Panel, PanelBody, PanelHeader } from "@/components/admin/panel";
import { IdentityCell } from "@/components/admin/data-table";
import { AddCollegeForm, CollegeRowControls, type CollegeAdminRow } from "@/components/admin/college-partners-manager";
import { Pagination } from "@/components/admin/pagination";
import { TableToolbar } from "@/components/admin/table-toolbar";
import { flattenParams, parsePageRequest, searchAny, toPage } from "@/lib/admin/params";
import { getDb, schema } from "@/lib/db";
import { q } from "@/lib/college/sql";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

/** A count as a quiet pill, in place of a loose "12 students · 4 on roster" line. */
function CountChip({ n, one, many }: { n: number; one: string; many: string }) {
  return (
    <span className="nums inline-flex h-6 items-center whitespace-nowrap rounded-full bg-[color:var(--admin-panel-2)] px-2.5 text-xs font-medium text-foreground">
      {n.toLocaleString("en-IN")} {n === 1 ? one : many}
    </span>
  );
}

export default async function AdminCollegesPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = flattenParams(await searchParams);
  const req = parsePageRequest(params);
  const db = getDb();
  const c = schema.colleges;
  const cid = q(c, c.id);
  // No search: partners and colleges with students. A search looks through the whole directory.
  const where = req.search
    // The two codes have no trigram index, so they match exactly (as membership.ts does); name/city stay substring.
    ? sql`(${searchAny([sql`${c.name}`, sql`${c.city}`], req.search)} OR ${c.aisheCode} = ${req.search.trim().toUpperCase()} OR ${c.code} = ${req.search.trim().toUpperCase()})`
    : sql`${c.isPartner} OR EXISTS (SELECT 1 FROM ${schema.collegeMemberships} m WHERE m.college_id = ${cid} AND m.left_at IS NULL)`;
  const [{ total }] = await db.select({ total: count() }).from(c).where(where);
  const page = Math.min(req.page, Math.max(1, Math.ceil(total / req.perPage))); // a page past the end shows the last one
  const rows = await db
    .select({
      college: c,
      members: sql<number>`(SELECT count(*)::int FROM ${schema.collegeMemberships} m WHERE m.college_id = ${cid} AND m.left_at IS NULL)`,
      roster: sql<number>`(SELECT count(*)::int FROM ${schema.collegeRoster} r WHERE r.college_id = ${cid})`,
      drives: sql<number>`(SELECT count(*)::int FROM ${schema.collegeDrives} d WHERE d.college_id = ${cid})`,
    })
    .from(c)
    .where(where)
    .orderBy(desc(c.isPartner), c.name, c.id)
    .limit(req.perPage)
    .offset((page - 1) * req.perPage);
  const seatCodes = await db
    .select({ collegeId: schema.promoCodes.collegeId, code: schema.promoCodes.code, maxUsages: schema.promoCodes.maxUsages, usedCount: schema.promoCodes.usedCount })
    .from(schema.promoCodes)
    .where(inArray(schema.promoCodes.collegeId, rows.map((r) => r.college.id).concat("")));
  const officers = await db
    .select({ id: schema.collegeAdmins.id, collegeId: schema.collegeAdmins.collegeId, name: schema.collegeAdmins.name, email: schema.collegeAdmins.email, lastLoginAt: schema.collegeAdmins.lastLoginAt })
    .from(schema.collegeAdmins)
    .where(sql`${schema.collegeAdmins.isActive} AND ${inArray(schema.collegeAdmins.collegeId, rows.map((r) => r.college.id).concat(""))}`);

  const list: CollegeAdminRow[] = rows.map((r) => ({
    id: r.college.id,
    name: r.college.name,
    city: r.college.city,
    aisheCode: r.college.aisheCode,
    code: r.college.code,
    emailDomains: r.college.emailDomains,
    isPartner: r.college.isPartner,
    showOnWebsite: r.college.showOnWebsite,
    isActive: r.college.isActive,
    members: r.members,
    roster: r.roster,
    drives: r.drives,
    seatCode: seatCodes.find((s) => s.collegeId === r.college.id) ?? null,
    officers: officers
      .filter((o) => o.collegeId === r.college.id)
      .map((o) => ({ id: o.id, name: o.name, email: o.email, lastLoginAt: o.lastLoginAt?.toISOString() ?? null })),
  }));

  const pg = toPage(list, total, req.page, req.perPage);
  return (
    <div className="space-y-4">
      <AdminPageHeader
        title="College partners"
        subtitle={`${total.toLocaleString("en-IN")} ${total === 1 ? "college" : "colleges"} ${req.search ? "match" : "(partners and colleges with students)"}. Search to find any college and make it a partner.`}
        className="mb-2 lg:mb-4"
      />
      <TableToolbar searchPlaceholder="Search name, city, AISHE or college code" />
      {list.length === 0 ? (
        <Panel>
          <AdminEmpty title={req.search ? "No college matches" : "No partner colleges yet"} body={req.search ? "Try another name, city or code." : "Add the first one below, then issue its placement officer a login."} />
        </Panel>
      ) : null}
      {list.map((r) => (
        <Panel key={r.id}>
          <PanelHeader
            title={r.name}
            description={[r.code ? `Code ${r.code}` : null, r.city, r.aisheCode ? `AISHE ${r.aisheCode}` : null, r.emailDomains.length ? `@${r.emailDomains.join(", @")}` : null].filter(Boolean).join(" · ")}
            action={
              <span className="flex flex-wrap items-center gap-1.5">
                <CountChip n={r.members} one="student" many="students" />
                <CountChip n={r.roster} one="on roster" many="on roster" />
                <CountChip n={r.drives} one="drive" many="drives" />
              </span>
            }
          />
          <PanelBody className="space-y-3">
            {r.officers.length ? (
              <ul className="grid gap-2 text-sm sm:grid-cols-2">
                {r.officers.map((o) => (
                  <li key={o.email}>
                    <IdentityCell
                      name={o.name}
                      id={o.email}
                      size="sm"
                      sub={`${o.email} · ${o.lastLoginAt ? `last signed in ${formatDate(o.lastLoginAt)}` : "never signed in"}`}
                    />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-text-subtle">No placement officer login yet.</p>
            )}
            <CollegeRowControls row={r} />
          </PanelBody>
        </Panel>
      ))}
      {total > 0 ? <Panel>
        <Pagination page={pg.page} pages={pg.pages} total={total} perPage={req.perPage} rowsShown={list.length} params={params} basePath="/admin/colleges" noun="colleges" />
      </Panel> : null}
      {/* Last, and folded: adding a college is rare, and the open form put
          ~450px above the colleges themselves (critique A). */}
      <Panel>
        <details open={list.length === 0} className="group">
          <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between px-[var(--admin-pad-panel)] text-sm font-semibold text-foreground hover:bg-[color:var(--admin-panel-2)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring">
            Add a partner college
            <span aria-hidden className="rounded-full bg-[color:var(--admin-panel-2)] px-3 py-1 text-xs font-medium group-open:hidden">Open</span>
          </summary>
          <PanelBody>
            <AddCollegeForm />
          </PanelBody>
        </details>
      </Panel>
    </div>
  );
}
