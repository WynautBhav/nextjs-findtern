import { desc, eq, sql } from "drizzle-orm";

import { AdminEmpty, AdminPageHeader, Panel, PanelBody, PanelHeader } from "@/components/admin/panel";
import { IdentityCell } from "@/components/admin/data-table";
import { AddCollegeForm, CollegeRowControls, type CollegeAdminRow } from "@/components/admin/college-partners-manager";
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

export default async function AdminCollegesPage() {
  const db = getDb();
  const c = schema.colleges;
  const cid = q(c, c.id);
  const rows = await db
    .select({
      college: c,
      members: sql<number>`(SELECT count(*)::int FROM ${schema.collegeMemberships} m WHERE m.college_id = ${cid} AND m.left_at IS NULL)`,
      roster: sql<number>`(SELECT count(*)::int FROM ${schema.collegeRoster} r WHERE r.college_id = ${cid})`,
      drives: sql<number>`(SELECT count(*)::int FROM ${schema.collegeDrives} d WHERE d.college_id = ${cid})`,
    })
    .from(c)
    .where(sql`${c.isPartner} OR EXISTS (SELECT 1 FROM ${schema.collegeMemberships} m WHERE m.college_id = ${cid} AND m.left_at IS NULL)`)
    .orderBy(desc(c.isPartner), c.name);
  const officers = await db
    .select({ collegeId: schema.collegeAdmins.collegeId, name: schema.collegeAdmins.name, email: schema.collegeAdmins.email, lastLoginAt: schema.collegeAdmins.lastLoginAt })
    .from(schema.collegeAdmins)
    .where(eq(schema.collegeAdmins.isActive, true));

  const list: CollegeAdminRow[] = rows.map((r) => ({
    id: r.college.id,
    name: r.college.name,
    city: r.college.city,
    aisheCode: r.college.aisheCode,
    emailDomains: r.college.emailDomains,
    isPartner: r.college.isPartner,
    showOnWebsite: r.college.showOnWebsite,
    isActive: r.college.isActive,
    members: r.members,
    roster: r.roster,
    drives: r.drives,
    officers: officers
      .filter((o) => o.collegeId === r.college.id)
      .map((o) => ({ name: o.name, email: o.email, lastLoginAt: o.lastLoginAt?.toISOString() ?? null })),
  }));

  const partners = list.filter((r) => r.isPartner).length;
  return (
    <div className="space-y-4">
      <AdminPageHeader
        title="College partners"
        subtitle={`${list.length} ${list.length === 1 ? "college" : "colleges"}, ${partners} with a console. Officers see only their own college's consenting students.`}
        className="mb-2 lg:mb-4"
      />
      {list.length === 0 ? (
        <Panel>
          <AdminEmpty title="No partner colleges yet" body="Add the first one below, then issue its placement officer a login." />
        </Panel>
      ) : null}
      {list.map((r) => (
        <Panel key={r.id}>
          <PanelHeader
            title={r.name}
            description={[r.city, r.aisheCode ? `AISHE ${r.aisheCode}` : null, r.emailDomains.length ? `@${r.emailDomains.join(", @")}` : null].filter(Boolean).join(" · ")}
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
