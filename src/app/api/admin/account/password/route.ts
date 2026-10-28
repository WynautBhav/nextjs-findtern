import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";
import { hashPassword, isStrongPassword, verifyPassword, WEAK_PASSWORD_MESSAGE } from "@/lib/security/password";

const bodySchema = z.object({ currentPassword: z.string().min(1), newPassword: z.string() });

/** The signed-in admin changes their own password. */
export async function POST(req: Request) {
  const guard = await requireMutation({ req, roles: ["admin"] });
  if (!guard.ok) return guard.response;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  if (!isStrongPassword(parsed.data.newPassword)) {
    return NextResponse.json({ error: WEAK_PASSWORD_MESSAGE }, { status: 400 });
  }
  const db = getDb();
  const [admin] = await db.select().from(schema.admins).where(eq(schema.admins.id, guard.session.uid)).limit(1);
  if (!admin || !(await verifyPassword(parsed.data.currentPassword, admin.password))) {
    return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 });
  }
  await db.update(schema.admins).set({ password: await hashPassword(parsed.data.newPassword) }).where(eq(schema.admins.id, admin.id));
  return NextResponse.json({ ok: true });
}
