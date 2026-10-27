import { count, desc, getTableColumns } from "drizzle-orm";
import { Shield, Users, KeyRound } from "lucide-react";

import { getDb, schema, withoutPassword } from "@/lib/db";
import { AdminPageHeader } from "@/components/admin/panel";
import { StatCard, StatGrid } from "@/components/admin/stat-card";
import { StaffRolesManager } from "@/components/admin/staff-roles-manager";
import { ensureAdminRoles } from "@/lib/admin/roles-seed";

export default async function AdminRolesPage() {
  const db = getDb();

  // Seed any missing default role, as legacy did on first read.
  await ensureAdminRoles(db);

  const [[staffCountRow], [rolesCountRow], staffUsers, dbRoles] = await Promise.all([
    db.select({ c: count() }).from(schema.admins),
    db.select({ c: count() }).from(schema.adminRoles),
    db.select(withoutPassword(getTableColumns(schema.admins))).from(schema.admins).orderBy(desc(schema.admins.createdAt)),
    db.select().from(schema.adminRoles),
  ]);

  const totalStaff = Number(staffCountRow?.c ?? 0);
  const totalRoles = Number(rolesCountRow?.c ?? 0);
  const rolesToDisplay = dbRoles;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Roles and Access"
        subtitle="Staff account directory, role assignments and security permission matrix."
      />

      <StatGrid cols={3}>
        <StatCard
          label="Staff accounts"
          value={totalStaff.toLocaleString("en-IN")}
          hint="Provisioned admin credentials"
          icon={Users}
          tone="brand"
        />
        <StatCard
          label="Configured roles"
          value={Math.max(totalRoles, rolesToDisplay.length).toLocaleString("en-IN")}
          hint="Defined access profiles"
          icon={Shield}
          tone="info"
        />
        <StatCard
          label="Security status"
          value="Active"
          hint="Multi factor ready"
          icon={KeyRound}
          tone="success"
        />
      </StatGrid>

      <StaffRolesManager initialStaff={staffUsers} initialRoles={rolesToDisplay} />
    </div>
  );
}
