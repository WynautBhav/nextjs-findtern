import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb, schema } from "@/lib/db";
import { hiredProposalSql } from "@/lib/employer-visibility";
import { formatSlotTime } from "@/lib/format";
import { requireMutation } from "@/lib/guards-mutation";
import { employerNames, internFirstName, notify } from "@/lib/notify";
import { isMeetingOver, isStaleInterview, normalizeMeetingLink, reminderWindow } from "@/lib/employer-interview-rules";
import { requirePublicOrigin } from "@/lib/origin";
import { limiters } from "@/lib/security/rate-limit";

/**
 * Employer nudges the candidate about a scheduled interview. At most one
 * reminder per interview per 10 minutes: the limiter blocks early repeats, the
 * dedupe key (one per window) blocks a double delivery inside one window.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireMutation({ req, roles: ["employer"] });
  if (!guard.ok) return guard.response;

  const db = getDb();
  const [interview] = await db.select().from(schema.interviews).where(eq(schema.interviews.id, id)).limit(1);
  if (!interview) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (interview.employerId !== guard.session.uid) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (interview.status !== "scheduled" && interview.status !== "pending") {
    return NextResponse.json({ error: `This interview is already ${interview.status}` }, { status: 409 });
  }

  // A meeting that is running now can still be nudged; one that is over, or an invite whose slots all passed, cannot.
  if (interview.status === "pending" ? isStaleInterview(interview) : isMeetingOver(interview)) {
    return NextResponse.json({ error: "This interview's time has passed. Offer new times instead." }, { status: 409 });
  }

  // One nudge per interview per 10 minutes, so it can't be used to spam the candidate.
  if (!limiters.reminder.take(id)) {
    return NextResponse.json({ error: "You just sent a reminder. Try again in a few minutes." }, { status: 429 });
  }

  const start = interview.selectedSlot ? [interview.slot1, interview.slot2, interview.slot3][interview.selectedSlot - 1] : null;
  const when = start ? formatSlotTime(start, interview.timezone) : null;
  // The intern sees the company's name only once it has hired them (same
  // rule as booking, select-slot/route.ts).
  const [hire] = await db
    .select({ id: schema.proposals.id })
    .from(schema.proposals)
    .where(
      and(
        eq(schema.proposals.employerId, interview.employerId),
        eq(schema.proposals.internId, interview.internId),
        hiredProposalSql(),
      ),
    )
    .limit(1);
  const company = hire ? (await employerNames(interview.employerId)).company : "a company on Findtern";
  // Typed links without a scheme open as https (legacy, EMB-19).
  const link = normalizeMeetingLink(interview.meetingLink);
  const text = interview.status === "pending"
    ? `${company} is waiting for you to pick an interview slot.`
    : `Your interview with ${company} is on ${when}.`;
  const window = reminderWindow();
  const delivered = await notify({
    to: { type: "intern", id: interview.internId },
    type: "interview_reminder",
    title: "Interview reminder",
    message: text,
    data: { interviewId: id, meetingLink: link },
    dedupeKey: `employer_reminder:${id}:${window}`,
    email: {
      subject: "Interview reminder | Findtern",
      heading: interview.status === "pending" ? "Pick your interview slot" : "Your interview is coming up",
      greeting: `Hi ${(await internFirstName(interview.internId)) || "there"},`,
      lines: [text],
      facts: link ? [["Meet link", link]] : undefined,
      cta: { label: "Open interviews", url: `${requirePublicOrigin()}/intern/interviews` },
    },
  });
  // A booked meeting reminds both sides (legacy routes.ts:11797): the
  // employer gets an in-app note keyed the same way.
  if (interview.status === "scheduled" && interview.selectedSlot && interview.employerId !== "admin") {
    await notify({
      to: { type: "employer", id: interview.employerId },
      type: "interview_reminder",
      title: "Interview reminder",
      message: when ? `Reminder: your interview is on ${when}.` : "Reminder: your interview is coming up.",
      data: { interviewId: id, internId: interview.internId, meetingLink: link },
      dedupeKey: `manual_interview_reminder:${id}:employer:${window}`,
    });
  }
  // Nothing inserted = this window already delivered one; never claim a send that did not happen.
  if (!delivered) return NextResponse.json({ error: "A reminder was just sent. Try again in a few minutes." }, { status: 429 });
  return NextResponse.json({ ok: true });
}
