import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createHash, randomBytes } from "node:crypto";

import { getDb, schema } from "@/lib/db";
import { emails, renderEmail } from "@/lib/emails";
import { sendSmtpMail } from "@/lib/mailer";
import { limiters, clientIp, takeAuth } from "@/lib/security/rate-limit";
import { publicOrigin } from "@/lib/google";

const bodySchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  role: z.enum(["intern", "employer"]).default("intern"),
});

/** Legacy reset links lived 30 minutes (routes.ts:3428). */
const RESET_TTL_MINUTES = 30;

export async function POST(req: Request) {
  const ip = clientIp(req.headers);
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  // Its own budget, so resets cannot starve logins or the other way round.
  if (!takeAuth(limiters.forgotPassword, "forgot-password", ip, parsed.data.email)) {
    return NextResponse.json({ error: "Too many attempts" }, { status: 429 });
  }

  const db = getDb();
  const isEmployer = parsed.data.role === "employer";
  const subject = isEmployer
    ? (
        await db
          .select({ id: schema.employers.id, email: schema.employers.companyEmail })
          .from(schema.employers)
          .where(sql`lower(${schema.employers.companyEmail}) = ${parsed.data.email}`)
          .limit(1)
      )[0]
    : (
        await db
          .select({ id: schema.users.id, email: schema.users.email })
          .from(schema.users)
          .where(sql`lower(${schema.users.email}) = ${parsed.data.email}`)
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
    expiresAt: new Date(Date.now() + RESET_TTL_MINUTES * 60_000),
  });

  const base = publicOrigin(req);
  const resetPath = isEmployer ? "/reset-password?as=employer&" : "/reset-password?";
  await sendSmtpMail({
    to: subject.email,
    ...renderEmail(emails.passwordReset({ url: `${base}${resetPath}token=${token}`, ttlMinutes: RESET_TTL_MINUTES })),
  });
  return NextResponse.json({ ok: true });
}