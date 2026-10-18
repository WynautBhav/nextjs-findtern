import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { withLogout } from "@/lib/auth";
import { ADMIN_STASH_COOKIE, clearAdminStash, restoreAdminCookie } from "@/lib/admin/impersonation";
import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";
import { readSession } from "@/lib/security/session";

/** Exit "View as": restore the stashed admin session, or sign out. */
export async function POST(req: Request) {
  const guard = await requireMutation({ req, roles: ["intern", "employer"], allowImpersonated: true });
  if (!guard.ok) return guard.response;
  if (!guard.session.impersonator) return NextResponse.json({ error: "Not viewing as anyone" }, { status: 400 });

  const stashed = (await cookies()).get(ADMIN_STASH_COOKIE)?.value;
  const admin = readSession(stashed);

  await getDb()
    .insert(schema.adminAuditLog)
    .values({
      adminId: guard.session.impersonator.uid,
      action: "impersonate.stop",
      targetType: guard.session.role,
      targetId: guard.session.uid,
    });

  // The stash must be a live admin session for the same admin who started.
  if (!stashed || !admin || admin.role !== "admin" || admin.uid !== guard.session.impersonator.uid) {
    const res = NextResponse.json({ ok: true, redirect: "/admin/login" });
    await clearAdminStash(res);
    return withLogout(res);
  }

  const res = NextResponse.json({ ok: true, redirect: "/admin/dashboard" });
  await restoreAdminCookie(res, stashed, admin.exp);
  await clearAdminStash(res);
  return res;
}
