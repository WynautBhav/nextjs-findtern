import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { recordAdminAudit } from "@/lib/admin/audit";
import { getDb, schema } from "@/lib/db";
import { forgetAccountStatus } from "@/lib/account-status";
import { requireMutation } from "@/lib/guards-mutation";
import { sendAccountNotice, shouldNotify } from "@/lib/account-notices";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireMutation({ req, roles: ["admin"] });
  if (!guard.ok) return guard.response;
  const db = getDb();
  const [before] = await db.select({ was: schema.users.isActive, email: schema.users.email, firstName: schema.users.firstName }).from(schema.users).where(eq(schema.users.id, id)).limit(1);
  const updated = await db
    .update(schema.users)
    .set({ isActive: true })
    .where(eq(schema.users.id, id))
    .returning({ id: schema.users.id });
  if (!updated.length) return NextResponse.json({ error: "No candidate account with that id." }, { status: 404 });
  forgetAccountStatus("intern", id);
  const notice = before && shouldNotify(Boolean(before.was), true) ? await sendAccountNotice({ kind: "intern", active: true, name: "", to: [{ email: before.email, name: before.firstName }] }) : null;
  await recordAdminAudit(db, { adminId: guard.session.uid, action: "user.activate", targetType: "intern", targetId: id, meta: { wasActive: Boolean(before?.was), ...(notice ? { notice } : {}) } });
  return NextResponse.json({ ok: true, emailed: notice?.emailed ?? false, emailFailed: notice?.emailFailed ?? false });
}
