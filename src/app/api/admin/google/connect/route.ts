import { NextResponse } from "next/server";

import { isHttps } from "@/lib/auth";
import { isSessionRevoked } from "@/lib/account-status";
import { requireRole } from "@/lib/security/guards";
import { FINDTERN_GOOGLE_SCOPES, calendarConfig, googleAuthUrl, NONCE_COOKIE } from "@/lib/google";

/** Super/settings admins connect Findtern's Google account: Calendar for Meet links, Drive for the redacted AI reports. */
export async function GET(req: Request) {
  const guard = requireRole(req.headers.get("cookie"), ["admin"]);
  if (!guard.ok || (await isSessionRevoked(guard.session.sid))) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const cfg = calendarConfig();
  if (!cfg) return NextResponse.json({ error: "Google is not configured" }, { status: 503 });
  const nonce = crypto.randomUUID();
  const state = Buffer.from(JSON.stringify({ role: "calendar", nonce })).toString("base64url");
  const res = NextResponse.redirect(googleAuthUrl(cfg, state, FINDTERN_GOOGLE_SCOPES, true));
  res.cookies.set(NONCE_COOKIE, nonce, { httpOnly: true, secure: await isHttps(), sameSite: "lax", path: "/", maxAge: 600 });
  return res;
}
