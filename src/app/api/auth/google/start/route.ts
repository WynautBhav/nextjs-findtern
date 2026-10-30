import { NextResponse } from "next/server";

import { isHttps } from "@/lib/auth";
import { googleAuthUrl, googleConfig, googleLoginEnabled, NONCE_COOKIE, safeNext } from "@/lib/google";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const role = url.searchParams.get("role") === "employer" ? "employer" : "intern";
  const next = safeNext(url.searchParams.get("next"), "");

  const cfg = googleLoginEnabled() ? googleConfig(req) : null;
  if (!cfg) {
    // Back to the page the button was on, with a readable message, instead
    // of a bare JSON error.
    const back = new URL(`/login?as=${role}`, req.url);
    back.searchParams.set("oauthError", "not_configured");
    return NextResponse.redirect(back);
  }

  // The nonce rides in the state and in an httpOnly cookie; the callback
  // requires both to match, so a login can't be started from another site.
  const nonce = crypto.randomUUID();
  const state = Buffer.from(JSON.stringify({ role, next, nonce })).toString("base64url");
  const res = NextResponse.redirect(googleAuthUrl(cfg, state));
  res.cookies.set(NONCE_COOKIE, nonce, {
    httpOnly: true,
    secure: await isHttps(),
    sameSite: "lax",
    // "/" so the legacy /auth/google/callback alias also receives it.
    path: "/",
    maxAge: 600,
  });
  return res;
}
