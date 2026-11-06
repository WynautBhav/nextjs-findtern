import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { forgetAccountStatus, revokeSession } from "@/lib/account-status";
import { recordAdminAudit } from "@/lib/admin/audit";
import { withSession } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";
import { clientIp, limiters, takeAuth } from "@/lib/security/rate-limit";
import { hashPassword, isStrongPassword, verifyPassword, WEAK_PASSWORD_MESSAGE } from "@/lib/security/password";

const bodySchema = z.object({ currentPassword: z.string().min(1), newPassword: z.string() });

/** The signed-in admin changes their own password. */
export async function POST(req: Request) {
  const guard = await requireMutation({ req, roles: ["admin"] });
  if (!guard.ok) return guard.response;
  // Guessing the current password through this form is a login attempt: same limiter as sign-in.
  if (!takeAuth(limiters.login, "admin/password", clientIp(req.headers), guard.session.uid)) {
    return NextResponse.json({ error: "Too many attempts. Try again in a few minutes." }, { status: 429 });
  }
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  if (!isStrongPassword(parsed.data.newPassword)) {
    return NextResponse.json({ error: WEAK_PASSWORD_MESSAGE }, { status: 400 });
  }
  const db = getDb();
  const [admin] = await db.select().from(schema.admins).where(eq(schema.admins.id, guard.session.uid)).limit(1);
  if (!admin || !(await verifyPassword(parsed.data.currentPassword, admin.password))) {
    return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 });
  }
  if (parsed.data.newPassword === parsed.data.currentPassword) {
    return NextResponse.json({ error: "Choose a password you haven't used here before." }, { status: 400 });
  }
  const hashed = await hashPassword(parsed.data.newPassword);
  await db.update(schema.admins).set({ password: hashed }).where(eq(schema.admins.id, admin.id));
  forgetAccountStatus("admin", admin.id); // other sessions carry the old password version and end now
  // No password or hash in the log.
  await recordAdminAudit(db, { adminId: admin.id, action: "account.password_change", targetType: "admin", targetId: admin.id });
  // This session's version no longer matches either: end it and issue a fresh one, so the admin stays signed in.
  try {
    await revokeSession(guard.session.sid, guard.session.exp);
  } catch (e) {
    console.error("password change: could not revoke the old session", e);
  }
  return withSession(NextResponse.json({ ok: true }), { uid: admin.id, role: "admin", email: guard.session.email, permissions: guard.session.permissions, password: hashed });
}
