import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Sessions.
 *
 * ── What was wrong ────────────────────────────────────────────────────
 *
 * `server/index.ts:110` installs express-session with
 * `app.set('trust proxy', 1)` and, in production, no `SESSION_SECRET` at all:
 *
 *   if (!process.env.SESSION_SECRET && process.env.NODE_ENV === 'production') {
 *     console.error('CRITICAL: SESSION_SECRET not set');
 *   }
 *
 * It logs a line and carries on. express-session then generates a random
 * secret per process, so every deploy silently invalidates every session, and
 * a multi-instance deployment cannot share sessions at all.
 *
 * The cookie itself is also weak - it is not `secure` in production and the
 * defaults leave `sameSite` unset.
 *
 * ── What this module does ─────────────────────────────────────────────
 *
 * A self-contained signed session, DB-agnostic. It is deliberately not a
 * dependency on express-session or on a session table, because the data layer
 * is still being chosen. `SessionStore` below is the one interface to
 * implement against whichever store you end up with; everything above it is
 * already written.
 */

export type Role = "intern" | "employer" | "admin";

export type SessionData = {
  /** Subject id - the user row's id, never a client-supplied string. */
  uid: string;
  role: Role;
  /** Email, so the UI can greet without a second round trip. */
  email: string;
  /** Epoch ms. */
  exp: number;
  /** Session id, for revocation. */
  sid: string;
  /**
   * Admin permission keys, resolved at sign in from `admin_roles`.
   *
   * Absent for interns and employers. `"*"` means every permission, which is
   * how `super_admin` is stored.
   *
   * The legacy app resolved these at login and put them on the session
   * (`server/routes.ts:4310`). This port dropped them, which left the
   * `admin_roles` table populated and entirely inert: three executives with
   * deliberately narrow roles had full access. Resolving them once here keeps
   * the enforcement point in the layout and the guards rather than scattered
   * across every handler.
   */
  permissions?: string[];
  /**
   * Set when an admin is viewing the site as this user ("View as"). The
   * session is read-only: `requireMutation` refuses every write while it is
   * present, and redaction lifts so the admin sees full names and contacts.
   */
  impersonator?: { uid: string; email: string };
};

/** "View as" sessions are short: an admin forgets to exit, not a user. */
export const IMPERSONATION_TTL_MS = 1000 * 60 * 60;

const TTL_MS = 1000 * 60 * 60 * 12; // 12h, matching the legacy maxAge

function secret(): Buffer {
  const s = process.env.SESSION_SECRET ?? process.env.SIGNING_SECRET;
  if (!s || s.length < 32) {
    throw new Error("SESSION_SECRET must be set to at least 32 characters");
  }
  return Buffer.from(s, "utf8");
}

export function createSession(input: {
  uid: string;
  role: Role;
  email: string;
  /** Admin permission keys. Omitted for non admin sessions. */
  permissions?: string[];
  /** The admin behind a "View as" session. */
  impersonator?: { uid: string; email: string };
  ttlMs?: number;
  now?: number;
  /**
   * Whether the connection is HTTPS. Pass the value resolved from the request
   * (`x-forwarded-proto`, or `false` for the dev server). Left undefined it
   * falls back to NODE_ENV.
   */
  secure?: boolean;
}): { cookie: string; data: SessionData } {
  const now = input.now ?? Date.now();
  const data: SessionData = {
    uid: input.uid,
    role: input.role,
    email: input.email,
    ...(input.permissions ? { permissions: input.permissions } : {}),
    ...(input.impersonator ? { impersonator: input.impersonator } : {}),
    exp: now + (input.ttlMs ?? (input.impersonator ? IMPERSONATION_TTL_MS : TTL_MS)),
    sid: randomBytes(12).toString("base64url"),
  };

  const body = Buffer.from(JSON.stringify(data)).toString("base64url");
  const sig = createHmac("sha256", secret()).update(body).digest("base64url");
  const token = `${body}.${sig}`;

  return { cookie: serializeCookie(token, data.exp, input.secure), data };
}

