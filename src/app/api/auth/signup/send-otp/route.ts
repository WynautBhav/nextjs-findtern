import { and, desc, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb, schema } from "@/lib/db";
import { emails, renderEmail } from "@/lib/emails";
import { sendSmtpMail } from "@/lib/mailer";
import { generateOtp, hashOtp, limiters, bucketKey, clientIp } from "@/lib/security/rate-limit";
import { SIGNUP_OTP_SUBJECTS } from "@/lib/signup-otp";

const bodySchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  subjectType: z.enum(SIGNUP_OTP_SUBJECTS).default("intern"),
  /**
   * `signup` is a new account, so an address that already has one is refused
   * (legacy routes.ts:3532). `verify` is the recovery page for an existing,
   * never-verified account, which needs the code precisely because the
   * account exists.
   */
  purpose: z.enum(["signup", "verify"]).default("signup"),
});

const OTP_TTL_MINUTES = 10;
/** One code per email per minute (legacy routes.ts:3540). */
const RESEND_COOLDOWN_MS = 60_000;

export async function POST(req: Request) {
  const ip = clientIp(req.headers);
  if (!limiters.otp.take(bucketKey(ip))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }

  const { email, subjectType, purpose } = parsed.data;
  const db = getDb();

  if (purpose === "signup") {
    // Signup already 409s on a taken address, so saying so here exposes
    // nothing new - it just saves the user a pointless code.
    const [existing] =
      subjectType === "intern"
        ? await db.select({ id: schema.users.id }).from(schema.users).where(sql`lower(${schema.users.email}) = ${email}`).limit(1)
        : await db
            .select({ id: schema.employers.id })
            .from(schema.employers)
            .where(sql`lower(${schema.employers.companyEmail}) = ${email}`)
            .limit(1);
    if (existing) {
      return NextResponse.json({ error: "An account with this email already exists. Sign in instead." }, { status: 400 });
    }
  }

  const [last] = await db
    .select({ createdAt: schema.emailOtps.createdAt })
    .from(schema.emailOtps)
    .where(and(eq(schema.emailOtps.subjectType, subjectType), eq(schema.emailOtps.subjectId, email)))
    .orderBy(desc(schema.emailOtps.createdAt))
    .limit(1);
  const sinceLast = last?.createdAt ? Date.now() - last.createdAt.getTime() : Infinity;
  if (sinceLast < RESEND_COOLDOWN_MS) {
    const remainingSeconds = Math.ceil((RESEND_COOLDOWN_MS - sinceLast) / 1000);
    return NextResponse.json(
      { error: `Please wait ${remainingSeconds}s before requesting another code.`, remainingSeconds },
      { status: 429 },
    );
  }

  const otp = generateOtp();
  await db.insert(schema.emailOtps).values({
    subjectType,
    subjectId: email,
    otpHash: hashOtp(otp, email),
    expiresAt: new Date(Date.now() + OTP_TTL_MINUTES * 60_000),
  });

  await sendSmtpMail({
    to: email,
    ...renderEmail(emails.otp({ otp, ttlMinutes: OTP_TTL_MINUTES, forEmployer: subjectType === "employer" })),
  });

  return NextResponse.json({ ok: true });
}
