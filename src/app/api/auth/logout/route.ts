import { NextResponse } from "next/server";

import { clearAdminStash } from "@/lib/admin/impersonation";
import { revokeSession } from "@/lib/account-status";
import { withLogout } from "@/lib/auth";
import { readCookie, readSession, sameOriginOrCsrf } from "@/lib/security/session";

export async function POST(req: Request) {
  // Cookie-authenticated, so a forged cross-site POST could sign the user out.
  if (!sameOriginOrCsrf(req.headers, req.url)) {
    return NextResponse.json({ error: "Invalid or missing CSRF token" }, { status: 403 });
  }
  // Revoke the session id first, so a copy of the cookie is dead too, then clear it here.
  const session = readSession(readCookie(req.headers.get("cookie")));
  if (session?.sid) {
    try {
      await revokeSession(session.sid, session.exp);
    } catch (e) {
      console.error("logout: could not record the revoked session", e);
    }
  }
  const res = NextResponse.json({ ok: true });
  await clearAdminStash(res);
  return withLogout(res);
}
