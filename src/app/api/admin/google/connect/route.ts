import { NextResponse } from "next/server";

import { isHttps } from "@/lib/auth";
import { isSessionRevoked } from "@/lib/account-status";
import { requireRole } from "@/lib/security/guards";
import { calendarConfig, googleAuthUrl, NONCE_COOKIE } from "@/lib/google";
import { slotFromParam, slotScopes } from "@/lib/google-connections-core";

/**
 * Super/settings admins connect Findtern's Google accounts. `?slot=calendar` (default) is the Meet/Calendar
 * account (also asks for Drive, so it can serve as Drive's default); `?slot=drive` wires a Drive-only account
 * for the redacted AI reports without touching the calendar one.
 */
export async function GET(req: Request) {
  const guard = requireRole(req.headers.get("cookie"), ["admin"]);
  if (!guard.ok || (await isSessionRevoked(guard.session.sid))) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const cfg = calendarConfig();
  if (!cfg) return NextResponse.json({ error: "Google is not configured" }, { status: 503 });
  const slot = slotFromParam(new URL(req.url).searchParams.get("slot"));
  const nonce = crypto.randomUUID();
  const state = Buffer.from(JSON.stringify({ role: slot, nonce })).toString("base64url");
  const res = NextResponse.redirect(googleAuthUrl(cfg, state, slotScopes(slot), true));
  res.cookies.set(NONCE_COOKIE, nonce, { httpOnly: true, secure: await isHttps(), sameSite: "lax", path: "/", maxAge: 600 });
  return res;
}
