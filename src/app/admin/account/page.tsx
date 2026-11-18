import type { Metadata } from "next";
import { eq } from "drizzle-orm";

import { AdminLoadError, AdminPageHeader } from "@/components/admin/panel";
import { Pill } from "@/components/app/primitives";
import { Section } from "@/components/app/stat";
import { UserDot } from "@/components/layout/shell-parts";
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
    <div className="space-y-8">
      <AdminPageHeader title="Your account" subtitle="Your name, the email you sign in with, and your password." />
      {me ? (
        <div className="flex items-center gap-3 border-y border-ink-200 py-4">
          <UserDot name={me.name || me.email} className="size-12 text-base" />
          <div className="min-w-0">
            <p className="break-words font-display text-lg font-semibold text-ink-900">{me.name || "Staff member"}</p>
            <p className="break-all text-sm text-ink-600">{me.email}</p>
          </div>
          <Pill tone="neutral" className="ml-auto shrink-0">
            {me.roleName ?? me.role ?? "Staff"}
          </Pill>
        </div>
      ) : null}
      <div className="grid max-w-5xl gap-x-14 gap-y-10 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Section title="Profile" hint="Roles are changed on the Roles and access page.">
          {me ? <AdminProfileForm name={me.name ?? ""} email={me.email} /> : <AdminLoadError what="your account" retryHref="/admin/account" />}
        </Section>
        <Section title="Password" hint="Change the password you sign in with.">
          <ChangePasswordForm endpoint="/api/admin/account/password" />
        </Section>
      </div>
    </div>
  );
}
