import { cookies, headers } from "next/headers";
import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";

import { currentAdminPermissions, isAccountActive, isPasswordVersionCurrent } from "@/lib/account-status";
import { NextResponse } from "next/server";

import {
  createSession,
  readSession,
  clearCookie,
  passwordVersion,
  type Role,
  type SessionData,
} from "@/lib/security/session";

/**
 * Read the session from the request cookie store (route handlers / RSC).
 */
export async function getSession(): Promise<SessionData | null> {
  const store = await cookies();
  const session = readSession(store.get("ft_sid")?.value);
  if (!session) return null;
  if (!(await isAccountActive(session.role, session.uid))) return null;
  if (!(await isPasswordVersionCurrent(session.role, session.uid, session.pv))) return null;
  if (session.role === "admin" && !session.impersonator) {
    const perms = await currentAdminPermissions(session.uid);
    if (perms === null) return null; // admin removed
    if (perms) return { ...session, permissions: perms };
  }
  return session;
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
  const base = role === "admin" ? "/admin/login" : `/login?as=${role}`;
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