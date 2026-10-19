import { eq, or } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb, schema } from "@/lib/db";
import { canGrant, PERMISSIONS } from "@/lib/admin/permissions";
import { requireMutation } from "@/lib/guards-mutation";

const bodySchema = z.object({
  name: z.string().min(2).optional(),
  permissions: z.array(z.enum(["*", ...PERMISSIONS.map((p) => p.key)] as [string, ...string[]])).optional(),
});

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireMutation({ req, roles: ["admin"] });
  if (!guard.ok) return guard.response;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  if (parsed.data.permissions && !canGrant(guard.session.permissions, parsed.data.permissions)) {
    return NextResponse.json({ error: "You can only grant permissions you have yourself." }, { status: 403 });
  }
  const db = getDb();
  if (id === "super_admin" && !canGrant(guard.session.permissions, ["*"])) {
    return NextResponse.json({ error: "Only a super admin can change this role." }, { status: 403 });
  }
  // Accepts the row id or the role key (the UI only knows keys).
  const [role] = await db
    .select({ id: schema.adminRoles.id, permissions: schema.adminRoles.permissions })
    .from(schema.adminRoles)
    .where(or(eq(schema.adminRoles.id, id), eq(schema.adminRoles.key, id)))
    .limit(1);
  if (!role) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // Editing a role that already has more access than you would let you hand
  // that role (and everyone in it) whatever you choose; refuse it outright.
  if (!canGrant(guard.session.permissions, Array.isArray(role.permissions) ? role.permissions : [])) {
    return NextResponse.json({ error: "You can't edit a role with more access than you." }, { status: 403 });
  }
  await db
    .update(schema.adminRoles)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(schema.adminRoles.id, role.id));
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireMutation({ req, roles: ["admin"] });
  if (!guard.ok) return guard.response;
  const db = getDb();
  const [role] = await db
    .select({ id: schema.adminRoles.id, key: schema.adminRoles.key })
    .from(schema.adminRoles)
    .where(or(eq(schema.adminRoles.id, id), eq(schema.adminRoles.key, id)))
    .limit(1);
  if (!role) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (role.key === "super_admin") return NextResponse.json({ error: "The super admin role can't be deleted" }, { status: 400 });
  const [member] = await db.select({ id: schema.admins.id }).from(schema.admins).where(eq(schema.admins.role, role.key)).limit(1);
  if (member) return NextResponse.json({ error: "Move its members to another role first" }, { status: 409 });
  await db.delete(schema.adminRoles).where(eq(schema.adminRoles.id, role.id));
  return NextResponse.json({ ok: true });
}
