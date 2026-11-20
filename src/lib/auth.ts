import { cookies, headers } from "next/headers";
import { randomBytes } from "node:crypto";
import { cache } from "react";
import { redirect } from "next/navigation";

import { currentAdminPermissions, loadSessionFacts, passwordVersionCurrent } from "@/lib/account-status";
import { accountDisabledBody, disabledLoginHref, SESSION_EXPIRED_CODE } from "@/lib/account-disabled";
import { accountOnHoldBody, onHoldHref } from "@/lib/account-hold";
import { NextResponse } from "next/server";
import { sessionVerdict } from "@/lib/session-validity";
import { restrictionVerdict } from "@/lib/account-restriction";
import { runningHireOf } from "@/lib/moderation/work-exempt-db";

import {
  createSession,
  readSession,
  clearCookie,
  passwordVersion,
  type Role,
  type SessionData,
} from "@/lib/security/session";

/**
 * The session behind this request's cookie, or why there is none. `disabled`: valid session, account switched off.
 * `held`: valid session, account frozen by an admin (on hold): RESTRICTED. Frozen accounts sign in fine, but `session` is null for
 * every request except the allowlist in lib/account-restriction.ts, so every page, layout and API that asks for a session refuses them
 * (pages redirect to the on-hold page, APIs answer 403 ACCOUNT_ON_HOLD) with no per-route code. `restricted` is true on the
 * allowlisted requests where a frozen account's session is handed out (the on-hold page, sign-out and, for an intern an admin let
 * keep working, the work surface).
 */
export type SessionState = { session: SessionData; disabled: false; held: false; restricted: boolean; workExempt: false } | { session: null; disabled: boolean; held: boolean; restricted: false; /** Held and let keep working: the status watcher keeps them on the work surface. */ workExempt: boolean };

/** The path the proxy stamped on this request (x-ft-path), query stripped; null when absent, which is never allowlisted. */
async function requestPath(): Promise<string | null> {
  try {
    return (await headers()).get("x-ft-path");
  } catch {
    return null;
  }
}

/**
 * One validity check per request, however many layouts, pages and guards ask (React's per-request cache). The check
 * itself is a single uncached statement (loadSessionFacts), so a deactivation, logout or password change is seen on
 * the very next request on any instance.
 */
export const getSessionState = cache(async (): Promise<SessionState> => readState((await cookies()).get("ft_sid")?.value));

async function readState(raw: string | undefined): Promise<SessionState> {
  const session = readSession(raw);
  if (!session) return { session: null, disabled: false, held: false, restricted: false, workExempt: false };
  // One read, shared by the three per-account checks, so they cost one round trip together.
  let facts: ReturnType<typeof loadSessionFacts> | undefined;
  const read = () => (facts ??= loadSessionFacts(session.role, session.uid, session.sid));
  const verdict = await sessionVerdict(session, {
    isRevoked: async () => (await read()).revoked,
    isActive: async () => (await read()).active,
    isPasswordCurrent: async () => passwordVersionCurrent(session.role, session.pv, (await read()).pv),
    isHeld: async () => (await read()).held,
    // Only asked for a frozen account: the grant AND a paid hire still running (a grant lapses by itself when the hire ends).
    isWorkExempt: async (role, uid) => role === "intern" && (await read()).workExempt && Boolean(await runningHireOf(uid)),
    adminPermissions: currentAdminPermissions,
  });
  if (verdict.session) return { session: verdict.session, disabled: false, held: false, restricted: false, workExempt: false };
  if (verdict.denied === "held") {
    const allowed = restrictionVerdict({ role: session.role, frozen: true, workExempt: verdict.workExempt, path: await requestPath() }) === "allow";
    return allowed ? { session: verdict.restricted, disabled: false, held: false, restricted: true, workExempt: false } : { session: null, disabled: false, held: true, restricted: false, workExempt: verdict.workExempt };
  }
  return { session: null, disabled: verdict.denied === "disabled", held: false, restricted: false, workExempt: false };
}

/**
 * Read the session from the request cookie store (route handlers / RSC).
 */
export async function getSession(): Promise<SessionData | null> {
  return (await getSessionState()).session;
}

/**
 * For the few session routes the proxy does not front (/api/auth/me, status, reauth): there `x-ft-path` is client-supplied and cannot be
 * trusted, so a frozen account's `restricted` session is treated as held. Everything else (pages, /api/*) sits behind the proxy, which
 * overwrites that header on every request.
 */
export async function getSessionUnfronted(): Promise<SessionState> {
  const state = await getSessionState();
  return state.restricted ? { session: null, disabled: false, held: true, restricted: false, workExempt: false } : state;
}

