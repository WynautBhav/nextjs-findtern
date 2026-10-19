import { eq, and, isNull, desc } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb, schema } from "@/lib/db";
import { verifyOtp, limiters, bucketKey, clientIp } from "@/lib/security/rate-limit";
import { SIGNUP_OTP_SUBJECTS, attachOtpProof } from "@/lib/signup-otp";

const bodySchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  otp: z.string().length(6),
  subjectType: z.enum(SIGNUP_OTP_SUBJECTS).default("intern"),
});

export async function POST(req: Request) {
  const ip = clientIp(req.headers);
  if (!limiters.otpVerify.take(bucketKey(ip))) {
    return NextResponse.json({ error: "Too many attempts" }, { status: 429 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const { email, otp, subjectType } = parsed.data;
  const db = getDb();
  const [row] = await db
    .select()
    .from(schema.emailOtps)
    .where(
      and(
        eq(schema.emailOtps.subjectType, subjectType),
        eq(schema.emailOtps.subjectId, email),
        isNull(schema.emailOtps.usedAt),
      ),
    )
    .orderBy(desc(schema.emailOtps.createdAt))
    .limit(1);

  if (!row || row.expiresAt < new Date() || !verifyOtp(otp, email, row.otpHash)) {
    return NextResponse.json({ error: "Invalid or expired code" }, { status: 400 });
  }

  await db
    .update(schema.emailOtps)
    .set({ usedAt: new Date() })
    .where(eq(schema.emailOtps.id, row.id));

  // Binds the verification to this browser: account creation checks it.
  const res = NextResponse.json({ ok: true });
  attachOtpProof(res, subjectType, email);
  return res;
}
