import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb, schema } from "@/lib/db";
import { canGrant, PERMISSIONS } from "@/lib/admin/permissions";
import { requireMutation } from "@/lib/guards-mutation";

const bodySchema = z.object({
  key: z.string().min(2),
  name: z.string().min(2),
  permissions: z.array(z.enum(["*", ...PERMISSIONS.map((p) => p.key)] as [string, ...string[]])).default([]),
});

export async function POST(req: Request) {
  const guard = await requireMutation({ req, roles: ["admin"] });
  if (!guard.ok) return guard.response;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  if (parsed.data.key.toLowerCase() === "super_admin" || !canGrant(guard.session.permissions, parsed.data.permissions)) {
    return NextResponse.json({ error: "You can only grant permissions you have yourself." }, { status: 403 });
  }
  const db = getDb();
  const [existing] = await db.select({ id: schema.adminRoles.id }).from(schema.adminRoles).where(eq(schema.adminRoles.key, parsed.data.key)).limit(1);
  if (existing) return NextResponse.json({ error: "A role with this key already exists." }, { status: 409 });
  const [role] = await db.insert(schema.adminRoles).values(parsed.data).returning();
  return NextResponse.json({ role }, { status: 201 });
}
