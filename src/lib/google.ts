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

/**
 * The origin this request was made to, as the browser saw it: the forwarded
 * host and scheme behind nginx or Vercel, else the Host header.
 */
export function requestOrigin(req: Request): string | null {
  const h = req.headers;
  const host = (h.get("x-forwarded-host") ?? h.get("host") ?? "").split(",")[0].trim();
  if (!host || !/^[a-z0-9.:[\]-]+$/i.test(host)) return null;
  let proto = (h.get("x-forwarded-proto") ?? "").split(",")[0].trim().toLowerCase();
  if (proto !== "http" && proto !== "https") {
    try {
      proto = new URL(req.url).protocol.replace(":", "");
    } catch {
      proto = "https";
    }
  }
  return `${proto}://${host}`;
}

/** Absolute origin for links in emails: PUBLIC_ORIGIN, else the request's. */
export function publicOrigin(req?: Request): string {
  const env = process.env.PUBLIC_ORIGIN?.trim();
  if (env) return env.replace(/\/+$/, "");
  return (req && requestOrigin(req)) || "http://localhost:3000";
}

/**
 * The OAuth redirect URI for this request.
 *
 * It has to be on the origin the person is using: the sign-in nonce cookie
 * is set there, and a callback on another host never sees it. Fixed
 * GOOGLE_OAUTH_REDIRECT_URI values (https://findtern.in/...) therefore broke
 * every other deployment with redirect_uri_mismatch or an expired sign-in
 * (bug sheet 7, NC r16 on the Vercel staging). The configured value is used
 * as-is on its own origin; anywhere else the same path is used on the
 * request's origin. That URI still has to be registered on the Google OAuth
 * client (Console > Credentials > Authorized redirect URIs), once per
 * deployment.
 */
function redirectUriFor(configured: string | undefined, defaultPath: string, req?: Request): string {
  const origin = req ? requestOrigin(req) : null;
  if (configured) {
    try {
      const u = new URL(configured);
      if (!origin || u.origin === origin) return configured;
      return `${origin}${u.pathname}`;
    } catch {
      // fall through to the default
    }
  }
  return `${origin ?? publicOrigin()}${defaultPath}`;
}

export function googleConfig(req?: Request): GoogleConfig | null {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  const redirectUri = redirectUriFor(process.env.GOOGLE_OAUTH_REDIRECT_URI?.trim() || undefined, "/api/auth/google/callback", req);
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

/** "Sign in with Google" is offered only with GOOGLE_LOGIN=on, so it stays
 *  off until tested on staging; the Meet calendar uses the same keys regardless. */
export function googleLoginEnabled(): boolean {
  return /^(1|true|on|yes)$/i.test(process.env.GOOGLE_LOGIN ?? "") && googleConfig() !== null;
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

/** Deletes an event made by createMeetEvent. 410 means it is already gone. */
export async function deleteMeetEvent(refreshToken: string, eventId: string): Promise<void> {
  const cfg = calendarConfig();
  if (!cfg) throw new Error("Google is not configured");
  const token = await refreshAccessToken(cfg, refreshToken);
  const calendarId = encodeURIComponent(process.env.MEET_CALENDAR_ID || "primary");
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${encodeURIComponent(eventId)}?sendUpdates=none`,
    { method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok && res.status !== 410) throw new Error(`Google Calendar delete failed (${res.status})`);
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
  // Browsers strip tabs/newlines from URLs, so "/\t/evil.com" would become
  // "//evil.com": refuse control characters as well as "//" and "\\".
  if (typeof next !== "string" || !next.startsWith("/") || next.startsWith("//") || next.includes("\\") || /[\u0000-\u001f\u007f]/.test(next)) {
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
    case "company_email_only":
      return "Employer accounts need a company Google Workspace address. Personal Gmail and other free mailboxes cannot register a company.";
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
