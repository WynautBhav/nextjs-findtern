import { count, desc } from "drizzle-orm";
import { Shield, Users, KeyRound } from "lucide-react";

import { getDb, schema } from "@/lib/db";
import { AdminPageHeader } from "@/components/admin/panel";
import { StatCard, StatGrid } from "@/components/admin/stat-card";
import { StaffRolesManager } from "@/components/admin/staff-roles-manager";

const DEFAULT_ROLES = [
  {
    key: "admin",
    name: "Super Administrator",
    description: "Unrestricted access across database records, financial ledgers, and staff provisioning.",
    permissions: [
      "interns:read",
      "interns:write",
      "companies:read",
      "companies:write",
      "projects:read",
      "projects:write",
      "financials:read",
      "cms:write",
    ],
  },
  {
    key: "ops",
    name: "Operations Manager",
    description: "Manages candidate vetting, employer verification, and project listings approval.",
    permissions: [
      "interns:read",
      "interns:write",
      "companies:read",
      "projects:read",
      "projects:write",
      "proposals:read",
    ],
  },
  {
    key: "support",
    name: "Support Specialist",
    description: "Read only inspection of candidates, employers, and inbound contact tickets.",
    permissions: [
      "interns:read",
      "companies:read",
      "projects:read",
      "messages:read",
      "messages:write",
    ],
  },
];

export default async function AdminRolesPage() {
  const db = getDb();

  const [[staffCountRow], [rolesCountRow], staffUsers, dbRoles] = await Promise.all([
    db.select({ c: count() }).from(schema.admins),
    db.select({ c: count() }).from(schema.adminRoles),
    db.select().from(schema.admins).orderBy(desc(schema.admins.createdAt)),
    db.select().from(schema.adminRoles),
  ]);

  const totalStaff = Number(staffCountRow?.c ?? 0);
  const totalRoles = Number(rolesCountRow?.c ?? 0);
  const rolesToDisplay = dbRoles.length > 0 ? dbRoles : DEFAULT_ROLES;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Roles and staff"
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
