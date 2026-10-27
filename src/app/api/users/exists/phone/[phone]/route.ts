import { NextResponse } from "next/server";

import { phoneInUseAnywhere } from "@/lib/phone-owner";
import { bucketKey, clientIp, limiters } from "@/lib/security/rate-limit";

/**
 * Signup's "is this number taken?" pre-check. It only says whether the number
 * is in use, never by which kind of account: this route is public, so naming
 * the role would let anyone map numbers to interns and employers. The signup
 * POST - rate limited and the real guard - gives the specific reason.
 *
 * `?cc=+44` is the country code, so +1 5551234567 does not clash with
 * +91 5551234567 (INT-36). Without it the number is read as Indian, which is
 * what the legacy pre-check assumed. Contact numbers count as taken too
 * (INT-05): the same check the signup POST makes.
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
  const cc = /^\d{1,4}$/.test(ccDigits) ? `+${ccDigits}` : "+91";
  return NextResponse.json({ exists: await phoneInUseAnywhere(cc, digits) });
}
