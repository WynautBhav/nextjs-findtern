import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { getDb, schema } from "@/lib/db";
import { withSession, issueCsrfCookie } from "@/lib/auth";
import { exchangeCode, fetchProfile, googleConfig, NONCE_COOKIE, safeNext } from "@/lib/google";

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
  try {
    const tokens = await exchangeCode(cfg, code);
    const profile = await fetchProfile(tokens.access_token);
    if (profile.email_verified) email = profile.email?.toLowerCase();
  } catch {
    return fail(req, "/login", "google_failed");
  }
  if (!email) return fail(req, "/login", "no_email");

  const db = getDb();
  if (state.role === "employer") {
    const [employer] = await db.select().from(schema.employers).where(eq(schema.employers.companyEmail, email)).limit(1);
    if (!employer) return fail(req, "/employer/signup", "no_account");
    if (!employer.isActive) return fail(req, "/employer/login", "inactive");
    const res = NextResponse.redirect(new URL(safeNext(state.next, "/employer/dashboard"), req.url));
    res.cookies.delete(NONCE_COOKIE);
    await issueCsrfCookie(res);
    return withSession(res, { uid: employer.id, role: "employer", email: employer.companyEmail });
  }

  // Interns sign in with Gmail only (legacy rule).
  if (!email.endsWith("@gmail.com")) return fail(req, "/login", "gmail_only");
  const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
  if (!user) return fail(req, "/signup", "no_account");
  if (!user.isActive) return fail(req, "/login", "inactive");
  const res = NextResponse.redirect(new URL(safeNext(state.next, "/intern/dashboard"), req.url));
  res.cookies.delete(NONCE_COOKIE);
  await issueCsrfCookie(res);
  return withSession(res, { uid: user.id, role: "intern", email: user.email });
}
