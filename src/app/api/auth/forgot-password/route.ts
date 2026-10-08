import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createHash, randomBytes } from "node:crypto";

import { getDb, schema } from "@/lib/db";
import { sendSmtpMail } from "@/lib/mailer";
import { limiters, bucketKey, clientIp } from "@/lib/security/rate-limit";

const bodySchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  role: z.enum(["intern", "employer"]).default("intern"),
});

export async function POST(req: Request) {
  const ip = clientIp(req.headers);
  if (!limiters.login.take(bucketKey(ip))) {
    return NextResponse.json({ error: "Too many attempts" }, { status: 429 });
  }
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const db = getDb();
  const isEmployer = parsed.data.role === "employer";
  const subject = isEmployer
    ? (
        await db
          .select({ id: schema.employers.id, email: schema.employers.companyEmail })
          .from(schema.employers)
          .where(eq(schema.employers.companyEmail, parsed.data.email))
          .limit(1)
      )[0]
    : (
        await db
          .select({ id: schema.users.id, email: schema.users.email })
          .from(schema.users)
          .where(eq(schema.users.email, parsed.data.email))
          .limit(1)
      )[0];

  // Always return ok to avoid email enumeration, whoever the address belongs to.
  if (!subject) return NextResponse.json({ ok: true });

  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  await db.insert(schema.passwordResetTokens).values({
    subjectType: isEmployer ? "employer" : "user",
    subjectId: subject.id,
    tokenHash,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  });

  const base = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3100";
  const resetPath = isEmployer ? "/employer/reset-password" : "/reset-password";
  await sendSmtpMail({
    to: subject.email,
    subject: "Reset your Findtern password",
    text: `Reset your password: ${base}${resetPath}?token=${token}`,
  });
  return NextResponse.json({ ok: true });
}