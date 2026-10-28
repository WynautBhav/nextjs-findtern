import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb, schema } from "@/lib/db";
import { canGrant } from "@/lib/admin/permissions";
import { requireMutation } from "@/lib/guards-mutation";
import { hashPassword, isStrongPassword, WEAK_PASSWORD_MESSAGE } from "@/lib/security/password";

const createStaffSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role: z.string().min(1, "Select a role"),
});

const deleteStaffSchema = z.object({
  id: z.string().min(1),
});

export async function POST(req: Request) {
  const guard = await requireMutation({ req, roles: ["admin"] });
  if (!guard.ok) return guard.response;

  const parsed = createStaffSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid input" }, { status: 400 });
  }

  const { name, email, password, role } = parsed.data;
  const db = getDb();
  if (!isStrongPassword(password)) return NextResponse.json({ error: WEAK_PASSWORD_MESSAGE }, { status: 400 });
  if (!(await roleExists(role))) return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  if (!(await mayAssign(guard.session.permissions, role))) {
    return NextResponse.json({ error: "You can only assign roles within your own permissions." }, { status: 403 });
  }

  const [existing] = await db
    .select({ id: schema.admins.id })
    .from(schema.admins)
    .where(eq(schema.admins.email, email.toLowerCase()))
    .limit(1);

  if (existing) {
    return NextResponse.json({ error: "An admin account with this email already exists" }, { status: 409 });
  }

  const hashedPassword = await hashPassword(password);
  const [created] = await db
    .insert(schema.admins)
    .values({
      name,
      email: email.toLowerCase(),
      password: hashedPassword,
      role,
    })
    .returning();

  return NextResponse.json({ ok: true, staff: { id: created.id, name: created.name, email: created.email, role: created.role } }, { status: 201 });
}

export async function DELETE(req: Request) {
  const guard = await requireMutation({ req, roles: ["admin"] });
  if (!guard.ok) return guard.response;
  const currentAdminId = guard.session.uid;

  const parsed = deleteStaffSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  if (parsed.data.id === currentAdminId) {
    return NextResponse.json({ error: "Cannot delete your own admin account" }, { status: 400 });
  }

  const db = getDb();
  const [target] = await db.select({ role: schema.admins.role }).from(schema.admins).where(eq(schema.admins.id, parsed.data.id)).limit(1);
  if (target && !(await mayAssign(guard.session.permissions, target.role ?? ""))) {
    return NextResponse.json({ error: "You can't remove someone with more access than you." }, { status: 403 });
  }
  await db.delete(schema.admins).where(eq(schema.admins.id, parsed.data.id));

  return NextResponse.json({ ok: true });
}

const updateStaffSchema = z
  .object({
    id: z.string().min(1),
    role: z.string().min(1).optional(),
    password: z.string().min(8, "Password must be at least 8 characters").optional(),
  })
  .refine((b) => b.role || b.password, "Nothing to change");

/** Change a staff member's role or set a new password for them. */
export async function PATCH(req: Request) {
  const guard = await requireMutation({ req, roles: ["admin"] });
  if (!guard.ok) return guard.response;
  const parsed = updateStaffSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  const { id, role, password } = parsed.data;
  if (role && id === guard.session.uid) {
    return NextResponse.json({ error: "You can't change your own role" }, { status: 400 });
  }
  if (password && !isStrongPassword(password)) return NextResponse.json({ error: WEAK_PASSWORD_MESSAGE }, { status: 400 });
  const db = getDb();
  // Who they are now matters as much as what they become: without this, anyone
  // with roles:write could reset a super admin's password and sign in as them.
  const [target] = await db.select({ role: schema.admins.role }).from(schema.admins).where(eq(schema.admins.id, id)).limit(1);
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await mayAssign(guard.session.permissions, target.role ?? ""))) {
    return NextResponse.json({ error: "You can't change someone with more access than you." }, { status: 403 });
  }
  if (role && !(await roleExists(role))) return NextResponse.json({ error: "Unknown role" }, { status: 400 });
  if (role && !(await mayAssign(guard.session.permissions, role))) {
    return NextResponse.json({ error: "You can only assign roles within your own permissions." }, { status: 403 });
  }
  const updated = await db
    .update(schema.admins)
    .set({ ...(role ? { role } : {}), ...(password ? { password: await hashPassword(password) } : {}) })
    .where(eq(schema.admins.id, id))
    .returning({ id: schema.admins.id });
  if (updated.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // Permissions are re-read per request (cached ~30s), so this applies almost at once.
  return NextResponse.json({ ok: true });
}


async function roleExists(roleKey: string): Promise<boolean> {
  if (roleKey.toLowerCase() === "super_admin") return true;
  const [row] = await getDb().select({ id: schema.adminRoles.id }).from(schema.adminRoles).where(eq(schema.adminRoles.key, roleKey)).limit(1);
  return Boolean(row);
}

/** A role may be assigned only by someone who holds all of its permissions. */
async function mayAssign(granted: string[] | undefined, roleKey: string): Promise<boolean> {
  if (roleKey.toLowerCase() === "super_admin") return canGrant(granted, ["*"]);
  const [role] = await getDb()
    .select({ p: schema.adminRoles.permissions })
    .from(schema.adminRoles)
    .where(eq(schema.adminRoles.key, roleKey))
    .limit(1);
  return canGrant(granted, Array.isArray(role?.p) ? role.p : []);
}
