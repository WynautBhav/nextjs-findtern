import { and, desc, eq, gt, isNotNull } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";

/**
 * Signup email verification, shared by the intern and employer flows.
 *
 * `send-otp` stores a hashed code, `verify-otp` stamps `usedAt`. The account
 * routes call `hasVerifiedSignupOtp` so a client that skips straight to the
 * create call is refused: `emailVerified: true` is only ever written after a
 * real verification inside this window.
 */

export const SIGNUP_OTP_SUBJECTS = ["intern", "employer"] as const;
export type SignupOtpSubject = (typeof SIGNUP_OTP_SUBJECTS)[number];

/** How long after verifying the code the account must be created. */
const VERIFIED_WINDOW_MS = 30 * 60_000;

export async function hasVerifiedSignupOtp(subject: SignupOtpSubject, email: string): Promise<boolean> {
  const db = getDb();
  const [row] = await db
    .select({ id: schema.emailOtps.id })
    .from(schema.emailOtps)
    .where(
      and(
        eq(schema.emailOtps.subjectType, subject),
        eq(schema.emailOtps.subjectId, email),
        isNotNull(schema.emailOtps.usedAt),
        gt(schema.emailOtps.usedAt, new Date(Date.now() - VERIFIED_WINDOW_MS)),
      ),
    )
    .orderBy(desc(schema.emailOtps.usedAt))
    .limit(1);
  return Boolean(row);
}
