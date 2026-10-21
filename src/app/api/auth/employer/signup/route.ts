import { and, eq, or, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb, schema } from "@/lib/db";
import { hashPassword, isStrongPassword, WEAK_PASSWORD_MESSAGE } from "@/lib/security/password";
import { withSession, issueCsrfCookie } from "@/lib/auth";
import { limiters, bucketKey, clientIp } from "@/lib/security/rate-limit";
import { isPersonalEmail } from "@/lib/employer-onboarding";
import { normalizePhone, phoneError } from "@/lib/phone";
import { hasVerifiedSignupOtp } from "@/lib/signup-otp";

const bodySchema = z.object({
  name: z.string().min(2),
  companyName: z.string().min(2),
  companyEmail: z.string().trim().toLowerCase().email(),
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
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  if (!isStrongPassword(parsed.data.password)) {
    return NextResponse.json({ error: WEAK_PASSWORD_MESSAGE }, { status: 400 });
  }
  if (isPersonalEmail(parsed.data.companyEmail)) {
    return NextResponse.json({ error: "Use your company email address" }, { status: 400 });
  }
  const phoneProblem = phoneError(parsed.data.countryCode, parsed.data.phoneNumber);
  if (phoneProblem) return NextResponse.json({ error: phoneProblem }, { status: 400 });
  if (!(await hasVerifiedSignupOtp(req, "employer", parsed.data.companyEmail))) {
    return NextResponse.json({ error: "Verify your email before creating the account" }, { status: 400 });
  }

  const db = getDb();
  const [existing] = await db.select().from(schema.employers).where(sql`lower(${schema.employers.companyEmail}) = ${parsed.data.companyEmail}`).limit(1);
  if (existing) return NextResponse.json({ error: "Email already registered" }, { status: 409 });
  const phoneNumber = normalizePhone(parsed.data.phoneNumber);
  const [phoneOwner] = await db
    .select({ id: schema.employers.id })
    .from(schema.employers)
    .where(and(eq(schema.employers.countryCode, parsed.data.countryCode), eq(schema.employers.phoneNumber, phoneNumber)))
    .limit(1);
  if (phoneOwner) return NextResponse.json({ error: "Phone number already registered" }, { status: 409 });

  // One person, one role: an email or phone already on an intern account
  // cannot also open an employer account.
  const [internOwner] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(
      or(
        sql`lower(${schema.users.email}) = ${parsed.data.companyEmail}`,
        and(eq(schema.users.countryCode, parsed.data.countryCode), eq(schema.users.phoneNumber, phoneNumber)),
      ),
    )
    .limit(1);
  if (internOwner) {
    return NextResponse.json(
      { error: "This email or phone number is already registered as an intern account" },
      { status: 409 },
    );
  }

  const password = await hashPassword(parsed.data.password);
  const [employer] = await db
    .insert(schema.employers)
    .values({
      name: parsed.data.name,
      companyName: parsed.data.companyName,
      companyEmail: parsed.data.companyEmail,
      countryCode: parsed.data.countryCode,
      phoneNumber,
      password,
      agreedToTerms: true,
      emailVerified: true,
    })
    .returning();

  const res = NextResponse.json({ employer: { id: employer.id, companyEmail: employer.companyEmail } });
  await issueCsrfCookie(res);
  return withSession(res, { uid: employer.id, role: "employer", email: employer.companyEmail });
}
