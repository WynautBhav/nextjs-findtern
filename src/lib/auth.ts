import { cookies, headers } from "next/headers";
import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";

import {
  createSession,
  readSession,
  clearCookie,
  type Role,
  type SessionData,
} from "@/lib/security/session";

/**
 * Read the session from the request cookie store (route handlers / RSC).
 */
export async function getSession(): Promise<SessionData | null> {
  const store = await cookies();
  return readSession(store.get("ft_sid")?.value);
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
  input: { uid: string; role: Role; email: string; permissions?: string[] },
): Promise<NextResponse> {
  const { cookie } = createSession({ ...input, secure: await isHttps() });
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
 * The cookie is deliberately readable by script (`HttpOnly` omitted) — that is
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