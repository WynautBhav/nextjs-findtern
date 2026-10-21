import { and, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb, schema } from "@/lib/db";
import { bucketKey, clientIp, limiters } from "@/lib/security/rate-limit";

/**
 * Signup's "is this number taken?" pre-check. It only says whether the number
 * is in use, never by which kind of account: this route is public, so naming
 * the role would let anyone map numbers to interns and employers. The signup
 * POST - rate limited and the real guard - gives the specific reason.
 *
 * `?cc=+44` narrows the match to that country code, the same pair the unique
 * indexes are on, so +1 5551234567 does not clash with +91 5551234567.
 * Without it (older clients) any country code matches, as before.
 */
export async function GET(req: Request, { params }: { params: Promise<{ phone: string }> }) {
  if (!limiters.phoneLookup.take(bucketKey(clientIp(req.headers)))) {
    return NextResponse.json({ error: "Too many attempts" }, { status: 429 });
  }
  const { phone } = await params;
  const digits = phone.replace(/\D/g, "");
  if (!digits) return NextResponse.json({ exists: false });
  const rawCc = new URL(req.url).searchParams.get("cc")?.trim() ?? "";
  const ccDigits = rawCc.replace(/\D/g, "");
  const cc = /^\d{1,4}$/.test(ccDigits) ? `+${ccDigits}` : null;
  // Legacy rows may hold the code without its "+".
  const ccForms = cc ? [cc, cc.slice(1)] : [];
  const db = getDb();
  const [u] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(cc ? and(eq(schema.users.phoneNumber, digits), inArray(schema.users.countryCode, ccForms)) : eq(schema.users.phoneNumber, digits))
    .limit(1);
  const [e] = await db
    .select({ id: schema.employers.id })
    .from(schema.employers)
    .where(cc ? and(eq(schema.employers.phoneNumber, digits), inArray(schema.employers.countryCode, ccForms)) : eq(schema.employers.phoneNumber, digits))
    .limit(1);
  return NextResponse.json({ exists: Boolean(u || e) });
}
