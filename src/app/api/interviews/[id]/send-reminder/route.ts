import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb, schema } from "@/lib/db";
import { hiredProposalSql } from "@/lib/employer-visibility";
import { formatSlotTime } from "@/lib/format";
import { requireMutation } from "@/lib/guards-mutation";
import { employerNames, internFirstName, notify } from "@/lib/notify";
import { normalizeMeetingLink } from "@/lib/employer-interview-rules";

/**
 * Employer nudges the candidate about a scheduled interview. At most one
 * reminder per interview per day (dedupe key), so it can't be used to spam.
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
  await notify({
    to: { type: "intern", id: interview.internId },
    type: "interview_reminder",
    title: "Interview reminder",
    message: text,
    data: { interviewId: id, meetingLink: link },
    dedupeKey: `employer_reminder:${id}:${new Date().toISOString().slice(0, 10)}`,
    email: {
      subject: "Interview reminder | Findtern",
      heading: interview.status === "pending" ? "Pick your interview slot" : "Your interview is coming up",
      greeting: `Hi ${(await internFirstName(interview.internId)) || "there"},`,
      lines: [text],
      facts: link ? [["Meet link", link]] : undefined,
      cta: { label: "Open interviews", url: `${process.env.PUBLIC_ORIGIN ?? "http://localhost:3000"}/intern/interviews` },
    },
  });
  // A booked meeting reminds both sides (legacy routes.ts:11797): the
  // employer gets an in-app note with the same once-a-day key.
  if (interview.status === "scheduled" && interview.selectedSlot && interview.employerId !== "admin") {
    await notify({
      to: { type: "employer", id: interview.employerId },
      type: "interview_reminder",
      title: "Interview reminder",
      message: when ? `Reminder: your interview is on ${when}.` : "Reminder: your interview is coming up.",
      data: { interviewId: id, internId: interview.internId, meetingLink: link },
      dedupeKey: `manual_interview_reminder:${id}:employer:${new Date().toISOString().slice(0, 10)}`,
    });
  }
  return NextResponse.json({ ok: true });
}
