import { NextResponse } from "next/server";

import { currentAdminPermissions } from "@/lib/account-status";
import { isHttps } from "@/lib/auth";

/**
 * "View as" plumbing. While an admin views as a user, the admin's own signed
 * session token waits in `ft_admin_sid` (HttpOnly) so Exit can restore it
 * without a fresh sign-in. It is only ever read back through `readSession`,
 * so a tampered value cannot become an admin session.
 */

export const ADMIN_STASH_COOKIE = "ft_admin_sid";

export async function stashAdminCookie(res: NextResponse, token: string, expMs: number) {
  res.headers.append(
    "Set-Cookie",
    [
      `${ADMIN_STASH_COOKIE}=${token}`,
      "Path=/",
      "HttpOnly",
      ...((await isHttps()) ? ["Secure"] : []),
      "SameSite=Lax",
      `Expires=${new Date(expMs).toUTCString()}`,
    ].join("; "),
  );
}

export async function clearAdminStash(res: NextResponse) {
  res.headers.append(
    "Set-Cookie",
    [`${ADMIN_STASH_COOKIE}=`, "Path=/", "HttpOnly", ...((await isHttps()) ? ["Secure"] : []), "SameSite=Lax", "Max-Age=0"].join(
      "; ",
    ),
  );
}

/** Restores the stashed admin session cookie verbatim. */
export async function restoreAdminCookie(res: NextResponse, token: string, expMs: number) {
  res.headers.append(
    "Set-Cookie",
    [
      `ft_sid=${token}`,
      "Path=/",
      "HttpOnly",
      ...((await isHttps()) ? ["Secure"] : []),
      "SameSite=Lax",
      `Expires=${new Date(expMs).toUTCString()}`,
    ].join("; "),
  );
}

/**
 * "View as" is super admin only. Read from the role, not the session cookie,
 * so a demoted super admin loses it within the permission cache window.
 */
export async function canViewAs(uid: string | undefined, sessionPermissions: readonly string[] | undefined): Promise<boolean> {
  if (!uid) return false;
  const fresh = await currentAdminPermissions(uid);
  const perms = fresh === undefined ? (sessionPermissions ?? []) : (fresh ?? []);
  return perms.includes("*");
}
