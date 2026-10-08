import { NextResponse } from "next/server";
import { google } from "googleapis";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const role = url.searchParams.get("role") === "employer" ? "employer" : "intern";
  const next = url.searchParams.get("next") ?? "";

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI ?? "http://localhost:3100/api/auth/google/callback";
  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: "Google OAuth not configured" }, { status: 503 });
  }

  const oauth2 = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  const state = Buffer.from(JSON.stringify({ role, next, nonce: crypto.randomUUID() })).toString("base64url");
  const authUrl = oauth2.generateAuthUrl({
    access_type: "offline",
    scope: ["openid", "email", "profile"],
    state,
    prompt: "consent",
  });
  return NextResponse.redirect(authUrl);
}
