/**
 * Google OAuth over plain fetch (replaces the 239 MB googleapis package).
 * Sign-in only needs three calls: build the consent URL, swap the code for
 * tokens, read the profile.
 */

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";

/** httpOnly cookie holding the sign-in nonce between start and callback. */
export const NONCE_COOKIE = "ft_goauth";

export type GoogleConfig = { clientId: string; clientSecret: string; redirectUri: string };

export function googleConfig(): GoogleConfig | null {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  const redirectUri =
    process.env.GOOGLE_OAUTH_REDIRECT_URI ??
    `${process.env.PUBLIC_ORIGIN ?? "http://localhost:3000"}/api/auth/google/callback`;
  return { clientId, clientSecret, redirectUri };
}

export function googleAuthUrl(cfg: GoogleConfig, state: string, scopes = ["openid", "email", "profile"], offline = false) {
  const url = new URL(AUTH_URL);
  url.search = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: "code",
    scope: scopes.join(" "),
    state,
    ...(offline ? { access_type: "offline", prompt: "consent" } : { prompt: "select_account" }),
  }).toString();
  return url.toString();
}

/** Findtern's own calendar (Meet links): legacy redirect URI and token owner. */
export function calendarConfig(): GoogleConfig | null {
  const base = googleConfig();
  if (!base) return null;
  return {
    ...base,
    redirectUri:
      process.env.FINDTERN_GOOGLE_OAUTH_REDIRECT_URI ??
      `${process.env.PUBLIC_ORIGIN ?? "http://localhost:3000"}/google/callback`,
  };
}
export const CALENDAR_TOKEN_OWNER = process.env.FINDTERN_GOOGLE_TOKEN_OWNER_ID || "admin";
export const CALENDAR_SCOPES = ["https://www.googleapis.com/auth/calendar.events"];

/**
 * Creates an event with a Google Meet link on Findtern's calendar and
 * invites the attendees. Returns the Meet URL.
 */
export async function createMeetEvent(
  refreshToken: string,
  e: { summary: string; description: string; start: Date; end: Date; timezone: string; attendees: string[] },
): Promise<{ meetUrl: string; eventId: string }> {
  const cfg = calendarConfig();
  if (!cfg) throw new Error("Google is not configured");
  const token = await refreshAccessToken(cfg, refreshToken);
  const calendarId = encodeURIComponent(process.env.MEET_CALENDAR_ID || "primary");
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events?conferenceDataVersion=1&sendUpdates=all`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        summary: e.summary,
        description: e.description,
        start: { dateTime: e.start.toISOString(), timeZone: e.timezone },
        end: { dateTime: e.end.toISOString(), timeZone: e.timezone },
        attendees: e.attendees.map((email) => ({ email })),
        guestsCanSeeOtherGuests: false,
        conferenceData: { createRequest: { requestId: crypto.randomUUID(), conferenceSolutionKey: { type: "hangoutsMeet" } } },
      }),
    },
  );
  const body = (await res.json().catch(() => ({}))) as {
    id?: string;
    hangoutLink?: string;
    conferenceData?: { entryPoints?: { entryPointType?: string; uri?: string }[] };
  };
  const meetUrl = body.hangoutLink ?? body.conferenceData?.entryPoints?.find((p) => p.entryPointType === "video")?.uri;
  if (!res.ok || !meetUrl || !body.id) throw new Error(`Google Calendar event failed (${res.status})`);
  return { meetUrl, eventId: body.id };
}

export type GoogleTokens = { access_token: string; refresh_token?: string; expires_in: number; id_token?: string };

export async function exchangeCode(cfg: GoogleConfig, code: string): Promise<GoogleTokens> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      redirect_uri: cfg.redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`Google token exchange failed (${res.status})`);
  return res.json();
}

/** Mint a fresh access token from a stored refresh token (Calendar/Meet). */
export async function refreshAccessToken(cfg: GoogleConfig, refreshToken: string): Promise<string> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Google token refresh failed (${res.status})`);
  return ((await res.json()) as GoogleTokens).access_token;
}

export type GoogleProfile = {
  email?: string;
  email_verified?: boolean;
  given_name?: string;
  family_name?: string;
  picture?: string;
};

export async function fetchProfile(accessToken: string): Promise<GoogleProfile> {
  const res = await fetch(USERINFO_URL, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`Google userinfo failed (${res.status})`);
  return res.json();
}

/**
 * Only same-site relative paths survive as a post-login destination;
 * anything else (absolute URLs, protocol-relative `//evil`, backslashes)
 * falls back.
 */
export function safeNext(next: unknown, fallback: string): string {
  if (typeof next !== "string" || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) {
    return fallback;
  }
  return next;
}

/** What the sign-in pages say for each `?oauthError=` the callback sends back. */
export function oauthErrorMessage(code: string | undefined): string | null {
  switch (code) {
    case undefined:
    case "":
      return null;
    case "gmail_only":
      return "Use a personal Gmail address to continue with Google. Work and college accounts are not accepted.";
    case "no_email":
      return "Google did not share a verified email address for that account. Try another account, or sign up with your email.";
    case "inactive":
      return "This account has been deactivated. Contact support if you think that is a mistake.";
    case "not_configured":
      return "Google sign-in is not available right now. Use your email and password instead.";
    case "bad_state":
    case "missing_code":
      return "The Google sign-in expired or was interrupted. Please try again.";
    case "no_account":
      return "There is no account for that Google address yet. Create one below.";
    default:
      return "Google sign-in did not complete. Please try again.";
  }
}
