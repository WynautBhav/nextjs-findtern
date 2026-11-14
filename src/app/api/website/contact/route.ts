import { NextResponse } from "next/server";

import { getDb, schema } from "@/lib/db";
import { limiters, bucketKey, clientIp } from "@/lib/security/rate-limit";
import { contactBodySchema } from "@/lib/contact-schema";

export async function POST(req: Request) {
  const ip = clientIp(req.headers);
  if (!limiters.contact.take(bucketKey(ip))) {
    return NextResponse.json({ error: "Too many attempts" }, { status: 429 });
  }
  const parsed = contactBodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const phoneIssue = parsed.error.issues.find((i) => i.path[0] === "phone");
    return NextResponse.json(
      { error: phoneIssue?.message ?? "Invalid input", ...(phoneIssue ? { field: "phone" } : {}) },
      { status: 400 },
    );
  }

  const db = getDb();
  const d = parsed.data;
  await db.insert(schema.contactMessages).values({
    firstName: d.firstName,
    lastName: d.lastName || "-",
    email: d.email,
    phone: d.phone,
    countryCode: d.countryCode,
    subject: d.subject || `Findtern enquiry - ${d.queryType}`,
    message: d.message,
    queryType: d.queryType,
  });
  return NextResponse.json({ ok: true });
}
