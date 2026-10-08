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

export async function POST(req: Request) {
  const ip = clientIp(req.headers);
  if (!limiters.login.take(bucketKey(ip))) {
    return NextResponse.json({ error: "Too many attempts" }, { status: 429 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const db = getDb();
  const [employer] = await db
    .select()
    .from(schema.employers)
    .where(eq(schema.employers.companyEmail, parsed.data.email))
    .limit(1);

  if (!employer || !(await verifyPassword(parsed.data.password, employer.password))) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }
  if (!employer.emailVerified) {
    return NextResponse.json({ error: "Email not verified" }, { status: 403 });
  }

  if (needsRehash(employer.password)) {
    const upgraded = await hashPassword(parsed.data.password);
    await db
      .update(schema.employers)
      .set({ password: upgraded })
      .where(eq(schema.employers.id, employer.id));
  }

  const res = NextResponse.json({
    employer: { id: employer.id, email: employer.companyEmail, companyName: employer.companyName },
  });
  await issueCsrfCookie(res);
  return withSession(res, { uid: employer.id, role: "employer", email: employer.companyEmail });
}
