import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";
import { hashPassword } from "@/lib/security/password";

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
  await db.delete(schema.admins).where(eq(schema.admins.id, parsed.data.id));

  return NextResponse.json({ ok: true });
}
