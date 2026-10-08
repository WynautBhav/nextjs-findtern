import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb, schema } from "@/lib/db";
import { limiters, bucketKey, clientIp } from "@/lib/security/rate-limit";

const bodySchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  subject: z.string().min(2),
  message: z.string().min(10),
  queryType: z.enum(["intern", "hiring"]).default("intern"),
});

export async function POST(req: Request) {
  const ip = clientIp(req.headers);
  if (!limiters.login.take(bucketKey(ip))) {
    return NextResponse.json({ error: "Too many attempts" }, { status: 429 });
  }
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const db = getDb();
  const [firstName, ...rest] = parsed.data.name.split(" ");
  await db.insert(schema.contactMessages).values({
    firstName,
    lastName: rest.join(" ") || "-",
    email: parsed.data.email,
    subject: parsed.data.subject,
    message: parsed.data.message,
    queryType: parsed.data.queryType,
  });
  return NextResponse.json({ ok: true });
}
