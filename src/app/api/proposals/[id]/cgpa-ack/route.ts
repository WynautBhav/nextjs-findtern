import { and, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { recordAdminAudit } from "@/lib/admin/audit";
import { proposalCgpaGate, readCgpaVerification } from "@/lib/cgpa-verification";
import { employerCgpaConfirmEntry } from "@/lib/cgpa-verification-flow";
import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";
import { PAY_GATE_CODE, PAY_GATE_MESSAGE } from "@/lib/pay-gate";
import { expiryOf } from "@/lib/proposal-expiry";
import { assertProposalActionable } from "@/lib/projects/takedown-guard-server";
import { bucketKey, clientIp, limiters } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

/**
 * The employer's "Confirm and continue" after Findtern corrected a candidate's CGPA. Until it is pressed the offer cannot
 * be paid (pay-gate.ts: cgpa_incorrect_unacked). Writes `offerDetails.cgpaAckAt = now`; the gate reads it as confirmed only
 * if it is not older than the correction (a later correction asks again).
 *
 *  200  confirmed now, or already confirmed (pressing it twice is not an error and changes nothing)
 *  404  no such proposal, or not this employer's (the two are not told apart)
 *  409  the takedown guard; the offer is expired; or there is no correction waiting for a confirmation
 *
 * Audit: the confirmation is written to the audit log in the same transaction as the stamp (B-48), so the two stand or fall together.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireMutation({ req, roles: ["employer"] });
  if (!guard.ok) return guard.response;
  const { session } = guard;
  if (!limiters.generic.take(bucketKey(clientIp(req.headers), session.uid))) {
    return NextResponse.json({ error: "Too many requests. Wait a moment and try again." }, { status: 429 });
  }

  const db = getDb();
  const [owned] = await db
    .select({ id: schema.proposals.id })
    .from(schema.proposals)
    .where(and(eq(schema.proposals.id, id), eq(schema.proposals.employerId, session.uid)))
    .limit(1);
  if (!owned) return NextResponse.json({ error: "Proposal not found" }, { status: 404 });

  const td = await assertProposalActionable(id, session.uid);
  if (!td.ok) return td.response;

  const now = new Date();
  const result = await db.transaction(async (tx) => {
    // The row is locked so a second press, or an admin deciding again, reads this one's result.
    const [p] = await tx
      .select()
      .from(schema.proposals)
      .where(and(eq(schema.proposals.id, id), eq(schema.proposals.employerId, session.uid)))
      .for("update");
    if (!p) return { status: 404 as const, body: { error: "Proposal not found" } };
    const [ob] = await tx
      .select({ extraData: schema.internOnboarding.extraData })
      .from(schema.internOnboarding)
      .where(eq(schema.internOnboarding.userId, p.internId))
      .limit(1);

    if (expiryOf({ status: p.status, hiredAt: p.hiredAt, offerDetails: p.offerDetails }, now).expired) {
      return { status: 409 as const, body: { error: PAY_GATE_MESSAGE.expired, code: PAY_GATE_CODE.expired } };
    }
    const gate = proposalCgpaGate({ status: p.status, extraData: ob?.extraData, offerDetails: p.offerDetails, updatedAt: p.updatedAt }, now);
    if (gate.state === "clear" && readCgpaVerification(ob?.extraData).status === "incorrect") {
      const at = (p.offerDetails as Record<string, unknown> | null)?.cgpaAckAt;
      return { status: 200 as const, body: { ok: true, alreadyConfirmed: true, cgpaAckAt: typeof at === "string" ? at : null } };
    }
    if (gate.state !== "incorrect_unacked") {
      return { status: 409 as const, body: { error: "There is no CGPA correction waiting for your confirmation on this offer.", code: "cgpa_no_correction_pending" } };
    }
    const stamp = now.toISOString();
    // Merged in SQL so a concurrent write to another offerDetails key is not lost.
    await tx
      .update(schema.proposals)
      .set({ offerDetails: sql`coalesce(${schema.proposals.offerDetails}, '{}'::jsonb) || ${JSON.stringify({ cgpaAckAt: stamp })}::jsonb` })
      .where(eq(schema.proposals.id, id));
    const entry = employerCgpaConfirmEntry({ employerId: session.uid, proposalId: id, internId: p.internId, gate, at: stamp });
    await recordAdminAudit(tx, entry, { strict: true });
    return { status: 200 as const, body: { ok: true, alreadyConfirmed: false, cgpaAckAt: stamp } };
  });
  return NextResponse.json(result.body, { status: result.status });
}
