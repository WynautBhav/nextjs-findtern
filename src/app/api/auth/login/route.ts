import { eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb, schema } from "@/lib/db";
import { withSession, issueCsrfCookie } from "@/lib/auth";
import { verifyPassword, needsRehash, hashPassword } from "@/lib/security/password";
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
  if (!takeAuth(limiters.login, "login", ip, parsed.data.email)) {
    return NextResponse.json({ error: "Too many attempts" }, { status: 429 });
  }

  const db = getDb();
  const [user] = await db
    .select()
    .from(schema.users)
    // Legacy rows may hold mixed-case addresses; the input is lower-cased
    // (INT-35, legacy compared LOWER(email)).
    .where(sql`lower(${schema.users.email}) = ${parsed.data.email}`)
    .limit(1);

  if (!user || !(await verifyPassword(parsed.data.password, user.password))) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }
  if (!user.emailVerified) {
    return NextResponse.json({ error: "Email not verified" }, { status: 403 });
  }
  if (!user.isActive) {
    return NextResponse.json({ error: "Account deactivated" }, { status: 403 });
  }

  let storedPassword = user.password;
  if (needsRehash(user.password)) {
    storedPassword = await hashPassword(parsed.data.password);
    await db
      .update(schema.users)
      .set({ password: storedPassword })
      .where(eq(schema.users.id, user.id));
  }

  const res = NextResponse.json({
    user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName },
  });
  await issueCsrfCookie(res);
  return withSession(res, { uid: user.id, role: "intern", email: user.email, password: storedPassword });
}
