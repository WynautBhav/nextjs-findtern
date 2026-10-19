import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb, schema } from "@/lib/db";
import { hashPassword, isStrongPassword, WEAK_PASSWORD_MESSAGE, verifyPassword } from "@/lib/security/password";
import { requireMutation } from "@/lib/guards-mutation";

const bodySchema = z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(8) });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireMutation({ req, roles: ["intern"], ownerId: id });
  if (!guard.ok) return guard.response;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  if (!isStrongPassword(parsed.data.newPassword)) {
    return NextResponse.json({ error: WEAK_PASSWORD_MESSAGE }, { status: 400 });
  }
  if (parsed.data.newPassword === parsed.data.currentPassword) {
    return NextResponse.json({ error: "New password must be different from the current one" }, { status: 400 });
  }

  const db = getDb();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, id)).limit(1);
  if (!user || !(await verifyPassword(parsed.data.currentPassword, user.password))) {
    return NextResponse.json({ error: "Current password incorrect" }, { status: 401 });
  }
  await db.update(schema.users).set({ password: await hashPassword(parsed.data.newPassword) }).where(eq(schema.users.id, id));
  return NextResponse.json({ ok: true });
}
