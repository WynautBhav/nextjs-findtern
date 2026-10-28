import { and, desc, eq, gt, isNotNull } from "drizzle-orm";
import type { NextResponse } from "next/server";

import { isHttps } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { isPersonalEmail } from "@/lib/employer-onboarding";
import { readCookie } from "@/lib/security/session";
import { sign, verify } from "@/lib/security/sign";

/**
 * Signup email verification, shared by the intern and employer flows.
 *
 * `send-otp` stores a hashed code, `verify-otp` stamps `usedAt` and hands the
 * browser a signed proof cookie. The account routes call
 * `hasVerifiedSignupOtp`, which needs both: a code verified inside the window
 * AND the proof cookie for that exact email. Without the cookie, anyone who
 * submitted the signup form for a just-verified address inside the window
 * would get the account with their own password - legacy bound verification
 * to the browser session for the same reason (routes.ts:3753).
 */

export const SIGNUP_OTP_SUBJECTS = ["intern", "employer"] as const;

/**
 * Interns register with a personal mailbox (INT-06; legacy insertUserSchema
 * refused anything else), so the account outlives a college or employer
 * address. googlemail.com is Gmail, which the Google sign-in accepts too.
 */
export function isInternEmail(email: string): boolean {
  return isPersonalEmail(email) || email.trim().toLowerCase().endsWith("@googlemail.com");
}
export const INTERN_EMAIL_MESSAGE =
  "Please use a personal email address (Gmail, Yahoo, Outlook and the like). College and work addresses are not accepted.";
export type SignupOtpSubject = (typeof SIGNUP_OTP_SUBJECTS)[number];

/** How long after verifying the code the account must be created (legacy: 15 min). */
export const VERIFIED_WINDOW_MS = 15 * 60_000;

const PROOF_COOKIE = "ft_otp";
const PROOF_KIND = "signup-otp";

/**
 * Attach the proof that this browser entered the code for `email`. Secure
 * follows the request, as the session cookie does (`isHttps`): set from
 * NODE_ENV, a production build served over plain http marked it Secure, so
 * WebKit dropped it and signup failed right after a verified code (QA-110).
 */
export async function attachOtpProof(res: NextResponse, subject: SignupOtpSubject, email: string): Promise<void> {
  const ttl = VERIFIED_WINDOW_MS / 1000;
  res.cookies.set(PROOF_COOKIE, sign({ k: email, s: subject, d: PROOF_KIND }, ttl), {
    httpOnly: true,
    sameSite: "lax",
    secure: await isHttps(),
    path: "/",
    maxAge: ttl,
  });
}

function hasOtpProof(req: Request, subject: SignupOtpSubject, email: string): boolean {
  const token = readCookie(req.headers.get("cookie"), PROOF_COOKIE);
  if (!token) return false;
  try {
    const p = verify(token);
    return p.d === PROOF_KIND && p.s === subject && p.k === email;
  } catch {
    return false;
  }
}

export async function hasVerifiedSignupOtp(
  req: Request,
  subject: SignupOtpSubject,
  email: string,
): Promise<boolean> {
  if (!hasOtpProof(req, subject, email)) return false;
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
