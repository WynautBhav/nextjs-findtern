import { NextResponse } from "next/server";

import { clearAdminStash } from "@/lib/admin/impersonation";
import { withLogout } from "@/lib/auth";
import { sameOriginOrCsrf } from "@/lib/security/session";

export async function POST(req: Request) {
  // Cookie-authenticated, so a forged cross-site POST could sign the user out.
  if (!sameOriginOrCsrf(req.headers, req.url)) {
    return NextResponse.json({ error: "Invalid or missing CSRF token" }, { status: 403 });
  }
  const res = NextResponse.json({ ok: true });
  await clearAdminStash(res);
  return withLogout(res);
}
