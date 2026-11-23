import { eq, and, gt, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createHash } from "node:crypto";

import { getDb, schema } from "@/lib/db";
import { hashPassword, isStrongPassword, WEAK_PASSWORD_MESSAGE } from "@/lib/security/password";
import { forgetAccountStatus } from "@/lib/account-status";

const bodySchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8),
});

export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  if (!isStrongPassword(parsed.data.password)) {
    return NextResponse.json({ error: WEAK_PASSWORD_MESSAGE }, { status: 400 });
  }

  const db = getDb();
  const tokenHash = createHash("sha256").update(parsed.data.token).digest("hex");
  // Claim the token in one statement so two concurrent requests cannot both spend it.
  const [row] = await db
    .update(schema.passwordResetTokens)
    .set({ usedAt: new Date() })
    .where(and(eq(schema.passwordResetTokens.tokenHash, tokenHash), isNull(schema.passwordResetTokens.usedAt), gt(schema.passwordResetTokens.expiresAt, new Date())))
    .returning();
  if (!row) return NextResponse.json({ error: "Invalid or expired token" }, { status: 400 });

  const password = await hashPassword(parsed.data.password);
  if (row.subjectType === "employer") {
    await db.update(schema.employers).set({ password, passwordChangedAt: new Date() }).where(eq(schema.employers.id, row.subjectId));
  } else if (row.subjectType === "college") {
    // The session carries the password version, so the new hash ends every other placement-console session.
    await db.update(schema.collegeAdmins).set({ password }).where(eq(schema.collegeAdmins.id, row.subjectId));
  } else if (row.subjectType === "admin") {
    await db.update(schema.admins).set({ password }).where(eq(schema.admins.id, row.subjectId));
  } else {
    await db.update(schema.users).set({ password }).where(eq(schema.users.id, row.subjectId));
  }
  // A reset ends every existing session on the account (INT-26).
  forgetAccountStatus(row.subjectType === "user" ? "intern" : row.subjectType, row.subjectId);
  return NextResponse.json({ ok: true });
}
