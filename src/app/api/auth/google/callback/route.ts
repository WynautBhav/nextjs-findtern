import { createHash, randomBytes } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { getDb, schema } from "@/lib/db";
import { withSession, issueCsrfCookie } from "@/lib/auth";
import { exchangeCode, fetchProfile, googleConfig, googleLoginEnabled, NONCE_COOKIE, safeNext } from "@/lib/google";
import { isPersonalEmail } from "@/lib/employer-onboarding";
import { attachOtpProof, type SignupOtpSubject } from "@/lib/signup-otp";

function fail(req: Request, path: string, code: string) {
  const to = new URL(path, req.url);
  to.searchParams.set("oauthError", code);
  const res = NextResponse.redirect(to);
  res.cookies.delete({ name: NONCE_COOKIE, path: "/" });
  return res;
}

/** Google's verification of `email`, stored like a redeemed signup code. */
async function recordGoogleVerification(subject: SignupOtpSubject, email: string) {
  await getDb().insert(schema.emailOtps).values({
    subjectType: subject,
    subjectId: email,
    // Not a code anyone can redeem: a hash of random bytes, already used.
    otpHash: createHash("sha256").update(randomBytes(32)).digest("hex"),
    expiresAt: new Date(),
    usedAt: new Date(),
  });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const stateRaw = url.searchParams.get("state");
  // Until the state is decoded the role is unknown; afterwards employer
  // failures go back to the employer door, not the candidate one.
  let loginPath = "/login?as=intern";
  if (!code || !stateRaw) return fail(req, loginPath, "missing_code");

  let state: { role?: string; next?: string; nonce?: string };
  try {
    state = JSON.parse(Buffer.from(stateRaw, "base64url").toString());
  } catch {
    return fail(req, loginPath, "bad_state");
  }
  if (state.role === "employer") loginPath = "/login?as=employer";
  const nonce = (await cookies()).get(NONCE_COOKIE)?.value;
  if (!nonce || nonce !== state.nonce) return fail(req, loginPath, "bad_state");

  const cfg = googleLoginEnabled() ? googleConfig(req) : null;
  if (!cfg) return fail(req, loginPath, "not_configured");

  let email: string | undefined;
  let givenName = "";
  let familyName = "";
  try {
    const tokens = await exchangeCode(cfg, code);
    const profile = await fetchProfile(tokens.access_token);
    if (profile.email_verified) email = profile.email?.toLowerCase();
    givenName = (profile.given_name ?? "").trim();
    familyName = (profile.family_name ?? "").trim();
  } catch {
    return fail(req, loginPath, "google_failed");
  }
  if (!email) return fail(req, loginPath, "no_email");

  const db = getDb();
  if (state.role === "employer") {
    const [employer] = await db
      .select()
      .from(schema.employers)
      .where(sql`lower(${schema.employers.companyEmail}) = ${email}`)
      .limit(1);
    if (!employer) {
      // New company. Same shape as the candidate path below: no account is
      // created here (phone, password and terms are still missing); Google's
      // verification is recorded as a used OTP and the form on
      // /signup?as=employer finishes it through the normal signup API.
      if (isPersonalEmail(email)) return fail(req, "/signup?as=employer", "company_email_only");
      await recordGoogleVerification("employer", email);
      const to = new URL("/signup?as=employer", req.url);
      to.searchParams.set("google", "1");
      to.searchParams.set("email", email);
      const name = [givenName, familyName].filter(Boolean).join(" ");
      if (name) to.searchParams.set("name", name);
      const res = NextResponse.redirect(to);
      res.cookies.delete({ name: NONCE_COOKIE, path: "/" });
      await attachOtpProof(res, "employer", email);
      return res;
    }
    if (!employer.isActive) return fail(req, "/login?as=employer", "inactive");
    // Google has verified the address, so a later password login is not stuck
    // on "verify your email".
    if (!employer.emailVerified) {
      await db.update(schema.employers).set({ emailVerified: true }).where(eq(schema.employers.id, employer.id));
    }
    const res = NextResponse.redirect(new URL(safeNext(state.next, "/employer/dashboard"), req.url));
    res.cookies.delete({ name: NONCE_COOKIE, path: "/" });
    await issueCsrfCookie(res);
    return withSession(res, { uid: employer.id, role: "employer", email: employer.companyEmail, password: employer.password });
  }

  // Interns sign in with Gmail only (legacy rule).
  // googlemail.com is the same Gmail service (legacy routes.ts:3166 accepted both).
  if (!email.endsWith("@gmail.com") && !email.endsWith("@googlemail.com")) return fail(req, "/login?as=intern", "gmail_only");
  // Case-insensitive, like the password sign in (INT-35).
  const [user] = await db.select().from(schema.users).where(sql`lower(${schema.users.email}) = ${email}`).limit(1);
  if (!user) {
    /* New candidate. The account is not created here: `users.phone_number` is
     * NOT NULL and unique per country code, and Google does not give us a
     * phone. (The legacy app wrote "0000000000", which collides from the
     * second Google signup onwards and leaves a fake number in the shared
     * table.) Instead Google's verification of the address is recorded the
     * same way the emailed code is - a used `email_otps` row - and the
     * candidate finishes on /signup with phone, password and terms. The
     * signup API's existing `hasVerifiedSignupOtp` check then accepts it
     * without a second code, inside the same 15-minute window. The proof cookie
     * below binds that to this browser, exactly as entering a code would. */
    await recordGoogleVerification("intern", email);
    const to = new URL("/signup", req.url);
    to.searchParams.set("google", "1");
    to.searchParams.set("email", email);
    if (givenName) to.searchParams.set("firstName", givenName);
    if (familyName) to.searchParams.set("lastName", familyName);
    const res = NextResponse.redirect(to);
    res.cookies.delete({ name: NONCE_COOKIE, path: "/" });
    await attachOtpProof(res, "intern", email);
    return res;
  }
  if (!user.isActive) return fail(req, "/login?as=intern", "inactive");
  // Google has verified the address, so an account stuck on "verify your email" is unblocked.
  if (!user.emailVerified) {
    await db.update(schema.users).set({ emailVerified: true }).where(eq(schema.users.id, user.id));
  }
  const res = NextResponse.redirect(new URL(safeNext(state.next, "/intern/dashboard"), req.url));
  res.cookies.delete({ name: NONCE_COOKIE, path: "/" });
  await issueCsrfCookie(res);
  return withSession(res, { uid: user.id, role: "intern", email: user.email, password: user.password });
}
