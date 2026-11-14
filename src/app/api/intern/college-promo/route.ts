import { NextResponse } from "next/server";
import { z } from "zod";

import { recordAdminAudit } from "@/lib/admin/audit";
import { maskCode } from "@/lib/college/code";
import { takeCodeAttempt } from "@/lib/college/code-throttle";
import { COLLEGE_PROMO_FAIL } from "@/lib/college/identity-match";
import { redeemCollegePromo } from "@/lib/college/promo-redeem";
import { getDb } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";
import { clientIp } from "@/lib/security/rate-limit";

// Strict: the body carries a code and nothing else, never an account type, a college, an entry or a name.
const bodySchema = z.object({ code: z.string().max(60) }).strict();

/**
 * A college-account intern applies the promo code their college gave them. The server decides everything:
 * it reads the account type, the college and the fee from the database, and pays only when the code AND the
 * intern's name, phone and email match what the college provided. Every refusal that could teach a prober
 * something is one message (COLLEGE_PROMO_FAIL) with one status (400).
 */
export async function POST(req: Request) {
  const guard = await requireMutation({ req, roles: ["intern"] });
  if (!guard.ok) return guard.response;
  const uid = guard.session.uid;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: COLLEGE_PROMO_FAIL }, { status: 400 });

  // Every attempt is charged before the code is looked at (the same budget as typing a college code).
  const ip = clientIp(req.headers);
  const throttle = takeCodeAttempt({ uid, ip });
  if (!throttle.ok) {
    return NextResponse.json(
      { error: `Too many attempts. Try again in ${Math.ceil(throttle.retryAfterSeconds / 60)} minute${throttle.retryAfterSeconds > 60 ? "s" : ""}.` },
      { status: 429, headers: { "Retry-After": String(throttle.retryAfterSeconds) } },
    );
  }

  let r;
  try {
    r = await redeemCollegePromo({ uid, typed: parsed.data.code });
  } catch (e) {
    console.error("[intern/college-promo]", e);
    return NextResponse.json({ error: "Could not apply the code. Try again shortly." }, { status: 500 });
  }

  // The trail keeps who tried, from where and a masked code, never the whole code; `mismatch` is for staff, never the intern.
  await recordAdminAudit(getDb(), {
    adminId: uid,
    action: r.ok ? "college_promo.redeemed" : "college_promo.attempt",
    targetType: "intern",
    targetId: uid,
    meta: r.ok
      ? { outcome: r.alreadyPaid ? "already_paid" : "redeemed", kind: r.kind, codeMask: maskCode(parsed.data.code), ip }
      : { outcome: r.reason, kind: r.kind, codeMask: maskCode(parsed.data.code), ip, ...(r.mismatch ? { mismatch: r.mismatch } : {}) },
  }).catch((e) => console.error("[intern/college-promo] audit", e));

  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ ok: true, alreadyPaid: r.alreadyPaid, collegeName: r.collegeName });
}
