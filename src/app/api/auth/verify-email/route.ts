import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb, schema } from "@/lib/db";
import { bucketKey, clientIp, limiters } from "@/lib/security/rate-limit";
import { hasVerifiedSignupOtp } from "@/lib/signup-otp";

const bodySchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  role: z.enum(["intern", "employer"]).default("intern"),
});

/**
 * Marks an existing account's email verified once its owner has entered a
 * code sent to it. For legacy accounts created before verification was
 * enforced, which otherwise can't sign in.
 */
export async function POST(req: Request) {
  if (!limiters.otpVerify.take(bucketKey(clientIp(req.headers)))) {
    return NextResponse.json({ error: "Too many attempts" }, { status: 429 });
  }
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const { email, role } = parsed.data;

  if (!(await hasVerifiedSignupOtp(req, role, email))) {
    return NextResponse.json({ error: "Enter the code we emailed you first" }, { status: 400 });
  }
  const db = getDb();
  const updated =
    role === "intern"
      ? await db.update(schema.users).set({ emailVerified: true }).where(eq(schema.users.email, email)).returning({ id: schema.users.id })
      : await db
          .update(schema.employers)
          .set({ emailVerified: true })
          .where(eq(schema.employers.companyEmail, email))
          .returning({ id: schema.employers.id });
  // Same answer whether or not the account exists, so this can't probe emails.
  void updated;
  return NextResponse.json({ ok: true });
}
