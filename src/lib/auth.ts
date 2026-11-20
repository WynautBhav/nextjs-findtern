import { cookies, headers } from "next/headers";
import { randomBytes } from "node:crypto";
import { cache } from "react";
import { redirect } from "next/navigation";

import { currentAdminPermissions, loadSessionFacts, passwordVersionCurrent } from "@/lib/account-status";
import { accountDisabledBody, disabledLoginHref, SESSION_EXPIRED_CODE } from "@/lib/account-disabled";
import { accountOnHoldBody, onHoldHref } from "@/lib/account-hold";
import { NextResponse } from "next/server";
import { sessionVerdict } from "@/lib/session-validity";

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
 * `held`: valid session, account frozen by an admin (on hold).
 */
export type SessionState = { session: SessionData; disabled: false; held: false } | { session: null; disabled: boolean; held: boolean };

/**
 * One validity check per request, however many layouts, pages and guards ask (React's per-request cache). The check
 * itself is a single uncached statement (loadSessionFacts), so a deactivation, logout or password change is seen on
 * the very next request on any instance.
 */
export const getSessionState = cache(async (): Promise<SessionState> => readState((await cookies()).get("ft_sid")?.value));

async function readState(raw: string | undefined): Promise<SessionState> {
  const session = readSession(raw);
  if (!session) return { session: null, disabled: false, held: false };
  // One read, shared by the three per-account checks, so they cost one round trip together.
  let facts: ReturnType<typeof loadSessionFacts> | undefined;
  const read = () => (facts ??= loadSessionFacts(session.role, session.uid, session.sid));
  const verdict = await sessionVerdict(session, {
    isRevoked: async () => (await read()).revoked,
    isActive: async () => (await read()).active,
    isPasswordCurrent: async () => passwordVersionCurrent(session.role, session.pv, (await read()).pv),
    isHeld: async () => (await read()).held,
    adminPermissions: currentAdminPermissions,
  });
  return verdict.session ? { session: verdict.session, disabled: false, held: false } : { session: null, disabled: verdict.denied === "disabled", held: verdict.denied === "held" };
}

/**
 * Read the session from the request cookie store (route handlers / RSC).
 */
export async function getSession(): Promise<SessionData | null> {
  return (await getSessionState()).session;
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