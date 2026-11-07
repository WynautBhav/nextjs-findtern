import { NextResponse } from "next/server";
import { z } from "zod";

import { requireMutation } from "@/lib/guards-mutation";
import { withPgTransaction } from "@/lib/db/pg-tx";
import { driveCodeSecret } from "@/lib/drives/code-derive";
import { RedeemRefused, redeemDriveCode } from "@/lib/drives/redeem-db";
import { promoConsentNotice } from "@/lib/college/promo-consent";
import { markInternPaidFlag } from "@/lib/payments";
import { notify } from "@/lib/notify";
import { bucketKey, clientIp, RateLimiter } from "@/lib/security/rate-limit";

const bodySchema = z.object({
  code: z.string().trim().min(4).max(40),
  declaredAdult: z.boolean(),
});

/** Strong guess limit: 10 tries / 15 min per student and per address (never bypassed). */
const perUser = new RateLimiter(10, 15 * 60_000, { bypassable: false });
const perIp = new RateLimiter(30, 15 * 60_000, { bypassable: false });

/** The student redeems a college-issued code; the college covers the activation fee. */
export async function POST(req: Request) {
  const guard = await requireMutation({ req, roles: ["intern"] });
  if (!guard.ok) return guard.response;
  const uid = guard.session.uid;
  const ip = clientIp(req.headers);
  if (!perUser.take(bucketKey("user", uid)) || !perIp.take(bucketKey(ip))) {
    return NextResponse.json({ error: "Too many attempts. Try again in a few minutes." }, { status: 429 });
  }
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter your college code" }, { status: 400 });

  try {
    const out = await withPgTransaction((client) =>
      redeemDriveCode(client, {
        code: parsed.data.code,
        internId: uid,
        secret: driveCodeSecret(),
        now: new Date(),
        consentNotice: promoConsentNotice("your college"),
        declaredAdult: parsed.data.declaredAdult,
      }),
    );
    await markInternPaidFlag(uid, { orderId: `drive:${out.codeId}`, paymentId: out.paymentId }).catch((e) => console.error("[drive-codes/redeem] paid flag", e));
    await notify({
      to: { type: "intern", id: uid },
      type: "drive_code_redeemed",
      title: "Your college covers your fee",
      message: `${out.collegeName} has covered your AI interview fee.`,
      dedupeKey: `drive-redeem:${out.paymentId}`,
    }).catch((e) => console.error("[drive-codes/redeem] notify", e));
    return NextResponse.json({ ok: true, collegeName: out.collegeName, ...(out.driveTitle ? { driveTitle: out.driveTitle } : {}) });
  } catch (e) {
    if (e instanceof RedeemRefused) return NextResponse.json({ error: e.publicMessage }, { status: e.status });
    console.error("[drive-codes/redeem]", e);
    return NextResponse.json({ error: "Could not redeem the code. Try again shortly." }, { status: 500 });
  }
}
