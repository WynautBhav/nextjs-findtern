import { NextResponse } from "next/server";

import { unauthenticatedResponse, getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * "Is this tab's session still good?" for the client watcher (AccountGuard). Read-only and cheap: one session check.
 * 200 {ok} | 403 {code:"ACCOUNT_DISABLED"} (account switched off) | 401 {code:"SESSION_EXPIRED"}.
 */
export async function GET() {
  const headers = { "Cache-Control": "no-store" };
  if (await getSession()) return NextResponse.json({ ok: true }, { headers });
  const res = await unauthenticatedResponse();
  res.headers.set("Cache-Control", "no-store");
  return res;
}
