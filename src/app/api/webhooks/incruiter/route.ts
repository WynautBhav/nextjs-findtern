import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { applyRatings, type RatingUpdate } from "@/lib/admin/ratings";
import { afterRatingsSaved } from "@/lib/admin/score-live";
import { getDb, schema } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorised(req: Request): boolean {
  const secret = process.env.INCRUITER_WEBHOOK_SECRET;
  // Header only: a ?secret= query lands in nginx access logs.
  const given = req.headers.get("x-webhook-secret") ?? "";
  if (!secret) return false;
  const a = Buffer.from(secret);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Incruiter AI-interview results. Disabled unless INCRUITER_WEBHOOK_SECRET is
 * set and sent back as `x-webhook-secret`: scores here change
 * what employers pay, so an unauthenticated caller must never reach them.
 * Only scores Incruiter actually sends are written; nothing is defaulted.
 */
/**
 * Adds the result under whatever the notes already hold (SYS-15): the admin's
 * feedback and recording-link lines live in the same field and used to be
 * wiped by every webhook call. A repeat delivery of the same text is a no-op.
 */
function appendNote(existing: string | null, line: string): string {
  const text = line.trim().slice(0, 4000);
  const prev = (existing ?? "").trimEnd();
  if (!prev) return text;
  if (prev.includes(text)) return prev;
  return `${prev}\n${text}`.slice(0, 8000);
}

export async function POST(req: Request) {
  if (!authorised(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const raw = (await req.json().catch(() => null)) as Record<string, any> | null; // eslint-disable-line @typescript-eslint/no-explicit-any
  if (!raw) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

  const db = getDb();
  const interviewId = raw.interviewId ?? raw.interview_id ?? raw.testId ?? raw.test_id;
  const internId = raw.internId ?? raw.intern_id ?? raw.candidateId ?? raw.candidate_id ?? raw.userId;
  const scores = raw.scores ?? raw.ratings ?? raw.result;

  if (interviewId && (raw.status === "completed" || raw.status === "passed")) {
    // Only AI interviews are touched: the synthetic ai-interview@findtern.ai
    // employer, or the legacy AI rows whose employer id is "admin" (SYS-15;
    // there is no employers row behind those, hence the left join).
    const [iv] = await db
      .select({
        id: schema.interviews.id,
        employerId: schema.interviews.employerId,
        notes: schema.interviews.notes,
        email: schema.employers.companyEmail,
      })
      .from(schema.interviews)
      .leftJoin(schema.employers, eq(schema.employers.id, schema.interviews.employerId))
      .where(eq(schema.interviews.id, String(interviewId)))
      .limit(1);
    if (iv && (iv.employerId === "admin" || iv.email === "ai-interview@findtern.ai")) {
      await db
        .update(schema.interviews)
        .set({
          notes: appendNote(iv.notes, String(raw.feedback ?? scores?.summary ?? "AI interview completed")),
          status: "completed",
          updatedAt: new Date(),
        })
        .where(eq(schema.interviews.id, iv.id));
    }
  }

  if (internId && scores && typeof scores === "object") {
    const [onboarding] = await db.select().from(schema.internOnboarding).where(eq(schema.internOnboarding.userId, String(internId))).limit(1);
    if (onboarding) {
      const pick = (...keys: string[]) => {
        for (const k of keys) {
          const n = Number(scores[k]);
          if (scores[k] !== undefined && Number.isFinite(n) && n >= 0 && n <= 10) return n;
        }
        return undefined;
      };
      const updates: RatingUpdate = {
        coding: pick("coding", "technical"),
        aptitude: pick("aptitude", "problem_solving"),
        interview: pick("interview", "ai_score"),
        communication: pick("communication"),
      };
      const url = (v: unknown) => (typeof v === "string" && /^https:\/\//.test(v) ? v : undefined);
      const prevExtra = (onboarding.extraData as Record<string, unknown>) ?? {};
      const extra = applyRatings(prevExtra, updates);
      await db
        .update(schema.internOnboarding)
        .set({
          extraData: {
            ...extra,
            incruiterReportUrl: url(raw.reportUrl ?? raw.report_url ?? raw.pdfUrl) ?? extra.incruiterReportUrl,
            incruiterRecordingUrl: url(raw.recordingUrl ?? raw.recording_url) ?? extra.incruiterRecordingUrl,
          },
          updatedAt: new Date(),
        })
        .where(eq(schema.internOnboarding.id, onboarding.id));
      await afterRatingsSaved(String(internId), prevExtra, extra);
    }
  }
  return NextResponse.json({ ok: true });
}
