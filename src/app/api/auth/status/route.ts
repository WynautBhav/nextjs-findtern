import { NextResponse } from "next/server";

import { unauthenticatedResponse, getSessionUnfronted } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * "Is this tab's session still good?" for the client watcher (AccountGuard). Read-only and cheap: one session check.
 * 200 {ok} | 403 {code:"ACCOUNT_ON_HOLD"} (frozen) | 403 {code:"ACCOUNT_DISABLED"} (account switched off) | 401 {code:"SESSION_EXPIRED"}.
 */
export async function GET() {
  const headers = { "Cache-Control": "no-store" };
  // /api/auth is outside the proxy, so this route cannot see a path: a frozen intern an admin let keep working stays "ok" here, or the watcher
  // would send them to the on-hold page from the very pages they may use. Every other frozen account is refused below.
  const state = await getSessionUnfronted();
  if (state.session || state.workExempt) return NextResponse.json({ ok: true }, { headers });
  const res = await unauthenticatedResponse();
  res.headers.set("Cache-Control", "no-store");
  return res;
}
