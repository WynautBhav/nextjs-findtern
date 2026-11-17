import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { recordAdminAudit } from "@/lib/admin/audit";
import { applyCgpaDecision, withCgpaCorrection } from "@/lib/cgpa-verification-flow";
import { cgpaEmails, cgpaEmployerCopy } from "@/lib/emails/cgpa";
import { initialsOf } from "@/lib/employer-candidates";
import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";
import { notify } from "@/lib/notify";
import { parseOffer } from "@/lib/offer";

/**
 * Admin: decide an intern's CGPA check.
 *
 *   verified   the score on the profile matches the proofs. Nothing about the offers changes.
 *   incorrect  the proofs show another score: it replaces the score on the profile (the claim stays in the check's
 *              history), and every accepted, unpaid offer of the intern gets the correction recorded and the
 *              employer's earlier confirmation cleared, so the employer must confirm the corrected score.
 *
 * Idempotent: the same decision again changes, audits and emails nothing (a double click or a retry is safe); the
 * opposite decision on a decided check is refused with 409. The row is locked for the whole decision.
 */

const body = z.object({
  decision: z.enum(["verified", "incorrect"]),
  correctedScore: z.string().trim().max(10).optional(),
  note: z.string().trim().max(1000).optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ internId: string }> }) {
  const guard = await requireMutation({ req, roles: ["admin"] });
  if (!guard.ok) return guard.response;
  const { internId } = await params;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid payload" }, { status: 400 });
  const input = parsed.data;

  const db = getDb();
  const result = await db.transaction(async (tx) => {
    const [row] = await tx
      .select({ id: schema.internOnboarding.id, extra: schema.internOnboarding.extraData })
      .from(schema.internOnboarding)
      .where(eq(schema.internOnboarding.userId, internId))
      .for("update")
      .limit(1);
    if (!row) return { ok: false as const, status: 404 as const, error: "Candidate not found" };

    const decided = applyCgpaDecision(row.extra, { ...input, by: guard.session.uid });
    if (!decided.ok) return decided;
    if (decided.noop) return { ok: true as const, noop: true as const, status: decided.verification.status, affected: [] as Affected[] };

    const extra = (row.extra ?? {}) as Record<string, unknown>;
    const academics = (extra.academics ?? {}) as Record<string, unknown>;
    const next: Record<string, unknown> = { ...extra, cgpaVerification: decided.verification };
    if (decided.newScore !== null) next.academics = { ...academics, score: decided.newScore };
    await tx.update(schema.internOnboarding).set({ extraData: next, updatedAt: new Date() }).where(eq(schema.internOnboarding.id, row.id));

    const offers = await tx
      .select({ id: schema.proposals.id, employerId: schema.proposals.employerId, offer: schema.proposals.offerDetails, currency: schema.proposals.currency })
      .from(schema.proposals)
      .where(and(eq(schema.proposals.internId, internId), eq(schema.proposals.status, "accepted")))
      .for("update");
    const at = decided.verification.decidedAt ?? new Date().toISOString();
    if (decided.newScore !== null) {
      for (const o of offers) {
        await tx
          .update(schema.proposals)
          .set({ offerDetails: withCgpaCorrection(o.offer, { from: decided.previous.claimedScore, to: decided.newScore, scoreType: decided.previous.scoreType, at }) })
          .where(eq(schema.proposals.id, o.id));
      }
    }

    await recordAdminAudit(
      tx,
      {
        adminId: guard.session.uid,
        action: decided.verification.status === "verified" ? "cgpa.verified" : "cgpa.marked_incorrect",
        targetType: "intern",
        targetId: internId,
        meta: {
          semester: decided.previous.semester,
          scoreType: decided.previous.scoreType,
          before: { status: decided.previous.status, score: decided.previous.claimedScore },
          after: { status: decided.verification.status, score: decided.newScore ?? decided.previous.claimedScore },
          ...(decided.newScore !== null ? { note: input.note ?? "" } : {}),
          offers: offers.length,
        },
      },
      { strict: true },
    );
    const affected: Affected[] = offers.map((o) => ({ id: o.id, employerId: o.employerId, role: parseOffer(o.offer, o.currency).roleTitle || "the role" }));
    return { ok: true as const, noop: false as const, status: decided.verification.status, affected, decided, at };
  });

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  if (result.noop) return NextResponse.json({ ok: true, noop: true, status: result.status });

  await tell(internId, result.decided, result.affected, result.at);
  return NextResponse.json({ ok: true, noop: false, status: result.status });
}

type Affected = { id: string; employerId: string; role: string };

/** After the commit: the intern (email) and each employer waiting on an offer (in-app). Best effort. */
async function tell(internId: string, decided: Extract<ReturnType<typeof applyCgpaDecision>, { ok: true }>, offers: Affected[], at: string) {
  try {
    const db = getDb();
    const [user] = await db
      .select({ f: schema.users.firstName, l: schema.users.lastName })
      .from(schema.users)
      .where(eq(schema.users.id, internId))
      .limit(1);
    const v = decided.verification;
    const incorrect = v.status === "incorrect";
    await notify({
      to: { type: "intern", id: internId },
      type: incorrect ? "cgpa_incorrect" : "cgpa_verified",
      title: incorrect ? "We corrected your CGPA" : "Your CGPA is verified",
      message: incorrect
        ? `Your marksheets show ${v.correctedScore}${v.scoreType === "percentage" ? "%" : " / 10"}. Your profile now carries that score.`
        : "Findtern checked your CGPA against your marksheets and it is correct.",
      data: { semester: v.semester },
      dedupeKey: `cgpa_decision:${internId}:${at}`,
      email: incorrect
        ? cgpaEmails.incorrectForIntern({ internName: user?.f ?? "", claimed: decided.previous.claimedScore, corrected: v.correctedScore ?? "", scoreType: v.scoreType, note: v.note ?? "" })
        : cgpaEmails.verifiedForIntern({ internName: user?.f ?? "", score: v.claimedScore, scoreType: v.scoreType }),
    });
    const candidate = `Candidate ${initialsOf(user?.f ?? "", user?.l ?? "")}`;
    for (const o of offers) {
      const copy = incorrect
        ? cgpaEmployerCopy.incorrect(candidate, o.role, decided.previous.claimedScore, v.correctedScore ?? "", v.scoreType)
        : cgpaEmployerCopy.verified(candidate, o.role);
      await notify({
        to: { type: "employer", id: o.employerId },
        type: incorrect ? "cgpa_incorrect" : "cgpa_verified",
        title: copy.title,
        message: copy.message,
        data: { proposalId: o.id },
        dedupeKey: `cgpa_decision:${o.id}:${at}`,
      });
    }
  } catch (err) {
    console.error("[cgpa-decision] notifications failed", err);
  }
}
