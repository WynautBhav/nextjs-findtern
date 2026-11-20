import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { recordAdminAudit } from "@/lib/admin/audit";
import { allows, type Permission } from "@/lib/admin/permissions";
import { getDb, schema } from "@/lib/db";
import { runAccountAction } from "@/lib/moderation/standing-db";
import { cleanEvidence, isStrikeReason } from "@/lib/moderation/strikes";
import type { ReviewState } from "./review-types";

/**
 * One admin click on a meeting review: Dismiss, Warn or Freeze. Warn and Freeze go through the SAME strike service the account
 * page uses (runAccountAction: strike row, freeze, audit, notices, on-hold offers); nothing here re-implements any of it. Nothing is
 * automatic: this runs only from the admin route below. Idempotent: a review that is no longer `open` answers `already` and changes
 * nothing, and the strike service itself refuses a stale click (expectedViolations) or a second freeze.
 */

const t = schema.meetingTranscripts;

export const reviewBody = z.object({
  action: z.enum(["dismiss", "warn", "freeze"]),
  party: z.enum(["employer", "intern"]).optional(),
  reason: z.string().max(64).optional(),
  note: z.string().max(2200),
  expectedViolations: z.number().int().min(0).max(1000).optional(),
}).strict();
export type ReviewBody = z.infer<typeof reviewBody>;

export type ReviewActionResult =
  | { ok: true; effect: "warn" | "freeze" | "none"; already: boolean; state: ReviewState; message?: string }
  | { ok: false; status: 400 | 403 | 404 | 409; error: string };

const WRITE: Record<"employer" | "intern", Permission[]> = { employer: ["companies:write"], intern: ["interns:write"] };

export async function applyReviewAction(input: { transcriptId: string; adminId: string; permissions: readonly string[] | undefined; body: ReviewBody }): Promise<ReviewActionResult> {
  const { transcriptId, adminId, body } = input;
  const db = getDb();
  const note = cleanEvidence(body.note);
  if (!note.ok) return { ok: false, status: 400, error: note.error };

  const [row] = await db
    .select({ id: t.id, status: t.status, state: t.reviewState, interviewId: t.interviewId, employerId: schema.interviews.employerId, internId: schema.interviews.internId })
    .from(t)
    .leftJoin(schema.interviews, eq(schema.interviews.id, t.interviewId))
    .where(eq(t.id, transcriptId))
    .limit(1);
  if (!row || !row.interviewId || row.status !== "ready" || !row.employerId || !row.internId) return { ok: false, status: 404, error: "Review not found." };
  if (row.state !== "open") return { ok: true, effect: "none", already: true, state: row.state as ReviewState, message: "Already reviewed." };

  const meta = { transcriptId, interviewId: row.interviewId, hasNote: true };

  if (body.action === "dismiss") {
    const done = await db.transaction(async (tx) => {
      const upd = await tx
        .update(t)
        .set({ reviewState: "dismissed", reviewedBy: adminId, reviewedAt: new Date(), reviewNote: note.note, updatedAt: new Date() })
        .where(and(eq(t.id, transcriptId), eq(t.reviewState, "open")))
        .returning({ id: t.id });
      if (!upd.length) return false;
      await recordAdminAudit(tx, { adminId, action: "meeting.review_dismiss", targetType: "meeting_transcript", targetId: transcriptId, meta }, { strict: true });
      return true;
    });
    return done ? { ok: true, effect: "none", already: false, state: "dismissed" } : { ok: true, effect: "none", already: true, state: "dismissed", message: "Already reviewed." };
  }

  if (!body.party) return { ok: false, status: 400, error: "Pick which party this is about." };
  if (!isStrikeReason(body.reason)) return { ok: false, status: 400, error: "Pick a reason." };
  if (!allows(input.permissions, WRITE[body.party])) return { ok: false, status: 403, error: "You do not have permission to act on this kind of account." };
  if (body.expectedViolations === undefined) return { ok: false, status: 400, error: "Reload the page and try again." };
  const subject = { type: body.party, id: body.party === "employer" ? row.employerId : row.internId };

  const out = await runAccountAction({
    subject,
    adminId,
    action: body.action === "warn" ? "violation" : "freeze",
    reason: body.reason,
    evidenceNote: `Meeting review: ${note.note}`.slice(0, 2000),
    expectedViolations: body.expectedViolations,
  });
  if (!out.ok) return { ok: false, status: out.status === 404 ? 404 : 400, error: out.error };
  if (out.effect === "none") {
    if (out.why === "stale") return { ok: false, status: 409, error: "Their standing changed since you opened this page. Reload and check." };
    return { ok: true, effect: "none", already: true, state: "open", message: out.why === "already_frozen" ? "Already frozen. Nothing changed." : "Nothing changed." };
  }
  if (out.effect === "unfreeze") return { ok: false, status: 400, error: "Unexpected result." }; // cannot happen for warn/freeze

  const state: ReviewState = out.effect === "freeze" ? "frozen" : "warned";
  await db.transaction(async (tx) => {
    await tx
      .update(t)
      .set({ reviewState: state, reviewParty: body.party, reviewedBy: adminId, reviewedAt: new Date(), reviewNote: note.note, strikeId: out.strikeId, updatedAt: new Date() })
      .where(and(eq(t.id, transcriptId), eq(t.reviewState, "open")));
    await tx.update(schema.accountStrikes).set({ flagId: transcriptId }).where(eq(schema.accountStrikes.id, out.strikeId));
    await recordAdminAudit(
      tx,
      { adminId, action: body.action === "warn" ? "meeting.review_warn" : "meeting.review_freeze", targetType: "meeting_transcript", targetId: transcriptId, meta: { ...meta, party: body.party, partyId: subject.id, effect: out.effect, strikeId: out.strikeId } },
      { strict: true },
    );
  });
  return { ok: true, effect: out.effect, already: false, state };
}
