import type { Metadata } from "next";
import { asc, desc, getTableColumns } from "drizzle-orm";

import { getDb, schema, withoutPassword } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { AdminLoadError, AdminPageHeader, Panel } from "@/components/admin/panel";
import { LeadStat, Overview, StatList } from "@/components/app/stat";
import { StaffRolesManager } from "@/components/admin/staff-roles-manager";
import { ensureAdminRoles } from "@/lib/admin/roles-seed";

export const metadata: Metadata = { title: "Roles and access" };

async function load() {
  const db = getDb();
  // Seed any missing default role, as legacy did on first read.
  await ensureAdminRoles(db);
  const [staff, roles] = await Promise.all([
    db.select(withoutPassword(getTableColumns(schema.admins))).from(schema.admins).orderBy(desc(schema.admins.createdAt)),
    db.select().from(schema.adminRoles).orderBy(asc(schema.adminRoles.createdAt)),
  ]);
  // Super admin first, then the rest in the order they were made.
  roles.sort((a, b) => (a.key === "super_admin" ? -1 : b.key === "super_admin" ? 1 : 0));
  return { staff, roles };
}

export default async function AdminRolesPage() {
  const session = await getSession();
  let data: Awaited<ReturnType<typeof load>> | null = null;
  try {
    data = await load();
  } catch (error) {
    console.error("admin roles load failed", error);
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader title="Roles and access" subtitle="Who can sign in to this console and what each role may open or change." />
      {data ? (
        (() => {
          const filled = data.roles
            .map((r) => ({ label: r.name, value: data.staff.filter((x) => x.role === r.key).length }))
            .filter((r) => r.value > 0);
          const empty = data.roles.length - filled.length;
          return (
            <Overview
              lead={
                <LeadStat
                  label="Staff who can sign in"
                  value={String(data.staff.length)}
                  note={`${data.roles.length} ${data.roles.length === 1 ? "role" : "roles"}${empty ? `, ${empty} with nobody in ${empty === 1 ? "it" : "them"} yet` : ""}.`}
                />
              }
              rest={filled.length ? <StatList items={filled.map((r) => ({ label: r.label, value: String(r.value) }))} /> : undefined}
            />
          );
        })()
      ) : null}
      {data ? (
        <StaffRolesManager initialStaff={data.staff} initialRoles={data.roles} currentAdminId={session?.uid ?? null} />
      ) : (
        <Panel>
          <AdminLoadError what="staff and roles" retryHref="/admin/roles" />
        </Panel>
      )}
    </div>
  );
}
