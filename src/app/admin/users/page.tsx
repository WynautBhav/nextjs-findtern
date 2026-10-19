import type { Metadata } from "next";
import { desc } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { allows } from "@/lib/admin/permissions";
import { realEmployers } from "@/lib/admin/scope";
import { AdminPageHeader } from "@/components/admin/panel";
import { AdminUsersView } from "@/components/admin/admin-users-view";

export const metadata: Metadata = {
  title: "Registered Users",
  robots: { index: false, follow: false },
};

export default async function AdminUsersPage() {
  const db = getDb();
  // Staff accounts are only listed for people who manage staff (roles:write);
  // users:read alone is about candidates and companies.
  const session = await getSession();
  const showStaff = allows(session?.permissions, ["roles:write"]);

  const [internUsers, employerUsers, adminUsers] = await Promise.all([
    db
      .select({
        id: schema.users.id,
        firstName: schema.users.firstName,
        lastName: schema.users.lastName,
        email: schema.users.email,
        phoneNumber: schema.users.phoneNumber,
        countryCode: schema.users.countryCode,
        role: schema.users.role,
        isActive: schema.users.isActive,
        emailVerified: schema.users.emailVerified,
        createdAt: schema.users.createdAt,
      })
      .from(schema.users)
      .orderBy(desc(schema.users.createdAt)),
    db
      .select({
        id: schema.employers.id,
        name: schema.employers.name,
        companyName: schema.employers.companyName,
        companyEmail: schema.employers.companyEmail,
        phoneNumber: schema.employers.phoneNumber,
        countryCode: schema.employers.countryCode,
        emailVerified: schema.employers.emailVerified,
        isActive: schema.employers.isActive,
        createdAt: schema.employers.createdAt,
      })
      .from(schema.employers)
      .where(realEmployers())
      .orderBy(desc(schema.employers.createdAt)),
    !showStaff
      ? Promise.resolve([] as { id: string; name: string | null; email: string; role: string | null; createdAt: Date | null }[])
      : db
      .select({
        id: schema.admins.id,
        name: schema.admins.name,
        email: schema.admins.email,
        role: schema.admins.role,
        createdAt: schema.admins.createdAt,
      })
      .from(schema.admins)
      .orderBy(desc(schema.admins.createdAt)),
  ]);

  const allUsers = [
    ...internUsers.map((u) => ({
      id: u.id,
      firstName: u.firstName,
      lastName: u.lastName,
      email: u.email,
      phoneNumber: u.phoneNumber,
      countryCode: u.countryCode,
      role: u.role || "intern",
      status: u.isActive ? "active" : "inactive",
      emailVerified: u.emailVerified,
      createdAt: u.createdAt,
    })),
    ...employerUsers.map((e) => {
      const parts = (e.name || e.companyName || "Employer").split(" ");
      return {
        id: e.id,
        firstName: parts[0] || "",
        lastName: parts.slice(1).join(" ") || `(${e.companyName})`,
        email: e.companyEmail,
        phoneNumber: e.phoneNumber,
        countryCode: e.countryCode,
        role: "employer",
        status: e.isActive ? "active" : "inactive",
        emailVerified: e.emailVerified,
        createdAt: e.createdAt,
      };
    }),
    ...adminUsers.map((a) => {
      const parts = (a.name || "Admin").split(" ");
      return {
        id: a.id,
        firstName: parts[0] || "Admin",
        lastName: parts.slice(1).join(" ") || "",
        email: a.email,
        phoneNumber: "-",
        countryCode: "",
        role: a.role || "admin",
        status: "active",
        emailVerified: true,
        createdAt: a.createdAt,
      };
    }),
  ];

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Registered Users"
        subtitle="Global directory of all candidates, hiring employers, and platform staff accounts."
      />
      <AdminUsersView initialUsers={allUsers} />
    </div>
  );
}
