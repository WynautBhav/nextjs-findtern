import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

import { withSession } from "@/lib/auth";
import { stashAdminCookie } from "@/lib/admin/impersonation";
import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";
import { readSession } from "@/lib/security/session";

const bodySchema = z.object({
  targetType: z.enum(["intern", "employer"]),
  targetId: z.string().min(1),
});

/**
 * Start "View as": the admin's browser gets a read-only session as the
 * target user (full names and contacts unmasked), and the admin's own
 * session is stashed for Exit. Every start is written to the audit log.
 */
export async function POST(req: Request) {
  const guard = await requireMutation({ req, roles: ["admin"] });
  if (!guard.ok) return guard.response;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const { targetType, targetId } = parsed.data;

  const db = getDb();
  let email: string | null = null;
  if (targetType === "intern") {
    const [u] = await db.select({ email: schema.users.email }).from(schema.users).where(eq(schema.users.id, targetId)).limit(1);
    email = u?.email ?? null;
  } else {
    const [e] = await db
      .select({ email: schema.employers.companyEmail })
      .from(schema.employers)
      .where(eq(schema.employers.id, targetId))
      .limit(1);
    email = e?.email ?? null;
  }
  if (!email) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const adminToken = (await cookies()).get("ft_sid")?.value;
  const adminSession = readSession(adminToken);
  if (!adminToken || !adminSession) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  await db.insert(schema.adminAuditLog).values({
    adminId: guard.session.uid,
    action: "impersonate.start",
    targetType,
    targetId,
    meta: { adminEmail: guard.session.email, targetEmail: email },
  });

  const res = NextResponse.json({
    ok: true,
    redirect: targetType === "intern" ? "/intern/dashboard" : "/employer/dashboard",
  });
  await stashAdminCookie(res, adminToken, adminSession.exp);
  return withSession(res, {
    uid: targetId,
    role: targetType,
    email,
    impersonator: { uid: guard.session.uid, email: guard.session.email },
  });
}