/** Verify a token and return its payload, or null. Never throws. */
export function readSession(
  token: string | undefined | null,
  now = Date.now(),
): SessionData | null {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;

  const body = token.slice(0, dot);
  const sig = Buffer.from(token.slice(dot + 1), "base64url");
  const expected = createHmac("sha256", secret()).update(body).digest();

  if (sig.length !== expected.length || !timingSafeEqual(sig, expected)) return null;

  let data: SessionData;
  try {
    data = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  if (typeof data.exp !== "number" || data.exp <= now) return null;
  if (typeof data.uid !== "string" || !data.uid) return null;
  if (!["intern", "employer", "admin"].includes(data.role)) return null;

  // Validate the shape when present. A tampered payload cannot get here
  // because the HMAC above covers the whole body, but a session minted by an
  // older build, or by a future one with a different shape, must not be able
  // to smuggle a non array into the permission check.
  if (data.permissions !== undefined) {
    if (!Array.isArray(data.permissions)) return null;
    if (!data.permissions.every((p) => typeof p === "string")) return null;
  }
  if (data.impersonator !== undefined) {
    const imp = data.impersonator as unknown as Record<string, unknown>;
    if (!imp || typeof imp.uid !== "string" || typeof imp.email !== "string") return null;
    if (data.role === "admin") return null;
  }

  return data;
}

/**
 * Cookie attributes.
 *
 * `httpOnly` keeps it away from JS, so an XSS bug cannot steal the session.
 * `sameSite=lax` blocks cross-site POSTs, which is the CSRF defence that does
 * not depend on remembering to add a token to every form. `secure` is set
 * unconditionally, so a cookie can never be sent in the clear.
 */
/**
 * Whether this response is being delivered over TLS.
 *
 * Passed in rather than sniffed from globals: the correct answer depends on
 * the request, and a module-level guess is how the original bug happened. An
 * unrecognised environment should default to secure, so the caller resolves
 * `undefined` to `true` in production.
 */
function isSecure(secure: boolean | undefined): boolean {
  if (secure !== undefined) return secure;
  return process.env.NODE_ENV === "production";
}

function serializeCookie(token: string, exp: number, secure: boolean | undefined): string {
  return [
    `ft_sid=${token}`,
    "Path=/",
    "HttpOnly",
    // `Secure` is required over TLS and *must* be omitted over plain HTTP.
    //
    // Setting it unconditionally - which this module did - means that on
    // `http://localhost` the browser accepts the response and then silently
    // discards the cookie. Sign-in appears to succeed (200, correct body) and
    // the very next request is unauthenticated, so the user is bounced back to
    // the login page. It is indistinguishable from a wrong password, which is
    // what made it expensive to find.
    ...(isSecure(secure) ? ["Secure"] : []),
    "SameSite=Lax",
    `Expires=${new Date(exp).toUTCString()}`,
  ].join("; ");
}

export function clearCookie(secure?: boolean): string {
  return [
    "ft_sid=; Path=/; HttpOnly",
    ...(isSecure(secure) ? ["Secure"] : []),
    "SameSite=Lax",
    "Max-Age=0",
  ].join("; ");
}

/**
 * Build a `Cookie` request header containing a session.
 *
 * Exists because of a genuine footgun: `readCookie()` returns the token
 * *value*, but every guard takes a full `Cookie` *header*. Passing the value
 * where the header is expected yields a silent 401 rather than an error, which
 * is a bad way to find out.
 *
 * @example
 *   fetch(url, { headers: { cookie: sessionRequestHeader(uid, "intern", email) } })
 */
export function sessionRequestHeader(
  uid: string,
  role: Role,
  email: string,
): string {
  return createSession({ uid, role, email }).cookie.split(";")[0];
}

export function readCookie(header: string | null, name = "ft_sid"): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) {
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
  }
  return null;
}

/**
 * The one interface a real store must satisfy.
 *
 * Implementing this against Postgres/Redis is what makes logout-on-another-
 * device and admin revocation possible. Until then the signed token is
 * self-contained and revocation falls back to the short TTL.
 */
export interface SessionStore {
  put(sid: string, data: SessionData): Promise<void>;
  get(sid: string): Promise<SessionData | null>;
  revoke(sid: string): Promise<void>;
  revokeAllFor(uid: string): Promise<void>;
}

/**
 * Double-submit CSRF token.
 *
 * Returned in a readable cookie and required in a header on every mutating
 * request. Unlike the session token this is not a secret from the page - the
 * point is only that an attacker's origin cannot read the value to echo it
 * back.
 */
export function csrfToken(): { cookie: string; header: string } {
  const token = randomBytes(24).toString("base64url");
  return {
    cookie: `ft_csrf=${token}; Path=/; Secure; SameSite=Lax`,
    header: token,
  };
}

export function checkCsrf(header: string | null, cookieHeader: string | null): boolean {
  const fromHeader = header;
  const fromCookie = readCookie(cookieHeader, "ft_csrf");
  if (!fromHeader || !fromCookie) return false;
  const a = Buffer.from(fromHeader);
  const b = Buffer.from(fromCookie);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
