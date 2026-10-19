import { and, eq, ne, or } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { notify } from "@/lib/notify";

import { firstLiveScore } from "./ratings";

const AI_EMAIL = "ai-interview@findtern.ai";

/**
 * What legacy did the moment an intern's score went live: tell them once
 * (`ai_interview_scores_live:<id>`), and close their AI interview so it does
 * not sit at "scheduled" forever. Runs after every ratings write - single
 * edit, bulk import and the Incruiter webhook. Best-effort: a failure here
 * never undoes the saved ratings.
 */
export async function afterRatingsSaved(
  internId: string,
  prev: Record<string, unknown>,
  next: Record<string, unknown>,
): Promise<void> {
  const score = typeof next.findternScore === "number" ? next.findternScore : 0;
  if (score <= 0) return;
  try {
    const db = getDb();
    // Employers only see Approved interns. A live AI-interview score approves
    // the intern automatically; staff can still Reject, and a Rejected intern
    // is never re-approved by a later score.
    const approval = next.approvalStatus;
    if (approval !== "Approved" && approval !== "Rejected") {
      const [row] = await db
        .select({ id: schema.internOnboarding.id, extraData: schema.internOnboarding.extraData })
        .from(schema.internOnboarding)
        .where(eq(schema.internOnboarding.userId, internId))
        .limit(1);
      const current = (row?.extraData ?? {}) as Record<string, unknown>;
      if (row && current.approvalStatus !== "Approved" && current.approvalStatus !== "Rejected") {
        await db
          .update(schema.internOnboarding)
          .set({ extraData: { ...current, approvalStatus: "Approved", approvedAt: new Date().toISOString(), approvedBy: "auto:score" } })
          .where(eq(schema.internOnboarding.id, row.id));
      }
    }
    if (firstLiveScore(prev, next)) {
      const [user] = await db
        .select({ firstName: schema.users.firstName, lastName: schema.users.lastName })
        .from(schema.users)
        .where(eq(schema.users.id, internId))
        .limit(1);
      const name = `${user?.firstName ?? ""} ${user?.lastName ?? ""}`.trim() || "Candidate";
      await notify({
        to: { type: "intern", id: internId },
        type: "ai_interview_scores_live",
        title: "AI interview scores are live",
        message: `🎉 Hurray ${name}! Your AI interview is complete. Scores will be live soon.`,
        data: { findternScore: score },
        dedupeKey: `ai_interview_scores_live:${internId}`,
      });
    }

    // Legacy AI interviews sit on employer id "admin"; ours on the synthetic
    // ai-interview employer. Either counts.
    const aiInterviews = await db
      .select({ id: schema.interviews.id })
      .from(schema.interviews)
      .leftJoin(schema.employers, eq(schema.employers.id, schema.interviews.employerId))
      .where(
        and(
          eq(schema.interviews.internId, internId),
          or(eq(schema.interviews.employerId, "admin"), eq(schema.employers.companyEmail, AI_EMAIL)),
          ne(schema.interviews.status, "completed"),
        ),
      );
    for (const iv of aiInterviews) {
      await db.update(schema.interviews).set({ status: "completed", updatedAt: new Date() }).where(eq(schema.interviews.id, iv.id));
    }
  } catch (err) {
    console.error("[ratings] score-live follow-up failed", err);
  }
}
