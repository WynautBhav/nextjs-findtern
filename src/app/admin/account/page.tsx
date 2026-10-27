import type { Metadata } from "next";
import { eq } from "drizzle-orm";

import { AdminLoadError, AdminPageHeader, Panel, PanelBody, PanelHeader } from "@/components/admin/panel";
import { ChangePasswordForm } from "@/components/auth/change-password-form";
import { getSession } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { AdminProfileForm } from "./profile-form";

export const metadata: Metadata = { title: "Your account" };

/** Every admin can reach this, whatever their role. */
export default async function AdminAccountPage() {
  const session = await getSession();
  let me: { name: string | null; email: string; role: string | null; roleName: string | null } | null = null;
  try {
    if (session) {
      const [row] = await getDb()
        .select({ name: schema.admins.name, email: schema.admins.email, role: schema.admins.role, roleName: schema.adminRoles.name })
        .from(schema.admins)
        .leftJoin(schema.adminRoles, eq(schema.adminRoles.key, schema.admins.role))
        .where(eq(schema.admins.id, session.uid))
        .limit(1);
      me = row ?? null;
    }
  } catch (error) {
    console.error("admin account load failed", error);
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader title="Your account" subtitle="Your name, the email you sign in with, and your password." />
      <div className="grid max-w-4xl gap-6 lg:grid-cols-2">
        <Panel>
          <PanelHeader
            title="Profile"
            description={me ? `Role: ${me.roleName ?? me.role ?? "Staff"}. Roles are changed on the Roles and access page.` : undefined}
          />
          {me ? (
            <PanelBody>
              <AdminProfileForm name={me.name ?? ""} email={me.email} />
            </PanelBody>
          ) : (
            <AdminLoadError what="your account" retryHref="/admin/account" />
          )}
        </Panel>
        <Panel>
          <PanelHeader title="Password" description="8 or more characters, with upper and lower case letters and a number." />
          <PanelBody>
            <ChangePasswordForm endpoint="/api/admin/account/password" />
          </PanelBody>
        </Panel>
      </div>
    </div>
  );
}
