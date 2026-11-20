import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { calendarConfig, exchangeCode, NONCE_COOKIE } from "@/lib/google";
import { saveSlotToken } from "@/lib/google-connections";
import { parseSlotState, slotScopes } from "@/lib/google-connections-core";

/** Stores the refresh token for the slot named in the OAuth state (calendar = the row the legacy app uses). */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const back = (q: string) => NextResponse.redirect(new URL(`/admin/settings?google=${q}`, req.url));
  const state = parseSlotState(url.searchParams.get("state"));
  const nonce = (await cookies()).get(NONCE_COOKIE)?.value;
  const code = url.searchParams.get("code");
  const cfg = calendarConfig();
  if (!code || !cfg || !nonce || nonce !== state.nonce) return back("failed");

  try {
    const t = await exchangeCode(cfg, code);
    if (!t.refresh_token) return back("no_refresh_token");
    await saveSlotToken(state.slot, { ...t, refresh_token: t.refresh_token }, slotScopes(state.slot).join(" "));
    const res = back(state.slot === "drive" ? "drive_connected" : "connected");
    res.cookies.delete(NONCE_COOKIE);
    return res;
  } catch {
    return back("failed");
  }
}
