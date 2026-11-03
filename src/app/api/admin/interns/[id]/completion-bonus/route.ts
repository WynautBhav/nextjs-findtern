import { and, eq, isNull, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb, schema } from "@/lib/db";
import { grantCompletionBonus } from "@/lib/admin/ratings";
import { afterRatingsSaved } from "@/lib/admin/score-live";
import { requireMutation } from "@/lib/guards-mutation";
import { notify } from "@/lib/notify";

const bodySchema = z.object({ proposalId: z.string().min(1).max(80) });

/**
 * Staff grant the completion bonus for one successful internship: the hire's
 * proposal is stamped once, and the intern's Findtern Score rises by 1 (max
 * 10). The stamp is claimed with a conditional UPDATE, so two clicks (or two
 * admins) can never grant twice.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireMutation({ req, roles: ["admin"] });
  if (!guard.ok) return guard.response;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const db = getDb();
  const outcome = await db.transaction(async (tx) => {
    const [proposal] = await tx
      .select({ id: schema.proposals.id, status: schema.proposals.status, hiredAt: schema.proposals.hiredAt, bonusAt: schema.proposals.completionBonusAt })
      .from(schema.proposals)
      .where(and(eq(schema.proposals.id, parsed.data.proposalId), eq(schema.proposals.internId, id)))
      .limit(1);
    if (!proposal) return { error: "Hire not found for this intern", status: 404 } as const;
    if (proposal.status !== "hired" && !proposal.hiredAt) return { error: "Only a hired proposal can earn the completion bonus", status: 409 } as const;

    const [onboarding] = await tx
      .select({ id: schema.internOnboarding.id, extraData: schema.internOnboarding.extraData })
      .from(schema.internOnboarding)
      .where(eq(schema.internOnboarding.userId, id))
      .limit(1)
      .for("update");
    if (!onboarding) return { error: "Intern profile not found", status: 404 } as const;

    const claimed = await tx
      .update(schema.proposals)
      .set({ completionBonusAt: sql`now()`, completionBonusBy: guard.session.uid })
      .where(and(eq(schema.proposals.id, proposal.id), isNull(schema.proposals.completionBonusAt)))
      .returning({ id: schema.proposals.id });
    if (claimed.length === 0) return { error: "Completion bonus already granted for this hire", status: 409 } as const;

    const prev = (onboarding.extraData as Record<string, unknown>) ?? {};
    const next = grantCompletionBonus(prev);
    await tx.update(schema.internOnboarding).set({ extraData: next }).where(eq(schema.internOnboarding.id, onboarding.id));
    return { ok: true, prev, next } as const;
  });

  if ("error" in outcome) return NextResponse.json({ error: outcome.error }, { status: outcome.status });

  await afterRatingsSaved(id, outcome.prev, outcome.next);
  await notify({
    to: { type: "intern", id },
    type: "internship_completed",
    title: "Internship completed: +1 Findtern Score",
    message: "Your internship is marked successful. Your Findtern Score went up by 1 (the maximum is 10).",
    data: { proposalId: parsed.data.proposalId, findternScore: outcome.next.findternScore ?? null },
    dedupeKey: `internship_completed:${parsed.data.proposalId}`,
  }).catch(() => undefined);

  return NextResponse.json({ ok: true, findternScore: outcome.next.findternScore ?? null });
}
