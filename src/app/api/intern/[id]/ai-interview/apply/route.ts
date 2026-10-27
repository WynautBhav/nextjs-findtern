import { and, desc, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";
import { isInternPaid } from "@/lib/payments";
import { AI_EMPLOYER_ID, aiInterviewPhase, isScored, joinableLink } from "@/lib/ai-interview";

/**
 * Apply for the AI interview.
 *
 * Not a call to an external service. Legacy created an interview row against
 * the AI employer (id "admin", email ai-interview@findtern.ai) with status
 * "waiting", and the interview happened over a link an admin set afterwards.
 * That queue is the whole mechanism.
 *
 * Gates, all from legacy:
 *   1. Payment. The activation is what makes the profile visible, and the
 *      interview produces the score, so an unpaid profile can't queue.
 *   2. One AI interview, ever. Legacy offered "apply" only while no AI row
 *      existed (CandidateHeader: `if (!aiInterview) apply`), whatever its
 *      status, so a completed, missed or cancelled interview never queues a
 *      duplicate (INT-10). Staff re-open one from admin, not the candidate.
 */

const AI_EMAIL = "ai-interview@findtern.ai";

/**
 * The AI employer ids. The shared database already has the legacy row with
 * id "admin" (legacy ensureAiInterviewEmployer, routes.ts:1079), so it is
 * looked up first; an email match covers a row created under another id.
 */
async function aiEmployerIds(): Promise<string[]> {
  const db = getDb();
  const byEmail = await db
    .select({ id: schema.employers.id })
    .from(schema.employers)
    .where(eq(schema.employers.companyEmail, AI_EMAIL));
  return [...new Set([AI_EMPLOYER_ID, ...byEmail.map((r) => r.id)])];
}

async function latestAiRow(internId: string, ids: string[]) {
  const rows = await getDb()
    .select({
      id: schema.interviews.id,
      employerId: schema.interviews.employerId,
      status: schema.interviews.status,
      meetingLink: schema.interviews.meetingLink,
      createdAt: schema.interviews.createdAt,
    })
    .from(schema.interviews)
    .where(and(eq(schema.interviews.internId, internId), inArray(schema.interviews.employerId, ids)))
    .orderBy(desc(schema.interviews.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Where the candidate stands: the phase the home screen and the interviews
 * page show, and the join link once an admin has set it. Polled while waiting
 * so the link appears without a reload (legacy refreshed every 15 s).
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireMutation({ req, roles: ["intern"], ownerId: id });
  if (!guard.ok) return guard.response;

  const db = getDb();
  const [onboarding] = await db
    .select({ extra: schema.internOnboarding.extraData })
    .from(schema.internOnboarding)
    .where(eq(schema.internOnboarding.userId, id))
    .limit(1);
  const row = await latestAiRow(id, await aiEmployerIds());
  const phase = aiInterviewPhase(row, isScored(onboarding?.extra));

  return NextResponse.json({
    phase,
    // Kept for older clients: "something is already in the queue".
    pending: phase !== "apply",
    status: row?.status ?? null,
    interviewId: row?.id ?? null,
    meetingLink: phase === "ready" ? joinableLink(row?.meetingLink) : null,
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireMutation({ req, roles: ["intern"], ownerId: id });
  if (!guard.ok) return guard.response;

  const db = getDb();

  // Gate 1 - has the activation payment landed?
  if (!(await isInternPaid(id))) {
    return NextResponse.json({ error: "Activate your profile before applying" }, { status: 402 });
  }

  // Legacy shape on a fresh database: the AI employer is the row with id
  // "admin". Created only when neither the id nor the email exists.
  let ids = await aiEmployerIds();
  const [known] = await db
    .select({ id: schema.employers.id })
    .from(schema.employers)
    .where(inArray(schema.employers.id, ids))
    .limit(1);
  if (!known) {
    await db
      .insert(schema.employers)
      .values({
        id: AI_EMPLOYER_ID,
        name: "AI Interview",
        companyName: "AI Interview",
        companyEmail: AI_EMAIL,
        emailVerified: true,
        countryCode: "+91",
        phoneNumber: "0000000000",
        // Unusable credential: this account owns interview rows and must
        // never be able to sign in.
        password: "!ai-interview-account-cannot-sign-in",
        agreedToTerms: true,
      })
      .onConflictDoNothing();
    ids = await aiEmployerIds();
  }

  // Gate 2 - one AI interview, ever (any status).
  const existing = await latestAiRow(id, ids);
  if (existing) {
    return NextResponse.json(
      { error: "You have already applied for the AI interview.", interview: { id: existing.id, status: existing.status } },
      { status: 409 },
    );
  }

  const [interview] = await db
    .insert(schema.interviews)
    .values({
      employerId: AI_EMPLOYER_ID,
      internId: id,
      projectId: null,
      status: "waiting",
      timezone: "Asia/Kolkata",
      notes: null,
    })
    .returning({ id: schema.interviews.id });

  await db
    .insert(schema.notifications)
    .values({
      recipientType: "intern",
      recipientId: id,
      type: "ai_interview_applied",
      title: "AI interview applied",
      message: "Thanks for applying for the AI interview. Your interview link will be live in 24-48 hours.",
      data: { interviewId: interview.id },
      dedupeKey: `ai_interview_applied:${interview.id}`,
    })
    .onConflictDoNothing();

  return NextResponse.json({ ok: true, interviewId: interview.id }, { status: 201 });
}
