import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { google } from "googleapis";

import { getDb, schema } from "@/lib/db";
import { withSession, issueCsrfCookie } from "@/lib/auth";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const stateRaw = url.searchParams.get("state");
  if (!code || !stateRaw) {
    return NextResponse.redirect(new URL("/login?oauthError=missing_code", req.url));
  }

  let state: { role: string; next: string };
  try {
    state = JSON.parse(Buffer.from(stateRaw, "base64url").toString());
  } catch {
    return NextResponse.redirect(new URL("/login?oauthError=bad_state", req.url));
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGID_OAUTH_REDIRECT_URI ?? process.env.GOOGLE_OAUTH_REDIRECT_URI ?? "http://localhost:3100/api/auth/google/callback";
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(new URL("/login?oauthError=not_configured", req.url));
  }

  const oauth2 = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  const { tokens } = await oauth2.getToken(code);
  oauth2.setCredentials(tokens);
  const oauth2Client = google.oauth2({ version: "v2", auth: oauth2 });
  const { data } = await oauth2Client.userinfo.get();
  const email = data.email?.toLowerCase();
  if (!email) {
    return NextResponse.redirect(new URL("/login?oauthError=no_email", req.url));
  }

  const db = getDb();
  if (state.role === "employer") {
    const [employer] = await db.select().from(schema.employers).where(eq(schema.employers.companyEmail, email)).limit(1);
    if (!employer) {
      return NextResponse.redirect(new URL("/employer/signup?oauthError=no_account", req.url));
    }
    const res = NextResponse.redirect(new URL(state.next || "/employer/dashboard", req.url));
    await issueCsrfCookie(res);
    return withSession(res, { uid: employer.id, role: "employer", email: employer.companyEmail });
  }

  // intern: Gmail-only
  if (!email.endsWith("@gmail.com")) {
    return NextResponse.redirect(new URL("/login?oauthError=gmail_only", req.url));
  }
  const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
  if (!user) {
    return NextResponse.redirect(new URL("/signup?oauthError=no_account", req.url));
  }
  const res = NextResponse.redirect(new URL(state.next || "/intern/dashboard", req.url));
  await issueCsrfCookie(res);
  return withSession(res, { uid: user.id, role: "intern", email: user.email });
}
