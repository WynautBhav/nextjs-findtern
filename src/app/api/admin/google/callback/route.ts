import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { getDb, schema } from "@/lib/db";
import { CALENDAR_TOKEN_OWNER, calendarConfig, exchangeCode, NONCE_COOKIE } from "@/lib/google";

/** Stores Findtern's calendar refresh token (same row the legacy app uses). */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const back = (q: string) => NextResponse.redirect(new URL(`/admin/settings?google=${q}`, req.url));
  let state: { nonce?: string } = {};
  try {
    state = JSON.parse(Buffer.from(url.searchParams.get("state") ?? "", "base64url").toString());
  } catch {}
  const nonce = (await cookies()).get(NONCE_COOKIE)?.value;
  const code = url.searchParams.get("code");
  const cfg = calendarConfig();
  if (!code || !cfg || !nonce || nonce !== state.nonce) return back("failed");

  try {
    const t = await exchangeCode(cfg, code);
    if (!t.refresh_token) return back("no_refresh_token");
    const values = {
      accessToken: t.access_token,
      refreshToken: t.refresh_token,
      scope: "calendar.events",
      tokenType: "Bearer",
      expiryDate: new Date(Date.now() + t.expires_in * 1000),
      updatedAt: new Date(),
    };
    await getDb()
      .insert(schema.employerGoogleTokens)
      .values({ employerId: CALENDAR_TOKEN_OWNER, ...values })
      .onConflictDoUpdate({ target: schema.employerGoogleTokens.employerId, set: values });
    const res = back("connected");
    res.cookies.delete(NONCE_COOKIE);
    return res;
  } catch {
    return back("failed");
  }
}
