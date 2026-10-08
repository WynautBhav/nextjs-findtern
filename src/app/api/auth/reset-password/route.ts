import { eq, and, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createHash } from "node:crypto";

import { getDb, schema } from "@/lib/db";
import { hashPassword, isStrongPassword } from "@/lib/security/password";

const bodySchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8),
});

export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  if (!isStrongPassword(parsed.data.password)) {
    return NextResponse.json({ error: "Weak password" }, { status: 400 });
  }

  const db = getDb();
  const tokenHash = createHash("sha256").update(parsed.data.token).digest("hex");
  const [row] = await db
    .select()
    .from(schema.passwordResetTokens)
    .where(and(eq(schema.passwordResetTokens.tokenHash, tokenHash), isNull(schema.passwordResetTokens.usedAt)))
    .limit(1);
  if (!row || row.expiresAt < new Date()) {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 400 });
  }

  const password = await hashPassword(parsed.data.password);
  if (row.subjectType === "employer") {
    await db.update(schema.employers).set({ password }).where(eq(schema.employers.id, row.subjectId));
  } else {
    await db.update(schema.users).set({ password }).where(eq(schema.users.id, row.subjectId));
  }
  await db.update(schema.passwordResetTokens).set({ usedAt: new Date() }).where(eq(schema.passwordResetTokens.id, row.id));
  return NextResponse.json({ ok: true });
}
