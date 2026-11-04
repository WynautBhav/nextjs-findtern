import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";
import { emails } from "@/lib/emails";
import { employerNames, internFirstName, notify } from "@/lib/notify";
import { mergeInterviewNotes, noteTag, statusAfterMeetingLink } from "@/lib/admin/interview-notes";

const AI_EMAIL = "ai-interview@findtern.ai";

/**
 * Admin: Assign or update the meeting link (e.g. Incruiter assessment URL)
 * for an interview session, and optionally attach feedback and recording URLs.
 *
 * Matching legacy route: PUT /api/admin/interviews/:id/meeting-link
 *
 * Side effects depend on the interview kind:
 *  - Every interview that isn't finished moves to "scheduled" (legacy rule,
 *    ADP-07).
 *  - AI interview (synthetic ai-interview@findtern.ai employer): emits the
 *    deduplicated `ai_interview_unlocked` notification and persists
 *    aiFeedbackLink / aiRecordingLink to the candidate's extraData.
 *  - Any other interview: both parties are told the meeting link was set.
 */

const bodySchema = z.object({
  meetingLink: z
    .string({ message: "Enter the meeting link." })
    .trim()
    .min(1, "Enter the meeting link.")
    .regex(/^https?:\/\/\S+$/i, "Enter a full link starting with https://"),
  // A link is one line with no spaces (or empty, which clears it): a line break in it could start a forged
  // "feedback_text:" line in the notes. `\S` rejects every kind of whitespace, U+2028 included.
  feedbackLink: z.string().trim().regex(/^(https?:\/\/\S+)?$/i, "Enter a full link starting with https://").optional().nullable(),
  recordingLink: z.string().trim().regex(/^(https?:\/\/\S+)?$/i, "Enter a full link starting with https://").optional().nullable(),
  notes: z.string().optional().nullable(),
});

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const guard = await requireMutation({ req, roles: ["admin"] });
  if (!guard.ok) return guard.response;

  const bodyRaw = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(bodyRaw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid payload", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { meetingLink, feedbackLink, recordingLink, notes } = parsed.data;
  const db = getDb();

  const [existing] = await db
    .select()
    .from(schema.interviews)
    .where(eq(schema.interviews.id, id))
    .limit(1);

  if (!existing) {
    return NextResponse.json({ error: "Interview not found" }, { status: 404 });
  }

  // Notes carry the feedback & recording tags plus the employer's own
  // `feedback_text:` line, which is always kept (ADP-33).
  const combinedNotes = mergeInterviewNotes(existing.notes, { notes, feedbackLink, recordingLink });
  const nextFeedback = noteTag(combinedNotes, "feedback");
  const nextRecording = noteTag(combinedNotes, "recording");

  const [employer] = await db
    .select({ email: schema.employers.companyEmail })
    .from(schema.employers)
    .where(eq(schema.employers.id, existing.employerId))
    .limit(1);
  // Legacy AI interviews sit on employer id "admin"; ours on the synthetic employer.
  const isAi = existing.employerId === "admin" || employer?.email === AI_EMAIL;

  const currentStatus = String(existing.status ?? "").toLowerCase();
  // Legacy rule (ADP-07, decided): any unfinished interview, employer or AI,
  // becomes "scheduled" once it has a link.
  const nextStatus = statusAfterMeetingLink(existing.status);

  const [updated] = await db
    .update(schema.interviews)
    .set({
      meetingLink: meetingLink.trim(),
      notes: combinedNotes,
      status: nextStatus,
      updatedAt: new Date(),
    })
    // Only if the notes are still what was read: the employer may have left feedback in between, and a stale
    // copy written back would wipe it (ADP-33).
    .where(
      and(
        eq(schema.interviews.id, id),
        existing.notes == null ? isNull(schema.interviews.notes) : eq(schema.interviews.notes, existing.notes),
        // ...and the status: a cancel or a "missed" in between must not be turned back into "scheduled".
        existing.status == null ? isNull(schema.interviews.status) : eq(schema.interviews.status, existing.status),
      ),
    )
    .returning();
  if (!updated) {
    return NextResponse.json({ error: "This interview was just updated by someone else. Reload and save again." }, { status: 409 });
  }

  const link = meetingLink.trim();
  const linkChanged = link !== String(existing.meetingLink ?? "").trim();

  if (!isAi) {
    // Only an open interview: a missed/completed/cancelled one gets the link saved but no mail.
    if (linkChanged && nextStatus === "scheduled") {
      const data = { interviewId: id, meetingLink: link };
      const dedupeKey = `interview_link:${id}:${link}`;
      try {
        await notify({
          to: { type: "intern", id: existing.internId },
          type: "interview_link",
          title: "Interview link ready",
          message: "The meeting link for your interview has been added. Open your interviews to join.",
          data,
          dedupeKey,
          email: emails.interviewLinkReady({ name: await internFirstName(existing.internId), link, forEmployer: false }),
        });
        await notify({
          to: { type: "employer", id: existing.employerId },
          type: "interview_link",
          title: "Interview link ready",
          message: "The meeting link for your interview has been added. Open your schedule to join.",
          data,
          dedupeKey,
          email: emails.interviewLinkReady({ name: (await employerNames(existing.employerId)).contact, link, forEmployer: true }),
        });
      } catch (notifyErr) {
        console.error("Interview link notification failed:", notifyErr);
      }
    }
    return NextResponse.json({ ok: true, interview: updated });
  }

  // AI interview: unlock notification to the candidate if this sets or updates meetingLink
  try {
    const wasEmpty = !String(existing.meetingLink ?? "").trim();
    const hasLink = Boolean(meetingLink.trim());
    if (hasLink && (wasEmpty || currentStatus === "waiting" || currentStatus === "pending")) {
      await db
        .insert(schema.notifications)
        .values({
          recipientType: "intern",
          recipientId: existing.internId,
          type: "ai_interview_unlocked",
          title: "AI interview unlocked",
          message: "Your AI interview is open. The link is on your Interviews page.",
          data: { interviewId: id, meetingLink: meetingLink.trim() },
          dedupeKey: `ai_interview_unlocked:${id}`,
        })
        .onConflictDoNothing();
    }
  } catch (notifyErr) {
    console.error("AI interview unlock notification failed:", notifyErr);
  }

  // Mirror the links onto the candidate profile (what the ratings editor and
  // employer report read) so the two copies can't disagree; empty clears.
  if (feedbackLink !== undefined || recordingLink !== undefined) {
    try {
      const [onboarding] = await db
        .select()
        .from(schema.internOnboarding)
        .where(eq(schema.internOnboarding.userId, existing.internId))
        .limit(1);

      if (onboarding) {
        const extra = (onboarding.extraData as Record<string, unknown>) ?? {};
        const updatedExtra = { ...extra };
        if (feedbackLink !== undefined) updatedExtra.aiFeedbackLink = nextFeedback || null;
        if (recordingLink !== undefined) updatedExtra.aiRecordingLink = nextRecording || null;
        await db
          .update(schema.internOnboarding)
          .set({ extraData: updatedExtra })
          .where(eq(schema.internOnboarding.id, onboarding.id));
      }
    } catch (extraErr) {
      console.error("Failed to update candidate extraData links:", extraErr);
    }
  }

  return NextResponse.json({ ok: true, interview: updated });
}

export const POST = PUT;
