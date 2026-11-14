import { NextResponse } from "next/server";
import { z } from "zod";

import { collegeAccountPayBlock } from "@/lib/college/account-state";
import { getDb } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";
import { pendingClaimFor } from "@/lib/drives/claim";
import { driveCodeSecret } from "@/lib/drives/code-derive";
import { RedeemRefused } from "@/lib/drives/redeem-db";
import { redeemForStudent } from "@/lib/drives/redeem-flow";

const bodySchema = z.object({ declaredAdult: z.boolean() });

/** A student the college's sheet was matched to accepts the fee their college paid. No code to type. */
export async function POST(req: Request) {
  const guard = await requireMutation({ req, roles: ["intern"] });
  if (!guard.ok) return guard.response;
  const blocked = await collegeAccountPayBlock(guard.session.uid);
  if (blocked) return blocked;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Confirm you are 18 or older to continue." }, { status: 400 });
  try {
    const claim = await pendingClaimFor(getDb().$client, guard.session.uid, driveCodeSecret());
    if (!claim) return NextResponse.json({ error: "There is nothing from your college to accept." }, { status: 404 });
    const out = await redeemForStudent({ uid: guard.session.uid, code: claim.code, declaredAdult: parsed.data.declaredAdult });
    return NextResponse.json({ ok: true, collegeName: out.collegeName });
  } catch (e) {
    if (e instanceof RedeemRefused) return NextResponse.json({ error: e.publicMessage }, { status: e.status });
    console.error("[drive-codes/claim]", e);
    return NextResponse.json({ error: "Could not accept it. Try again shortly." }, { status: 500 });
  }
}
