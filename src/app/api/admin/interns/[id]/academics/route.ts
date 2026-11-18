import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { recordAdminAudit } from "@/lib/admin/audit";
import { EDIT_FIELDS, academicsProblems, firstProblem, mergeAcademics, readAcademicsValues, LEVEL_LABELS, type AcademicsEdit } from "@/lib/admin/academics-edit";
import { applyAdminScoreEdit, withCgpaCorrection } from "@/lib/cgpa-verification-flow";
import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";

/**
 * Admin: edit an intern's education (level, degree, branch, institution, status, years, score type and score).
 *
 * Same rules as the intern's own Academics step (lib/admin/academics-edit.ts runs its validation). Send only the
 * fields that changed; a field left out is not touched, and `certifications`, `professionalCourses`, uploads and
 * every other key in `extra_data` are carried over. Read, merge and write happen under a row lock on the
 * candidate's onboarding row, with the audit row in the same transaction (a failed audit write rolls the edit back).
 *
 * A changed score also keeps the CGPA machinery consistent: an existing check records the admin's number as its
 * correction (see applyAdminScoreEdit), and every accepted offer notes the correction and clears the employer's
 * earlier confirmation of the old number. Offers are priced on the Findtern Score, never on CGPA, so no price
 * moves. Permission: `interns:write`, enforced by the proxy and by requireMutation through the
 * `/api/admin/interns/` rule in lib/admin/permissions.ts.
 */

const str = (max: number) => z.string().max(max);
const bodySchema = z
  .object({
    qualificationLevel: z.enum(LEVEL_LABELS as [string, ...string[]]).optional(),
    degree: str(120).optional(),
    branch: str(120).optional(),
    institution: str(160).optional(),
    status: z.enum(["Completed", "Pursuing"]).optional(),
    startYear: str(4).optional(),
    yearOfGraduation: str(4).optional(),
    scoreType: z.enum(["cgpa", "percentage", ""]).optional(),
    score: str(10).optional(),
  })
  .strict();

type Outcome =
  | { ok: true; changed: string[]; offers: number }
  | { ok: false; status: 400 | 404 | 409; error: string; fields?: Record<string, string> };

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireMutation({ req, roles: ["admin"] });
  if (!guard.ok) return guard.response;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const edit = parsed.data as AcademicsEdit;
  if (!EDIT_FIELDS.some((f) => edit[f] !== undefined)) return NextResponse.json({ error: "Nothing to change" }, { status: 400 });

  const db = getDb();
  const outcome: Outcome = await db.transaction(async (tx): Promise<Outcome> => {
    const [row] = await tx
      .select({ id: schema.internOnboarding.id, extra: schema.internOnboarding.extraData })
      .from(schema.internOnboarding)
      .where(eq(schema.internOnboarding.userId, id))
      .limit(1)
      .for("update");
    if (!row) return { ok: false, status: 404, error: "Not found" };
    const extra = (row.extra ?? {}) as Record<string, unknown>;

    const problems = academicsProblems(readAcademicsValues(extra), edit);
    const problem = firstProblem(problems);
    if (problem) return { ok: false, status: 400, error: problem, fields: problems as Record<string, string> };

    const merged = mergeAcademics(extra, edit);
    const changed = Object.keys(merged.changes);
    if (changed.length === 0) return { ok: true, changed, offers: 0 };

    const next: Record<string, unknown> = { ...extra, academics: merged.academics };
    let offers = 0;
    const scoreChanged = "score" in merged.changes || "scoreType" in merged.changes;
    if (scoreChanged) {
      const now = new Date();
      const result = applyAdminScoreEdit(extra, {
        previousScore: merged.before.score,
        score: merged.after.score,
        scoreType: merged.after.scoreType,
        by: guard.session.uid,
        now,
      });
      if (!result.ok) return result;
      if (result.verification) next.cgpaVerification = result.verification;
      // A first score (nothing stored before) corrects nothing; a changed one is recorded on every accepted offer.
      if (result.scoreChanged && result.previousScore) {
        const accepted = await tx
          .select({ id: schema.proposals.id, offer: schema.proposals.offerDetails })
          .from(schema.proposals)
          .where(and(eq(schema.proposals.internId, id), eq(schema.proposals.status, "accepted")))
          .for("update");
        for (const o of accepted) {
          await tx
            .update(schema.proposals)
            .set({ offerDetails: withCgpaCorrection(o.offer, { from: result.previousScore, to: merged.after.score, scoreType: merged.after.scoreType, at: now.toISOString() }) })
            .where(eq(schema.proposals.id, o.id));
        }
        offers = accepted.length;
      }
    }

    await tx.update(schema.internOnboarding).set({ extraData: next, updatedAt: new Date() }).where(eq(schema.internOnboarding.id, row.id));
    await recordAdminAudit(
      tx,
      { adminId: guard.session.uid, action: "intern.academics_update", targetType: "intern", targetId: id, meta: { changes: merged.changes, offers } },
      { strict: true },
    );
    return { ok: true, changed, offers };
  });

  if (!outcome.ok) return NextResponse.json({ error: outcome.error, ...(outcome.fields ? { fields: outcome.fields } : {}) }, { status: outcome.status });
  return NextResponse.json({ ok: true, changed: outcome.changed, offers: outcome.offers });
}
