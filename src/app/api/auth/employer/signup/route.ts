import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb, schema } from "@/lib/db";
import { hashPassword, isStrongPassword, WEAK_PASSWORD_MESSAGE } from "@/lib/security/password";
import { withSession, issueCsrfCookie } from "@/lib/auth";
import { limiters, clientIp, takeAuth } from "@/lib/security/rate-limit";
import { isPersonalEmail } from "@/lib/employer-onboarding";
import { normalizePhone, phoneError, phoneLockKey } from "@/lib/phone";
import { hasVerifiedSignupOtp } from "@/lib/signup-otp";
import { phoneInUseAnywhere } from "@/lib/phone-owner";
import { isUniqueViolation, uniqueMessage } from "@/lib/promo";

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
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  if (!takeAuth(limiters.signup, "employer/signup", ip, parsed.data.companyEmail)) {
    return NextResponse.json({ error: "Too many attempts" }, { status: 429 });
  }
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
  const phoneNumber = normalizePhone(parsed.data.phoneNumber);
  const password = await hashPassword(parsed.data.password);
  let employer: typeof schema.employers.$inferSelect;
  try {
    // Racing submits for the same email or phone queue on these locks until the first insert commits,
    // so the second one's checks see the row (QA double-submit race). Same-table duplicates are also
    // caught by the unique indexes, hence the 409 below.
    const outcome = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`signup-email:${parsed.data.companyEmail}`})), pg_advisory_xact_lock(hashtext(${`signup-phone:${phoneLockKey(parsed.data.countryCode, phoneNumber)}`}))`);
      const [existing] = await tx.select({ id: schema.employers.id }).from(schema.employers).where(sql`lower(${schema.employers.companyEmail}) = ${parsed.data.companyEmail}`).limit(1);
      if (existing) return NextResponse.json({ error: "Email already registered" }, { status: 409 });
      // One person, one role: the same email cannot open both an intern and an employer account.
      const [otherRole] = await tx.select({ id: schema.users.id }).from(schema.users).where(sql`lower(${schema.users.email}) = ${parsed.data.companyEmail}`).limit(1);
      if (otherRole) return NextResponse.json({ error: "This email is already registered as an intern account" }, { status: 409 });
      // Any account's own or contact number, country code included (INT-05, INT-36, EMH-32).
      if (await phoneInUseAnywhere(parsed.data.countryCode, phoneNumber, {}, tx)) return NextResponse.json({ error: "Phone number already in use" }, { status: 409 });
      const [row] = await tx
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
      return row;
    });
    if (outcome instanceof NextResponse) return outcome;
    employer = outcome;
  } catch (e) {
    if (isUniqueViolation(e)) return NextResponse.json({ error: uniqueMessage(e) }, { status: 409 });
    throw e;
  }

  const res = NextResponse.json({ employer: { id: employer.id, companyEmail: employer.companyEmail } });
  await issueCsrfCookie(res);
  return withSession(res, { uid: employer.id, role: "employer", email: employer.companyEmail, password });
}
