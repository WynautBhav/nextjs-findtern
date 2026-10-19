import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb, schema } from "@/lib/db";
import { limiters, bucketKey, clientIp } from "@/lib/security/rate-limit";
import { isValidPhone } from "@/lib/phone";

const bodySchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().max(80).default(""),
  email: z.string().trim().email().max(200),
  countryCode: z.string().trim().max(6).default("+91"),
  phone: z.string().default("").transform((v) => v.replace(/\D/g, "")).pipe(z.string().max(15)),
  queryType: z.enum(["intern", "general", "hiring"]).default("general"),
  subject: z.string().trim().max(200).default(""),
  message: z.string().trim().min(2).max(5000),
}).refine((d) => !d.phone || isValidPhone(d.countryCode, d.phone), {
  message: "Invalid phone number",
  path: ["phone"],
});

export async function POST(req: Request) {
  const ip = clientIp(req.headers);
  if (!limiters.contact.take(bucketKey(ip))) {
    return NextResponse.json({ error: "Too many attempts" }, { status: 429 });
  }
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const db = getDb();
  const d = parsed.data;
  await db.insert(schema.contactMessages).values({
    firstName: d.firstName,
    lastName: d.lastName || "-",
    email: d.email,
    phone: d.phone || null,
    countryCode: d.phone ? d.countryCode : null,
    subject: d.subject || `Findtern enquiry - ${d.queryType}`,
    message: d.message,
    queryType: d.queryType,
  });
  return NextResponse.json({ ok: true });
}
