import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb, schema } from "@/lib/db";
import { withSession, issueCsrfCookie } from "@/lib/auth";
import { verifyPassword, needsRehash, hashPassword } from "@/lib/security/password";
import { limiters, bucketKey, clientIp } from "@/lib/security/rate-limit";

const bodySchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

/** Placement officer sign in. Accounts are created by Findtern staff (/admin/colleges). */
export async function POST(req: Request) {
  const ip = clientIp(req.headers);
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter your email and password" }, { status: 400 });
  if (!limiters.login.take(bucketKey(ip, parsed.data.email))) {
    return NextResponse.json({ error: "Too many attempts. Try again in 15 minutes." }, { status: 429 });
  }

  const db = getDb();
  const [row] = await db
    .select({ admin: schema.collegeAdmins, collegeActive: schema.colleges.isActive })
    .from(schema.collegeAdmins)
    .innerJoin(schema.colleges, eq(schema.colleges.id, schema.collegeAdmins.collegeId))
    .where(eq(schema.collegeAdmins.email, parsed.data.email))
    .limit(1);

  // Same answer for unknown email and wrong password, so accounts can't be probed.
  if (!row || !(await verifyPassword(parsed.data.password, row.admin.password))) {
    return NextResponse.json({ error: "That email and password don't match" }, { status: 401 });
  }
  if (!row.admin.isActive || !row.collegeActive) {
    return NextResponse.json({ error: "This account is switched off. Contact Findtern." }, { status: 403 });
  }

  const set: Partial<typeof schema.collegeAdmins.$inferInsert> = { lastLoginAt: new Date() };
  if (needsRehash(row.admin.password)) set.password = await hashPassword(parsed.data.password);
  await db.update(schema.collegeAdmins).set(set).where(eq(schema.collegeAdmins.id, row.admin.id));

  const res = NextResponse.json({ ok: true, redirect: "/college" });
  await issueCsrfCookie(res);
  return withSession(res, { uid: row.admin.id, role: "college", email: row.admin.email });
}
