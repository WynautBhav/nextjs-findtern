import { createHash, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { getDb, schema } from "@/lib/db";
import { withSession, issueCsrfCookie } from "@/lib/auth";
import { exchangeCode, fetchProfile, googleConfig, NONCE_COOKIE, safeNext } from "@/lib/google";
import { attachOtpProof } from "@/lib/signup-otp";

function fail(req: Request, path: string, code: string) {
  const res = NextResponse.redirect(new URL(`${path}?oauthError=${code}`, req.url));
  res.cookies.delete(NONCE_COOKIE);
  return res;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const stateRaw = url.searchParams.get("state");
  if (!code || !stateRaw) return fail(req, "/login", "missing_code");

  let state: { role?: string; next?: string; nonce?: string };
  try {
    state = JSON.parse(Buffer.from(stateRaw, "base64url").toString());
  } catch {
    return fail(req, "/login", "bad_state");
  }
  const nonce = (await cookies()).get(NONCE_COOKIE)?.value;
  if (!nonce || nonce !== state.nonce) return fail(req, "/login", "bad_state");

  const cfg = googleConfig();
  if (!cfg) return fail(req, "/login", "not_configured");

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
    return fail(req, "/login", "google_failed");
  }
  if (!email) return fail(req, "/login", "no_email");

  const db = getDb();
  if (state.role === "employer") {
    const [employer] = await db.select().from(schema.employers).where(eq(schema.employers.companyEmail, email)).limit(1);
    if (!employer) return fail(req, "/employer/signup", "no_account");
    if (!employer.isActive) return fail(req, "/employer/login", "inactive");
    // Google has verified the address, so a later password login is not stuck
    // on "verify your email".
    if (!employer.emailVerified) {
      await db.update(schema.employers).set({ emailVerified: true }).where(eq(schema.employers.id, employer.id));
    }
    const res = NextResponse.redirect(new URL(safeNext(state.next, "/employer/dashboard"), req.url));
    res.cookies.delete(NONCE_COOKIE);
    await issueCsrfCookie(res);
    return withSession(res, { uid: employer.id, role: "employer", email: employer.companyEmail });
  }

  // Interns sign in with Gmail only (legacy rule).
  // googlemail.com is the same Gmail service (legacy routes.ts:3166 accepted both).
  if (!email.endsWith("@gmail.com") && !email.endsWith("@googlemail.com")) return fail(req, "/login", "gmail_only");
  const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
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
    await db.insert(schema.emailOtps).values({
      subjectType: "intern",
      subjectId: email,
      // Not a code anyone can redeem: a hash of random bytes, already used.
      otpHash: createHash("sha256").update(randomBytes(32)).digest("hex"),
      expiresAt: new Date(),
      usedAt: new Date(),
    });
    const to = new URL("/signup", req.url);
    to.searchParams.set("google", "1");
    to.searchParams.set("email", email);
    if (givenName) to.searchParams.set("firstName", givenName);
    if (familyName) to.searchParams.set("lastName", familyName);
    const res = NextResponse.redirect(to);
    res.cookies.delete(NONCE_COOKIE);
    attachOtpProof(res, "intern", email);
    return res;
  }
  if (!user.isActive) return fail(req, "/login", "inactive");
  // Google has verified the address, so an account stuck on "verify your email" is unblocked.
  if (!user.emailVerified) {
    await db.update(schema.users).set({ emailVerified: true }).where(eq(schema.users.id, user.id));
  }
  const res = NextResponse.redirect(new URL(safeNext(state.next, "/intern/dashboard"), req.url));
  res.cookies.delete(NONCE_COOKIE);
  await issueCsrfCookie(res);
  return withSession(res, { uid: user.id, role: "intern", email: user.email });
}
