import { NextResponse } from "next/server";

import { checkCsrf } from "@/lib/security/session";
import { getSession } from "@/lib/auth";
import type { SessionData } from "@/lib/security/session";
import { canAccess } from "@/lib/security/guards";
import { isTermsCurrent } from "@/lib/account-status";
import { termsBlocksRequest } from "@/lib/terms";
import { allows, requiredPermissions } from "@/lib/admin/permissions";

/**
 * The guard every mutating route handler should run first.
 *
 * Bundles the four checks that were independently missed across the legacy
 * Express routes into one call, so a new handler cannot forget one:
 *
 *  1. Session exists          → else 401
 *  2. Role matches            → else 403
 *  3. CSRF double-submit      → else 403
 *  4. (optionally) record ownership
 *
 * The legacy codebase got 1 and 2 in some routes and skipped them in others;
 * that inconsistency is exactly how an IDOR survived in production. One entry
 * point, applied everywhere.
 */
export async function requireMutation(input: {
  req: Request;
  roles: SessionData["role"][];
  /** When present, the caller must own this record. */
  ownerId?: string | null;
  /** Only the "exit View as" route sets this. Every other write is refused
   *  while an admin is viewing as someone else. */
  allowImpersonated?: boolean;
  /** Only the terms-accept route: it is how a user gets current. */
  allowPendingTerms?: boolean;
}): Promise<
  | { ok: true; session: SessionData }
  | { ok: false; response: NextResponse }
> {
  const { req, roles, ownerId, allowImpersonated, allowPendingTerms } = input;

  if (!checkCsrf(req.headers.get("x-csrf-token"), req.headers.get("cookie"))) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Invalid or missing CSRF token" },
        { status: 403 },
      ),
    };
  }

  const session = await getSession();
  if (!session) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthenticated" }, { status: 401 }),
    };
  }

  if (session.role === "admin" && !allows(session.permissions, requiredPermissions(new URL(req.url).pathname, req.method))) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Your role doesn't allow this" }, { status: 403 }),
    };
  }

  if (session.impersonator && !allowImpersonated) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Read-only: you are viewing as this user. Exit View as to make changes." },
        { status: 403 },
      ),
    };
  }

  if (!roles.includes(session.role)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Insufficient role" }, { status: 403 }),
    };
  }

  // Server-side twin of the terms pop-up: writes wait until the current terms are accepted.
  if (
    !allowPendingTerms &&
    termsBlocksRequest({ role: session.role, method: req.method, impersonating: Boolean(session.impersonator), accepted: await isTermsCurrent(session.role, session.uid) })
  ) {
    return {
      ok: false,
      response: NextResponse.json({ code: "terms_required", error: "Accept the updated terms to continue." }, { status: 403 }),
    };
  }

  if (ownerId !== undefined && !canAccess(session, ownerId)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "You do not have access to this record" },
        { status: 403 },
      ),
    };
  }

  return { ok: true, session };
}