import { and, desc, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb, schema } from "@/lib/db";
import { emails, renderEmail } from "@/lib/emails";
import { sendSmtpMail } from "@/lib/mailer";
import { generateOtp, hashOtp, limiters, clientIp, takeAuth } from "@/lib/security/rate-limit";
import { INTERN_EMAIL_MESSAGE, isInternEmail, SIGNUP_OTP_SUBJECTS } from "@/lib/signup-otp";

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
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }
  if (!takeAuth(limiters.otp, "signup/send-otp", ip, parsed.data.email)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const { email, subjectType, purpose } = parsed.data;
  const db = getDb();

  if (purpose === "signup" && subjectType === "intern" && !isInternEmail(email)) {
    return NextResponse.json({ error: INTERN_EMAIL_MESSAGE }, { status: 400 });
  }

  if (purpose === "verify") {
    // The recovery path is for an existing account that was never verified
    // (INT-25; legacy sent it only then). Anything else gets the same "ok"
    // with no email, so the answer does not reveal which addresses exist.
    const [account] =
      subjectType === "intern"
        ? await db
            .select({ verified: schema.users.emailVerified })
            .from(schema.users)
            .where(sql`lower(${schema.users.email}) = ${email}`)
            .limit(1)
        : await db
            .select({ verified: schema.employers.emailVerified })
            .from(schema.employers)
            .where(sql`lower(${schema.employers.companyEmail}) = ${email}`)
            .limit(1);
    if (!account || account.verified) return NextResponse.json({ ok: true });
  }

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
    // One person, one role: the signup routes refuse an address held by the
    // other side, so refuse it before mailing a code that cannot be used.
    const [otherSide] =
      subjectType === "intern"
        ? await db
            .select({ id: schema.employers.id })
            .from(schema.employers)
            .where(sql`lower(${schema.employers.companyEmail}) = ${email}`)
            .limit(1)
        : await db.select({ id: schema.users.id }).from(schema.users).where(sql`lower(${schema.users.email}) = ${email}`).limit(1);
    if (otherSide) {
      return NextResponse.json(
        {
          error:
            subjectType === "intern"
              ? "This email is registered to a company account. One email can't be used for both an intern and a company account."
              : "This email is registered to an intern account. One email can't be used for both an intern and a company account.",
        },
        { status: 400 },
      );
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

  const sent = await sendSmtpMail({
    to: email,
    ...renderEmail(emails.otp({ otp, ttlMinutes: OTP_TTL_MINUTES, forEmployer: subjectType === "employer" })),
  });

  // Never let signup fail silently (bug sheet 7, NC r17/r35): a staging
  // server with MAIL_MODE=log, no SMTP settings or a refused send used to
  // answer "ok" and leave the person waiting for a code that never came.
  if (!sent.ok) {
    return NextResponse.json(
      {
        error:
          "We could not send the verification email just now. Try again in a few minutes, or write to communicate@findtern.in.",
        delivery: "failed",
        resendAfterSeconds: 0,
      },
      { status: 502 },
    );
  }
  return NextResponse.json({
    ok: true,
    resendAfterSeconds: RESEND_COOLDOWN_MS / 1000,
    // "log": this server writes emails to its log instead of sending them
    // (a test deployment). The form says so instead of waiting for a mail.
    ...(sent.mode === "log" ? { delivery: "log" } : {}),
  });
}
