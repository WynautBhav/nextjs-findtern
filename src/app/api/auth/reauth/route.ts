import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

import { forgetAccountStatus } from "@/lib/account-status";
import { checkCsrf, readSession } from "@/lib/security/session";
import { getDb, schema } from "@/lib/db";
import { withSession } from "@/lib/auth";
import { verifyPassword } from "@/lib/security/password";
import { bucketKey, clientIp, limiters } from "@/lib/security/rate-limit";

const bodySchema = z.object({ password: z.string().min(1).max(200) });

/**
 * Keeps this browser signed in after a password change (INT-26).
 *
 * A password change ends every session minted before it, the one that made
 * the change included: the session only records which password version it
 * was issued for. The change-password form then calls this with the new
 * password, which is a sign in in all but name: the browser's session must
 * still carry a valid signature for this account, and the password must
 * match what is stored now. A stolen token on another device cannot do this
 * without the new password, so it stays signed out.
 *
 * An auth route (the documented exception to requireMutation): it does its
 * own CSRF check and does not go through getSession, which would refuse the
 * now-outdated session.
 */
export async function POST(req: Request) {
  if (!limiters.login.take(bucketKey(clientIp(req.headers)))) {
    return NextResponse.json({ error: "Too many attempts" }, { status: 429 });
  }
  if (!checkCsrf(req.headers.get("x-csrf-token"), req.headers.get("cookie"))) {
    return NextResponse.json({ error: "Invalid or missing CSRF token" }, { status: 403 });
  }
  const session = readSession((await cookies()).get("ft_sid")?.value);
  if (!session || session.impersonator) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const db = getDb();
  let stored: { password: string; email: string; active: boolean } | undefined;
  if (session.role === "intern") {
    const [u] = await db
      .select({ password: schema.users.password, email: schema.users.email, active: schema.users.isActive })
      .from(schema.users)
      .where(eq(schema.users.id, session.uid))
      .limit(1);
    stored = u ? { password: u.password, email: u.email, active: Boolean(u.active) } : undefined;
  } else if (session.role === "employer") {
    const [e] = await db
      .select({ password: schema.employers.password, email: schema.employers.companyEmail, active: schema.employers.isActive })
      .from(schema.employers)
      .where(eq(schema.employers.id, session.uid))
      .limit(1);
    stored = e ? { password: e.password, email: e.email, active: Boolean(e.active) } : undefined;
  } else {
    const [a] = await db
      .select({ password: schema.admins.password, email: schema.admins.email })
      .from(schema.admins)
      .where(eq(schema.admins.id, session.uid))
      .limit(1);
    stored = a ? { password: a.password, email: a.email, active: true } : undefined;
  }
  if (!stored || !stored.active || !(await verifyPassword(parsed.data.password, stored.password))) {
    return NextResponse.json({ error: "Sign in again with your new password." }, { status: 401 });
  }

  // The cached version on this process is the old one until it expires.
  forgetAccountStatus(session.role, session.uid);
  const res = NextResponse.json({ ok: true });
  return withSession(res, {
    uid: session.uid,
    role: session.role,
    email: stored.email,
    ...(session.permissions ? { permissions: session.permissions } : {}),
    password: stored.password,
  });
}
