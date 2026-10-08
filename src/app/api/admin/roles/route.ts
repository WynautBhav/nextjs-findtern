import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";

const bodySchema = z.object({
  key: z.string().min(2),
  name: z.string().min(2),
  permissions: z.array(z.string()).default([]),
});

export async function POST(req: Request) {
  const guard = await requireMutation({ req, roles: ["admin"] });
  if (!guard.ok) return guard.response;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const db = getDb();
  const [role] = await db.insert(schema.adminRoles).values(parsed.data).returning();
  return NextResponse.json({ role }, { status: 201 });
}
