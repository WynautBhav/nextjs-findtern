import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb, schema } from "@/lib/db";
import { hashPassword, isStrongPassword, WEAK_PASSWORD_MESSAGE } from "@/lib/security/password";
import { withSession, issueCsrfCookie } from "@/lib/auth";
import { limiters, bucketKey, clientIp } from "@/lib/security/rate-limit";
import { normalizePhone, phoneError } from "@/lib/phone";
import { hasVerifiedSignupOtp, INTERN_EMAIL_MESSAGE, isInternEmail } from "@/lib/signup-otp";
import { phoneInUseAnywhere } from "@/lib/phone-owner";

const bodySchema = z.object({
  firstName: z.string().min(2),
  lastName: z.string().min(2),
  email: z.string().trim().toLowerCase().email(),
  countryCode: z.string().trim().default("+91"),
  phoneNumber: z.string().min(6),
  password: z.string().min(8),
  agreedToTerms: z.literal(true),
});

export async function POST(req: Request) {
  const ip = clientIp(req.headers);
  if (!limiters.signup.take(bucketKey(ip))) {
    return NextResponse.json({ error: "Too many attempts" }, { status: 429 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  if (!isStrongPassword(parsed.data.password)) {
    return NextResponse.json({ error: WEAK_PASSWORD_MESSAGE }, { status: 400 });
  }
  // Interns register with a personal address (INT-06, legacy shared/schema.ts:
  // "Please use a personal email address"), so the account outlives a
  // college or employer mailbox.
  if (!isInternEmail(parsed.data.email)) {
    return NextResponse.json({ error: INTERN_EMAIL_MESSAGE }, { status: 400 });
  }
  const phoneProblem = phoneError(parsed.data.countryCode, parsed.data.phoneNumber);
  if (phoneProblem) {
    return NextResponse.json({ error: phoneProblem }, { status: 400 });
  }
  if (!(await hasVerifiedSignupOtp(req, "intern", parsed.data.email))) {
    return NextResponse.json({ error: "Verify your email before creating the account" }, { status: 400 });
  }

  const db = getDb();
  const [existing] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(sql`lower(${schema.users.email}) = ${parsed.data.email}`)
    .limit(1);
  if (existing) {
    return NextResponse.json({ error: "Email already registered" }, { status: 409 });
  }
  // One person, one role: an email already on an employer account cannot
  // also open an intern account.
  const [employerOwner] = await db
    .select({ id: schema.employers.id })
    .from(schema.employers)
    .where(sql`lower(${schema.employers.companyEmail}) = ${parsed.data.email}`)
    .limit(1);
  if (employerOwner) {
    return NextResponse.json(
      { error: "This email is already registered as an employer account" },
      { status: 409 },
    );
  }
  // Own numbers, intern emergency / second contacts and employer escalation
  // contacts, country code included (INT-05, INT-36).
  const phoneNumber = normalizePhone(parsed.data.phoneNumber);
  if (await phoneInUseAnywhere(parsed.data.countryCode, phoneNumber)) {
    return NextResponse.json({ error: "Phone number already in use" }, { status: 409 });
  }

  const password = await hashPassword(parsed.data.password);
  const [user] = await db
    .insert(schema.users)
    .values({
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      email: parsed.data.email,
      countryCode: parsed.data.countryCode,
      phoneNumber,
      password,
      agreedToTerms: true,
      emailVerified: true,
    })
    .returning();

  const res = NextResponse.json({ user: { id: user.id, email: user.email } });
  await issueCsrfCookie(res);
  return withSession(res, { uid: user.id, role: "intern", email: user.email, password });
}
