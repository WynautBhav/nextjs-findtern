import { and, desc, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { SITE } from "@/lib/content/site";
import { getDb, schema } from "@/lib/db";
import { emails, renderEmail } from "@/lib/emails";
import { sendSmtpMail } from "@/lib/mailer";
import { bucketKey, generateOtp, hashOtp, limiters, clientIp, takeAuth } from "@/lib/security/rate-limit";
import { accountExistsEmail } from "@/lib/account-exists-email";
import { phoneInUseAnywhere } from "@/lib/phone-owner";
import { isPersonalEmail } from "@/lib/employer-onboarding";
import { INTERN_EMAIL_MESSAGE, internEmailAllowed, SIGNUP_OTP_SUBJECTS } from "@/lib/signup-otp";

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
  /** Sent by the signup forms so a taken number is refused before a code is mailed. */
  countryCode: z.string().trim().regex(/^\+\d{1,4}$/).optional(),
  phoneNumber: z.string().trim().regex(/^\d{4,15}$/).optional(),
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

  const { email, subjectType, purpose, countryCode, phoneNumber } = parsed.data;
  const db = getDb();

  // Same check and message as the signup POST, but this route answers it before any code is verified, so it
  // shares the phone-lookup limit (per IP, not per email) with /api/users/exists/phone. Over the limit, the
  // check is skipped, not failed: the signup POST still refuses a taken number.
  if (
    purpose === "signup" &&
    countryCode &&
    phoneNumber &&
    limiters.phoneLookup.take(bucketKey(ip)) &&
    (await phoneInUseAnywhere(countryCode, phoneNumber))
  ) {
    return NextResponse.json({ error: "Phone number already in use" }, { status: 409 });
  }

  if (purpose === "signup" && subjectType === "intern" && !(await internEmailAllowed(email))) {
    return NextResponse.json({ error: INTERN_EMAIL_MESSAGE }, { status: 400 });
  }

  // Same rule as employer/signup: a code for a personal mailbox could never be used.
  if (purpose === "signup" && subjectType === "employer" && isPersonalEmail(email)) {
    return NextResponse.json({ error: "Use your company email address" }, { status: 400 });
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

  // B-55: an address that already has an account (either role) gets the same answer as a new one, so this
  // form cannot be used to find out who is registered. The owner is mailed instead of a code. The signup POSTs
  // are only reachable with a verified code for the address, so their "already registered" 409s reveal
  // nothing to a stranger.
  let accountExists = false;
  if (purpose === "signup") {
    const [intern] = await db.select({ id: schema.users.id }).from(schema.users).where(sql`lower(${schema.users.email}) = ${email}`).limit(1);
    const [employer] = await db
      .select({ id: schema.employers.id })
      .from(schema.employers)
      .where(sql`lower(${schema.employers.companyEmail}) = ${email}`)
      .limit(1);
    accountExists = Boolean(intern || employer);
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
  // For an existing account the row is already expired and its hash matches no code: it only starts the
  // same resend cooldown a real code would, so the 429 timing is no tell and the owner is not mail-bombed.
  await db.insert(schema.emailOtps).values({
    subjectType,
    subjectId: email,
    otpHash: hashOtp(otp, email),
    expiresAt: accountExists ? new Date(0) : new Date(Date.now() + OTP_TTL_MINUTES * 60_000),
  });

  const sent = await sendSmtpMail({
    to: email,
    ...renderEmail(
      accountExists ? accountExistsEmail() : emails.otp({ otp, ttlMinutes: OTP_TTL_MINUTES, forEmployer: subjectType === "employer" }),
    ),
  });

  // Never let signup fail silently (bug sheet 7, NC r17/r35): a staging
  // server with MAIL_MODE=log, no SMTP settings or a refused send used to
  // answer "ok" and leave the person waiting for a code that never came.
  if (!sent.ok) {
    return NextResponse.json(
      {
        error:
          `We could not send the verification email just now. Try again in a few minutes, or write to ${SITE.email}.`,
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