/**
 * The answer for a request that has no usable session: 403 ACCOUNT_DISABLED when the account was switched off (the
 * client signs the person out with an explanation), otherwise 401 SESSION_EXPIRED. Every route's "not signed in"
 * response goes through here so a deactivated account is refused the same way everywhere.
 */
export async function unauthenticatedResponse(error = "Unauthenticated"): Promise<NextResponse> {
  const state = await getSessionState();
  if (state.disabled) return NextResponse.json(accountDisabledBody(), { status: 403 });
  if (state.held) return NextResponse.json(accountOnHoldBody(), { status: 403 });
  return NextResponse.json({ error, code: SESSION_EXPIRED_CODE }, { status: 401 });
}

/** A role's sign-in page for a signed-out redirect; flagged ?reason=disabled when the account was switched off, and the on-hold page when an admin froze it. */
export async function loginRedirectFor(role: "intern" | "employer" | "college"): Promise<string> {
  const state = await getSessionState();
  if (state.held) return onHoldHref(role);
  return state.disabled ? disabledLoginHref(role) : `/login?as=${role}`;
}

/**
 * Page guard for role areas: the session, or a redirect to that role's login.
 * The role layouts already guard, so this mostly removes `session!` from pages.
 */
export async function requireRole(role: "intern" | "employer" | "admin"): Promise<SessionData> {
  const session = await getSession();
  if (!session || session.role !== role) {
    redirect(await loginUrlFor(role));
  }
  return session;
}

/**
 * The sign-in page for a role, carrying the page being opened as `?next=`
 * so sign in returns there (INT-07 / EMH-37). The proxy stamps the path on
 * the request as `x-ft-path`; without it this is the plain login page.
 */
export async function loginUrlFor(role: "intern" | "employer" | "admin"): Promise<string> {
  const base = role === "admin" ? "/admin/login" : await loginRedirectFor(role);
  let path: string | null = null;
  try {
    path = (await headers()).get("x-ft-path");
  } catch {
    // outside a request
  }
  return path && path.startsWith("/") && !path.startsWith("//") ? `${base}${base.includes("?") ? "&" : "?"}next=${encodeURIComponent(path)}` : base;
}

/**
 * Whether this request arrived over TLS.
 *
 * Trusts `x-forwarded-proto` first, because in production this app sits behind
 * a TLS-terminating proxy and the Node process only ever sees plain HTTP. Falls
 * back to NODE_ENV so a missing header in production still produces a Secure
 * cookie.
 */
export async function isHttps(): Promise<boolean> {
  try {
    const h = await headers();
    const proto = h.get("x-forwarded-proto");
    if (proto) return proto.split(",")[0].trim() === "https";
  } catch {
    // Outside Next.js request store (e.g. CLI/tests)
  }
  return process.env.NODE_ENV === "production";
}

/** Attach a fresh session cookie to a response. */
export async function withSession(
  res: NextResponse,
  input: {
    uid: string;
    role: Role;
    email: string;
    permissions?: string[];
    impersonator?: { uid: string; email: string };
    /** The account's stored password (hash). Sessions carry its version, so
     *  a later password change ends them (INT-26). */
    password?: string | null;
  },
): Promise<NextResponse> {
  const { password, ...rest } = input;
  const { cookie } = createSession({
    ...rest,
    ...(password ? { pv: passwordVersion(password) } : {}),
    secure: await isHttps(),
  });
  res.headers.append("Set-Cookie", cookie);
  return res;
}

/** Clear the session cookie on a response. */
export async function withLogout(res: NextResponse): Promise<NextResponse> {
  res.headers.append("Set-Cookie", clearCookie(await isHttps()));
  return res;
}

/**
 * Issue the CSRF cookie and return the token the client must echo back.
 *
 * Called on sign-in. Without it `checkCsrf` can never pass, which is why every
 * upload and every future POST was blocked: the cookie half of the
 * double-submit pair simply did not exist.
 *
 * The cookie is deliberately readable by script (`HttpOnly` omitted) - that is
 * the entire point of a double-submit token. The attack it blocks is a
 * cross-origin POST, where the attacker's page cannot read the value to echo it
 * back.
 */
export async function issueCsrfCookie(res: NextResponse): Promise<string> {
  const token = randomBytes(24).toString("base64url");
  const parts = [
    `ft_csrf=${token}`,
    "Path=/",
    "SameSite=Lax",
    `Expires=${new Date(Date.now() + 12 * 3600_000).toUTCString()}`,
  ];
  if (await isHttps()) parts.push("Secure");
  res.headers.append("Set-Cookie", parts.join("; "));
  return token;
}