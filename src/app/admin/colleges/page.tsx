import { desc, eq, sql } from "drizzle-orm";

import { AdminPageHeader, Panel, PanelBody, PanelHeader } from "@/components/admin/panel";
import { AddCollegeForm, CollegeRowControls, type CollegeAdminRow } from "@/components/admin/college-partners-manager";
import { getDb, schema } from "@/lib/db";
import { q } from "@/lib/college/sql";

export const dynamic = "force-dynamic";

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

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="College partners"
        subtitle="Colleges with a placement console, plus any college students have picked. Officers see only their own college's consenting students."
      />
      <Panel>
        <PanelHeader title="Add a partner college" />
        <PanelBody>
          <AddCollegeForm />
        </PanelBody>
      </Panel>
      {list.map((r) => (
        <Panel key={r.id}>
          <PanelHeader
            title={r.name}
            description={[r.city, r.aisheCode ? `AISHE ${r.aisheCode}` : null, r.emailDomains.length ? `@${r.emailDomains.join(", @")}` : null].filter(Boolean).join(" · ")}
            action={
              <span className="nums text-[13px] text-text-subtle">
                {r.members} students · {r.roster} on roster · {r.drives} drives
              </span>
            }
          />
          <PanelBody className="space-y-3">
            {r.officers.length ? (
              <ul className="text-[14px] text-ink-800">
                {r.officers.map((o) => (
                  <li key={o.email}>
                    {o.name} · {o.email}
                    <span className="text-text-subtle"> · {o.lastLoginAt ? `last signed in ${new Date(o.lastLoginAt).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })}` : "never signed in"}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[14px] text-text-subtle">No placement officer login yet.</p>
            )}
            <CollegeRowControls row={r} />
          </PanelBody>
        </Panel>
      ))}
    </div>
  );
}
