import { NextResponse, type NextRequest } from "next/server";

import { allows, requiredPermissions } from "@/lib/admin/permissions";
import { readSession } from "@/lib/security/session";

/**
 * Admin role permissions, checked on every /admin page (including client
 * navigations) and every /api/admin call. Sessions carry the permissions
 * resolved at login; `*` is super admin.
 */
export function proxy(req: NextRequest) {
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

  if (allows(session.permissions, requiredPermissions(pathname, req.method))) return NextResponse.next();
  return isApi
    ? NextResponse.json({ error: "Your role doesn't allow this" }, { status: 403 })
    : NextResponse.rewrite(new URL("/admin/no-access", req.url));
}

export const config = {
  matcher: ["/admin/((?!login).*)", "/admin", "/api/admin/:path*"],
};
