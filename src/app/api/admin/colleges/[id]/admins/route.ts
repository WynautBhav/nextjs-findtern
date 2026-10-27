import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { requireMutation } from "@/lib/guards-mutation";
import { getDb, schema } from "@/lib/db";
import { hashPassword } from "@/lib/security/password";

const bodySchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email(),
});

/**
 * Issue a placement officer's login. The password is generated, returned
 * once for Findtern staff to hand over, and stored only as an argon2 hash.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireMutation({ req, roles: ["admin"] });
  if (!guard.ok) return guard.response;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a name and a valid email" }, { status: 400 });
  const { id } = await ctx.params;
  const db = getDb();
  const [college] = await db.select({ id: schema.colleges.id }).from(schema.colleges).where(eq(schema.colleges.id, id)).limit(1);
  if (!college) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const password = `${randomBytes(9).toString("base64url")}-${randomBytes(3).toString("hex")}`;
  const [row] = await db
    .insert(schema.collegeAdmins)
    .values({ collegeId: id, name: parsed.data.name, email: parsed.data.email, password: await hashPassword(password) })
    .onConflictDoNothing()
    .returning({ id: schema.collegeAdmins.id });
  if (!row) return NextResponse.json({ error: "That email already has a placement console login" }, { status: 409 });
  return NextResponse.json({ id: row.id, email: parsed.data.email, password }, { status: 201 });
}
