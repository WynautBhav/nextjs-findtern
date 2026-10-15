import { readCookie, readSession, type Role, type SessionData } from "./session.ts";

/**
 * Admin permission keys.
 *
 * The sixteen keys the legacy `admin-roles.tsx` exposed as checkboxes. They
 * are reproduced here rather than imported from the client component so the
 * enforcement point and the editor cannot drift apart.
 *
 * One inconsistency in the legacy list is preserved deliberately: the seeded
 * `admin_roles` rows grant `notifications:read`, but the legacy editor's
 * checkbox grid never listed it. It is kept as a valid key here, so a role
 * that has it does not lose it.
 */
export const ADMIN_PERMISSIONS = [
  "dashboard:read",
  "users:read",
  "reports:read",
  "transactions:read",
  "interns:read",
  "interns:write",
  "companies:read",
  "companies:write",
  "cms:read",
  "cms:write",
  "contact:intern:read",
  "contact:intern:write",
  "contact:employer:read",
  "contact:employer:write",
  "notifications:read",
  "notifications:write",
  "roles:write",
] as const;

export type AdminPermission = (typeof ADMIN_PERMISSIONS)[number];

/** Grants every permission. How `super_admin` is stored. */
export const WILDCARD = "*";

/**
 * Whether a session holds a permission.
 *
 * Fails closed. A session with no `permissions` array, which is every session
 * minted before this existed and every intern or employer session, holds
 * nothing. The previous behaviour was the opposite: login hardcoded
 * `role: "admin"` and nothing checked permissions at all, so an unconfigured
 * admin account was indistinguishable from a super admin.
 */
export function hasPermission(
  session: SessionData | null | undefined,
  permission: AdminPermission | string,
): boolean {
  if (!session || session.role !== "admin") return false;
  const granted = session.permissions;
  if (!Array.isArray(granted) || granted.length === 0) return false;
  return granted.includes(WILDCARD) || granted.includes(permission);
}

/** Whether a session holds any of the listed permissions. */
export function hasAnyPermission(
  session: SessionData | null | undefined,
  permissions: readonly string[],
): boolean {
  return permissions.some((p) => hasPermission(session, p));
}

/**
 * Every permission a session holds, with wildcards expanded.
 *
 * For rendering a nav: a link should appear when the session can actually do
 * something behind it, and the answer has to be a concrete list so it can be
 * written into the link's `data-permission` attribute.
 */
export function expandPermissions(
  session: SessionData | null | undefined,
): string[] {
  if (!session || session.role !== "admin") return [];
  const granted = session.permissions;
  if (!Array.isArray(granted)) return [];
  if (granted.includes(WILDCARD)) return [...ADMIN_PERMISSIONS];
  return granted.filter((p) =>
    (ADMIN_PERMISSIONS as readonly string[]).includes(p),
  );
}

// ── Guards ───────────────────────────────────────────────────────────────

/**
 * The bug this replaces ─────────────────────────────────────────────────
 *
 * Every protected route in the legacy server reads the target user out of
 * the path and trusts it. There is no check that the caller is that user:
 *
 *   GET /api/interns/:internId   routes.ts   → reads req.params.internId
 *   GET /api/employers/:employerId routes.ts  → reads req.params.employerId
 *
 * Those ids are sequential integers. So `GET /api/interns/2` returns intern 2's
 * Aadhaar front image, name, email, phone and college to anyone who asks. The
 * routes are not "missing auth" - they have an auth check, `requireInternAuth`
 * (routes.ts:4441). It just verifies that *a* session exists and then reads
 * whatever id the URL names. The gap is between the two.
 *
 * The employer equivalent additionally returns every applicant's Aadhaar, PAN
 * and bank account details in one response.
 *
 * ── The rule ──────────────────────────────────────────────────────────
 *
 * A session answers "who are you". An ownership check answers "is this yours".
 * Both are required. `canAccess` is the second half, and every handler that
 * takes an id from the URL must call it.
 */

