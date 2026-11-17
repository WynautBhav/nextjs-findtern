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
  role: z.enum(["intern", "employer", "admin"]).default("intern"),
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
  // One lookup per account type; each yields the subject row the token is issued against.
  const lookup = {
    admin: { table: schema.admins, email: schema.admins.email, id: schema.admins.id, type: "admin", path: "/reset-password?as=admin&" },
    employer: { table: schema.employers, email: schema.employers.companyEmail, id: schema.employers.id, type: "employer", path: "/reset-password?as=employer&" },
    intern: { table: schema.users, email: schema.users.email, id: schema.users.id, type: "user", path: "/reset-password?" },
  }[parsed.data.role];
  const [subject] = await db
    .select({ id: lookup.id, email: lookup.email })
    .from(lookup.table)
    .where(sql`lower(${lookup.email}) = ${parsed.data.email}`)
    .limit(1);

  // Always return ok to avoid email enumeration, whoever the address belongs to.
  if (!subject) return NextResponse.json({ ok: true });

  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  await db.insert(schema.passwordResetTokens).values({
    subjectType: lookup.type,
    subjectId: subject.id,
    tokenHash,
    expiresAt: new Date(Date.now() + RESET_TTL_MINUTES * 60_000),
  });

  const base = publicOrigin(req);
  await sendSmtpMail({
    to: subject.email,
    ...renderEmail(emails.passwordReset({ url: `${base}${lookup.path}token=${token}`, ttlMinutes: RESET_TTL_MINUTES })),
  });
  return NextResponse.json({ ok: true });
}