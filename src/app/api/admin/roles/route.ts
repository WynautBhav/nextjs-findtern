import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { recordAdminAudit } from "@/lib/admin/audit";
import { getDb, schema } from "@/lib/db";
import { canGrant, PERMISSIONS } from "@/lib/admin/permissions";
import { requireMutation } from "@/lib/guards-mutation";

const bodySchema = z.object({
  key: z.string().regex(/^[A-Za-z0-9_]{2,40}$/, "Role key: 2 to 40 letters, numbers or underscores"),
  name: z.string().min(2, "Give the role a name of 2 or more letters").max(80, "Role name is 80 characters at most"),
  permissions: z.array(z.enum(["*", ...PERMISSIONS.map((p) => p.key)] as [string, ...string[]], "Unknown permission")).default([]),
});

export async function POST(req: Request) {
  const guard = await requireMutation({ req, roles: ["admin"] });
  if (!guard.ok) return guard.response;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check the details" }, { status: 400 });

  if (parsed.data.key.toLowerCase() === "super_admin" || !canGrant(guard.session.permissions, parsed.data.permissions)) {
    return NextResponse.json({ error: "You can only grant permissions you have yourself." }, { status: 403 });
  }
  const db = getDb();
  const [existing] = await db.select({ id: schema.adminRoles.id }).from(schema.adminRoles).where(eq(schema.adminRoles.key, parsed.data.key)).limit(1);
  if (existing) return NextResponse.json({ error: "A role with this key already exists." }, { status: 409 });
  const [role] = await db.insert(schema.adminRoles).values(parsed.data).returning();
  await recordAdminAudit(db, { adminId: guard.session.uid, action: "role.create", targetType: "role", targetId: role.id, meta: { key: role.key, name: role.name, permissions: parsed.data.permissions } });
  return NextResponse.json({ role }, { status: 201 });
}
