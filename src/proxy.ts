import { NextResponse, type NextRequest } from "next/server";

import { allows, firstAllowedPage, requiredPermissions } from "@/lib/admin/permissions";
import { currentAdminPermissions } from "@/lib/account-status";
import { ensureAdminRolesOnce } from "@/lib/admin/roles-seed";
import { readSession } from "@/lib/security/session";

/**
 * Admin role permissions, checked on every /admin page (including client
 * navigations) and every /api/admin call. `*` is super admin.
 *
 * Permissions are re-read from the role (cached ~30s), not taken from the
 * cookie: the cookie holds what the role allowed at login, so a demoted or
 * removed admin kept their old access until they signed out.
 */
export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const session = readSession(req.cookies.get("ft_sid")?.value);
  const isApi = pathname.startsWith("/api/");

  if (!session || session.role !== "admin") {
    // Impersonating admins carry the target's role; their admin token is
    // stashed and only /api/admin/impersonate/stop needs it.
    if (pathname.startsWith("/api/admin/impersonate/stop")) return NextResponse.next();
    return isApi
      ? NextResponse.json({ error: "Unauthenticated" }, { status: 401 })
      : NextResponse.redirect(new URL("/admin/login", req.url));
  }

  // Default roles and one-time grants, once per process (no-op afterwards).
  await ensureAdminRolesOnce();

  // undefined = lookup failed (DB outage); fall back to the login-time list.
  const fresh = session.impersonator ? undefined : await currentAdminPermissions(session.uid);
  if (fresh === null) {
    return isApi
      ? NextResponse.json({ error: "Unauthenticated" }, { status: 401 })
      : NextResponse.redirect(new URL("/admin/login", req.url));
  }
  const permissions = fresh ?? session.permissions;
  if (allows(permissions, requiredPermissions(pathname, req.method))) return NextResponse.next();
  // Login lands on the dashboard; staff without it go to the first page their
  // role opens instead of a "no access" wall.
  if (!isApi && (pathname === "/admin" || pathname === "/admin/dashboard")) {
    const landing = firstAllowedPage(permissions);
    if (landing && landing !== pathname) return NextResponse.redirect(new URL(landing, req.url));
  }
  return isApi
    ? NextResponse.json({ error: "Your role doesn't allow this" }, { status: 403 })
    : NextResponse.rewrite(new URL("/admin/no-access", req.url));
}

export const config = {
  matcher: ["/admin/((?!login).*)", "/admin", "/api/admin/:path*"],
};
