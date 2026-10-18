import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb, schema } from "@/lib/db";
import { sendSmtpMail } from "@/lib/mailer";
import { generateOtp, hashOtp, limiters, bucketKey, clientIp } from "@/lib/security/rate-limit";
import { SIGNUP_OTP_SUBJECTS } from "@/lib/signup-otp";

const bodySchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  subjectType: z.enum(SIGNUP_OTP_SUBJECTS).default("intern"),
});

export async function POST(req: Request) {
  const ip = clientIp(req.headers);
  if (!limiters.otp.take(bucketKey(ip))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }

  const email = parsed.data.email;
  const otp = generateOtp();
  const salt = email;
  const db = getDb();

  await db.insert(schema.emailOtps).values({
    subjectType: parsed.data.subjectType,
    subjectId: email,
    otpHash: hashOtp(otp, salt),
    expiresAt: new Date(Date.now() + 10 * 60_000),
  });

  await sendSmtpMail({
    to: email,
    subject: "Your Findtern verification code",
    text: `Your verification code is ${otp}. It expires in 10 minutes.`,
  });

  return NextResponse.json({ ok: true });
}
