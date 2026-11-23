import { eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { autoJoinInvitedDrives } from "@/lib/college/campus-lock";
import { z } from "zod";

import { accountDisabledBody } from "@/lib/account-disabled";
import { landingAfterLogin } from "@/lib/account-restriction";
import { getDb, schema } from "@/lib/db";
import { withSession, issueCsrfCookie } from "@/lib/auth";
import { verifyPasswordOrDummy, needsRehash, hashPassword } from "@/lib/security/password";
import { limiters, clientIp, takeAuth } from "@/lib/security/rate-limit";

const bodySchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

export async function POST(req: Request) {
  const ip = clientIp(req.headers);
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  if (!takeAuth(limiters.login, "employer/login", ip, parsed.data.email)) {
    return NextResponse.json({ error: "Too many attempts" }, { status: 429 });
  }

  const db = getDb();
  const [employer] = await db
    .select()
    .from(schema.employers)
    // Legacy rows may carry mixed-case addresses; the input is already lower-cased.
    .where(sql`lower(${schema.employers.companyEmail}) = ${parsed.data.email}`)
    .limit(1);

  if (!(await verifyPasswordOrDummy(parsed.data.password, employer?.password)) || !employer) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }
  if (!employer.emailVerified) {
    return NextResponse.json({ error: "Email not verified" }, { status: 403 });
  }

  if (!employer.isActive) {
    return NextResponse.json(accountDisabledBody(), { status: 403 });
  }
  // Frozen by an admin: they CAN sign in (the password was verified above) but the session is restricted to the allowlist (lib/account-restriction.ts).
  const landing = employer.frozenAt ? landingAfterLogin({ role: "employer", frozen: true, workExempt: false }, "") : null;

  let storedPassword = employer.password;
  if (needsRehash(employer.password)) {
    storedPassword = await hashPassword(parsed.data.password);
    await db
      .update(schema.employers)
      .set({ password: storedPassword })
      .where(eq(schema.employers.id, employer.id));
  }

  // A company the placement office invited by this email enters its drive now, link or not (lib/college/campus-lock.ts).
  await autoJoinInvitedDrives(employer.id, employer.companyEmail);
  const res = NextResponse.json({
    employer: { id: employer.id, email: employer.companyEmail, companyName: employer.companyName },
    ...(landing ? { onHold: true, landing } : {}),
  });
  await issueCsrfCookie(res);
  return withSession(res, { uid: employer.id, role: "employer", email: employer.companyEmail, password: storedPassword });
}
