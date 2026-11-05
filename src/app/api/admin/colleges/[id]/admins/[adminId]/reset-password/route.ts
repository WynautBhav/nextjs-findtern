import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";

import { recordAdminAudit } from "@/lib/admin/audit";
import { forgetAccountStatus } from "@/lib/account-status";
import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";
import { tempPassword } from "@/lib/college/temp-password";
import { hashPassword } from "@/lib/security/password";

/**
 * #29: a placement officer cannot reset their own password; they ask Findtern. This sets a new random one,
 * returns it once, and ends their other sessions (their `pv` no longer matches the new hash).
 * The path is under /api/admin/colleges, so the `companies:write` rule applies (see admin/permissions.ts).
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string; adminId: string }> }) {
  const guard = await requireMutation({ req, roles: ["admin"] });
  if (!guard.ok) return guard.response;
  const { id, adminId } = await ctx.params;
  const db = getDb();

  const password = tempPassword();
  // One transaction: a failed audit insert must not leave the hash changed with the password lost.
  const row = await db.transaction(async (tx) => {
    const [r] = await tx
      .update(schema.collegeAdmins)
      .set({ password: await hashPassword(password) })
      .where(and(eq(schema.collegeAdmins.id, adminId), eq(schema.collegeAdmins.collegeId, id)))
      .returning({ email: schema.collegeAdmins.email });
    if (!r) return null;
    await recordAdminAudit(tx, {
      adminId: guard.session.uid,
      action: "college.password_reset",
      targetType: "college_admin",
      targetId: adminId,
      meta: { collegeId: id, email: r.email }, // never the password
    }, { strict: true });
    return r;
  });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  forgetAccountStatus("college", adminId);
  return NextResponse.json({ email: row.email, password }, { headers: { "Cache-Control": "no-store" } });
}