export class ForbiddenError extends Error {
  constructor(message = "Forbidden") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export class UnauthenticatedError extends Error {
  constructor(message = "Unauthenticated") {
    super(message);
    this.name = "UnauthenticatedError";
  }
}

export type GuardResult =
  | { ok: true; session: SessionData }
  | { ok: false; status: 401 | 403; error: string };

function fail(status: 401 | 403, error: string): GuardResult {
  return { ok: false, status, error };
}

/**
 * Require a session of any role.
 *
 * A 401 here is correct and must not be softened into a 403: the caller is
 * unauthenticated, and telling them "forbidden" would confirm the endpoint
 * exists and invite them to keep trying.
 */
export function requireSession(cookieHeader: string | null): GuardResult {
  const session = readSession(readCookie(cookieHeader));
  if (!session) return fail(401, "Unauthenticated");
  return { ok: true, session };
}

/**
 * Ownership check.
 *
 * An admin may read anyone's row. Everyone else may read only their own.
 * Compare as strings and reject empty ids, so `""` or `"0"` cannot be used to
 * fall through to a permissive branch.
 */
export function canAccess(
  session: SessionData,
  targetId: string | number | null | undefined,
): boolean {
  const id = String(targetId ?? "");
  if (!id) return false;
  if (session.role === "admin") return true;
  return session.uid === id;
}

/**
 * The full guard for a route that reads `:userId` from the path.
 *
 * Returns 403 rather than 404 for an existing-but-foreign id and 401 for no
 * session. A 404 here would be marginally better at hiding record existence,
 * but it breaks the client's own error handling and the ids are sequential
 * integers anyway, so secrecy buys nothing.
 */
export function requireOwned(
  cookieHeader: string | null,
  targetId: string | null | undefined,
): GuardResult {
  const authed = requireSession(cookieHeader);
  if (!authed.ok) return authed;
  if (!canAccess(authed.session, targetId)) {
    return fail(403, "You do not have access to this record");
  }
  return authed;
}

/** Require one of a set of roles. */
export function requireRole(
  cookieHeader: string | null,
  roles: Role[],
): GuardResult {
  const authed = requireSession(cookieHeader);
  if (!authed.ok) return authed;
  if (!roles.includes(authed.session.role)) {
    return fail(403, "Insufficient role");
  }
  return authed;
}

/**
 * Require an admin session holding a specific permission.
 *
 * Composed from `requireRole` and `hasPermission` rather than replacing them,
 * so a call site reads as "admin, with this permission" and the two failure
 * modes stay distinguishable: no session is 401, insufficient permission is
 * 403.
 */
export function requirePermission(
  cookieHeader: string | null,
  permission: AdminPermission | string,
): GuardResult {
  const authed = requireRole(cookieHeader, ["admin"]);
  if (!authed.ok) return authed;
  if (!hasPermission(authed.session, permission)) {
    return fail(403, `Missing permission: ${permission}`);
  }
  return authed;
}

/**
 * Cross-tenant check for employer→applicant reads.
 *
 * A given applicant id may be visible to some employers and not others,
 * depending on which of that employer's jobs they applied to. That needs a
 * query, so the shape is passed in rather than looked up here.
 */
export function requireVisibleToEmployer(
  cookieHeader: string | null,
  employerIdFromUrl: string | null | undefined,
  isVisible: (employerId: string) => boolean,
): GuardResult {
  const authed = requireSession(cookieHeader);
  if (!authed.ok) return authed;
  const { session } = authed;

  if (session.role !== "employer" && session.role !== "admin") {
    return fail(403, "Insufficient role");
  }
  if (session.role === "admin") return authed;

  // The employer id in the path must match the session. Without this an
  // employer could name another company's id and let `isVisible` decide.
  if (!employerIdFromUrl || employerIdFromUrl !== session.uid) {
    return fail(403, "You do not have access to this record");
  }
  if (!isVisible(session.uid)) {
    return fail(403, "No application from this applicant");
  }
  return authed;
}