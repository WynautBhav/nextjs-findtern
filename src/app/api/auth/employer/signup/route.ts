import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb, schema } from "@/lib/db";
import { hashPassword, isStrongPassword } from "@/lib/security/password";
import { withSession, issueCsrfCookie } from "@/lib/auth";
import { limiters, bucketKey, clientIp } from "@/lib/security/rate-limit";

const bodySchema = z.object({
  name: z.string().min(2),
  companyName: z.string().min(2),
  companyEmail: z.string().trim().toLowerCase().email(),
  phoneNumber: z.string().min(6),
  password: z.string().min(8),
  agreedToTerms: z.literal(true),
});

export async function POST(req: Request) {
  const ip = clientIp(req.headers);
  if (!limiters.signup.take(bucketKey(ip))) {
    return NextResponse.json({ error: "Too many attempts" }, { status: 429 });
  }
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  if (!isStrongPassword(parsed.data.password)) {
    return NextResponse.json({ error: "Weak password" }, { status: 400 });
  }

  const db = getDb();
  const [existing] = await db.select().from(schema.employers).where(eq(schema.employers.companyEmail, parsed.data.companyEmail)).limit(1);
  if (existing) return NextResponse.json({ error: "Email already registered" }, { status: 409 });

  const password = await hashPassword(parsed.data.password);
  const [employer] = await db
    .insert(schema.employers)
    .values({
      name: parsed.data.name,
      companyName: parsed.data.companyName,
      companyEmail: parsed.data.companyEmail,
      phoneNumber: parsed.data.phoneNumber,
      password,
      agreedToTerms: true,
      emailVerified: true,
    })
    .returning();

  const res = NextResponse.json({ employer: { id: employer.id, companyEmail: employer.companyEmail } });
  await issueCsrfCookie(res);
  return withSession(res, { uid: employer.id, role: "employer", email: employer.companyEmail });
}
