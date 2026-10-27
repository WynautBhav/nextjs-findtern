import { and, eq, ne, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb, schema } from "@/lib/db";
import { withSession } from "@/lib/auth";
import { requireMutation } from "@/lib/guards-mutation";
import { verifyPassword } from "@/lib/security/password";

const bodySchema = z.object({
  name: z.string().trim().min(2, "Enter your name (2 characters or more).").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email address.").max(254),
  /** Needed only when the email changes: it is the sign-in identity. */
  currentPassword: z.string().optional(),
});

/**
 * The signed-in admin edits their own name and email (ADP-23; legacy allowed
 * it). Changing the email asks for the current password and must not collide
 * with another admin. The session is re-issued so the new email shows at once.
 */
export async function PATCH(req: Request) {
  const guard = await requireMutation({ req, roles: ["admin"] });
  if (!guard.ok) return guard.response;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const { name, email, currentPassword } = parsed.data;

  const db = getDb();
  const [admin] = await db.select().from(schema.admins).where(eq(schema.admins.id, guard.session.uid)).limit(1);
  if (!admin) return NextResponse.json({ error: "Account not found" }, { status: 404 });

  const emailChanged = email !== admin.email.trim().toLowerCase();
  if (emailChanged) {
    if (!currentPassword || !(await verifyPassword(currentPassword, admin.password))) {
      return NextResponse.json({ error: "Enter your current password to change the sign-in email." }, { status: 400 });
    }
    const [taken] = await db
      .select({ id: schema.admins.id })
      .from(schema.admins)
      .where(and(sql`lower(${schema.admins.email}) = ${email}`, ne(schema.admins.id, admin.id)))
      .limit(1);
    if (taken) return NextResponse.json({ error: "Another staff account already uses that email." }, { status: 409 });
  }

  await db
    .update(schema.admins)
    .set({ name, ...(emailChanged ? { email } : {}) })
    .where(eq(schema.admins.id, admin.id));
  await db.insert(schema.adminAuditLog).values({
    adminId: admin.id,
    action: "account.update",
    targetType: "admin",
    targetId: admin.id,
    meta: {
      ...(name !== admin.name ? { name: { from: admin.name, to: name } } : {}),
      ...(emailChanged ? { email: { from: admin.email, to: email } } : {}),
    },
  });

  const res = NextResponse.json({ ok: true, name, email: emailChanged ? email : admin.email });
  if (!emailChanged) return res;
  return withSession(res, {
    uid: guard.session.uid,
    role: "admin",
    email,
    permissions: guard.session.permissions,
  });
}
