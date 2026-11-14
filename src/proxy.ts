import { NextResponse, type NextRequest } from "next/server";

import { allows, firstAllowedPage, requiredPermissions } from "@/lib/admin/permissions";
import { currentAdminPermissions } from "@/lib/account-status";
import { ensureAdminRolesOnce } from "@/lib/admin/roles-seed";
import { readSession, renewSession, type SessionData } from "@/lib/security/session";
import { internUnlockState } from "@/lib/intern-unlock";
import { lockEnabled, lockVerdict, lockedHref, needsLookup } from "@/lib/intern-lock";

/**
 * Runs before every signed-in page and API call. Four jobs:
 *
 * 1. Admin role permissions, checked on every /admin page (including client
 *    navigations) and every /api/admin call. `*` is super admin.
 *    Permissions are re-read from the role (cached ~30s), not taken from the
 *    cookie: the cookie holds what the role allowed at login, so a demoted or
 *    removed admin kept their old access until they signed out.
 *
 * 2. Sign-in redirects that remember the page (INT-07 / EMH-37): opening an
 *    /intern or /employer page signed out goes to that role's sign in with
 *    `?next=<the page>`, and sign in returns there. The path is also passed
 *    to the layouts as `x-ft-path` for the cases only they can decide.
 *
 * 3. The intern payment lock (WP2): until an intern has paid (or is grandfathered:
 *    an offer, an interview or a job), only Home, Documents, Your profile, Settings
 *    and Notifications open. Locked pages redirect to /intern/locked; the APIs those
 *    pages call answer 403, and 503 if the lookup fails (never open). See lib/intern-lock.ts.
 *
 * 4. Sliding sessions (INT-38): an active session is re-issued with a fresh
 *    idle timeout (see renewSession), together with its CSRF cookie, so
 *    nobody is signed out in the middle of their work.
 */
export async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const session = readSession(req.cookies.get("ft_sid")?.value);
  const isApi = pathname.startsWith("/api/");

  if (pathname === "/admin" || pathname.startsWith("/admin/") || pathname.startsWith("/api/admin")) {
    return withRenewal(req, session, await adminGate(req, session, pathname, isApi));
  }

  const role = rolePageFor(pathname);
  if (role) {
    if (!session || session.role !== role) {
      const login = new URL(`/login?as=${role}`, req.url);
      login.searchParams.set("next", `${pathname}${search}`);
      return NextResponse.redirect(login);
    }
    if (role === "intern") {
      const blocked = await internGate(req, session, pathname, false);
      if (blocked) return blocked;
    }
    const headers = new Headers(req.headers);
    headers.set("x-ft-path", `${pathname}${search}`);
    return withRenewal(req, session, NextResponse.next({ request: { headers } }));
  }

  if (isApi && session?.role === "intern") {
    const blocked = await internGate(req, session, pathname, true);
    if (blocked) return blocked;
  }

  return withRenewal(req, session, NextResponse.next());
}

/**
 * The intern payment lock. Null = carry on. Open pages and unlocked APIs never
 * touch the database; the answer is cached only when positive (intern-unlock.ts).
 */
async function internGate(req: NextRequest, session: SessionData, pathname: string, isApi: boolean): Promise<NextResponse | null> {
  const enabled = lockEnabled();
  if (!needsLookup({ pathname, isApi, enabled })) return null;
  const state = await internUnlockState(session.uid);
  switch (lockVerdict({ pathname, isApi, enabled, state })) {
    case "redirect_locked":
      return NextResponse.redirect(new URL(lockedHref(pathname), req.url));
    case "deny_locked":
      return NextResponse.json({ error: "Unlocks after payment. Activate your profile to use this.", code: "intern_locked" }, { status: 403 });
    case "deny_unverified":
      return NextResponse.json({ error: "Could not check your account right now. Try again in a moment." }, { status: 503 });
    default:
      return null;
  }
}

/** The signed-in role a page belongs to; null for public pages. */
function rolePageFor(pathname: string): "intern" | "employer" | null {
  if (pathname === "/intern" || pathname.startsWith("/intern/")) return "intern";
  if (pathname === "/employer" || pathname.startsWith("/employer/")) {
    // The employer sign-in pages live under /employer but are public.
    return /^\/employer\/(login|signup|forgot-password|reset-password|verify-email)(\/|$)/.test(pathname)
      ? null
      : "employer";
  }
  return null;
}

async function adminGate(
  req: NextRequest,
  session: SessionData | null,
  pathname: string,
  isApi: boolean,
): Promise<NextResponse> {
  if (pathname === "/admin/login" || pathname.startsWith("/admin/login/")) return NextResponse.next();
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

/** Re-issue an active session (and its CSRF cookie) with a fresh idle timeout. */
function withRenewal(req: NextRequest, session: SessionData | null, res: NextResponse): NextResponse {
  if (!session || res.status >= 300) return res;
  const proto = (req.headers.get("x-forwarded-proto") ?? "").split(",")[0].trim();
  const secure = proto ? proto === "https" : req.nextUrl.protocol === "https:";
  const renewed = renewSession(session, { secure });
  if (!renewed) return res;
  res.headers.append("Set-Cookie", renewed.cookie);
  const csrf = req.cookies.get("ft_csrf")?.value;
  if (csrf && /^[A-Za-z0-9_-]{16,64}$/.test(csrf)) {
    res.headers.append(
      "Set-Cookie",
      [`ft_csrf=${csrf}`, "Path=/", "SameSite=Lax", `Expires=${new Date(renewed.data.exp).toUTCString()}`, ...(secure ? ["Secure"] : [])].join("; "),
    );
  }
  return res;
}

export const config = {
  matcher: [
    "/admin",
    "/admin/:path*",
    "/intern",
    "/intern/:path*",
    "/employer",
    "/employer/:path*",
    // Every API call except the public and machine-to-machine ones.
    "/api/((?!auth/|webhooks/|cron/|website/|cms-image/|blog-image/|health).*)",
  ],
};
