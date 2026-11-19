import { eq, and, isNull, desc } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb, schema } from "@/lib/db";
import { otpVerdict } from "@/lib/otp-check";
import { limiters, clientIp, takeAuth } from "@/lib/security/rate-limit";
import { SIGNUP_OTP_SUBJECTS, attachOtpProof } from "@/lib/signup-otp";

const bodySchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  otp: z.string().length(6),
  subjectType: z.enum(SIGNUP_OTP_SUBJECTS).default("intern"),
});

export async function POST(req: Request) {
  const ip = clientIp(req.headers);
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  if (!takeAuth(limiters.otpVerify, "signup/verify-otp", ip, parsed.data.email)) {
    return NextResponse.json({ error: "Too many attempts" }, { status: 429 });
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

  // Expired rows (and the stand-in for a registered address) go through the same wrong-guess limit as live ones, so the
  // answers are identical whether or not the address has an account.
  if (!row) return NextResponse.json({ error: "Invalid or expired code" }, { status: 400 });
  const verdict = otpVerdict(row, otp, email, (id) => limiters.otpGuess.take(id));
  if (verdict === "locked") {
    await db.update(schema.emailOtps).set({ usedAt: new Date() }).where(eq(schema.emailOtps.id, row.id));
    return NextResponse.json({ error: "Too many wrong codes. Request a new one." }, { status: 429 });
  }
  if (verdict === "invalid") {
    return NextResponse.json({ error: "Invalid or expired code" }, { status: 400 });
  }

  await db
    .update(schema.emailOtps)
    .set({ usedAt: new Date() })
    .where(eq(schema.emailOtps.id, row.id));

  // Binds the verification to this browser: account creation checks it.
  const res = NextResponse.json({ ok: true });
  await attachOtpProof(res, subjectType, email);
  return res;
}
