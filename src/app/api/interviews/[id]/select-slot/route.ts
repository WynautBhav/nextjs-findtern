import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb, schema } from "@/lib/db";
import { emails, icsInvite } from "@/lib/emails";
import { initialsOf } from "@/lib/employer-candidates";
import { formatSlotTime } from "@/lib/format";
import { CALENDAR_TOKEN_OWNER, createMeetEvent } from "@/lib/google";
import { requireMutation } from "@/lib/guards-mutation";
import { employerNames, notify } from "@/lib/notify";

const bodySchema = z.object({ slot: z.number().int().min(1).max(3) });
const MEETING_MS = 30 * 60 * 1000;

/** The intern picks one of the offered slots; Findtern books the Meet. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireMutation({ req, roles: ["intern"] });
  if (!guard.ok) return guard.response;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const db = getDb();
  const [interview] = await db.select().from(schema.interviews).where(eq(schema.interviews.id, id)).limit(1);
  if (!interview) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (interview.internId !== guard.session.uid) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (interview.status !== "pending") {
    return NextResponse.json({ error: `This interview is already ${interview.status}` }, { status: 409 });
  }
  const start = [interview.slot1, interview.slot2, interview.slot3][parsed.data.slot - 1];
  if (!start) return NextResponse.json({ error: "That slot wasn't offered" }, { status: 400 });
  if (start.getTime() < Date.now()) return NextResponse.json({ error: "That slot has passed" }, { status: 409 });
  const end = new Date(start.getTime() + MEETING_MS);
  const tz = interview.timezone || "Asia/Kolkata";

  const [[intern], [employer], names] = await Promise.all([
    db.select().from(schema.users).where(eq(schema.users.id, interview.internId)).limit(1),
    db.select().from(schema.employers).where(eq(schema.employers.id, interview.employerId)).limit(1),
    employerNames(interview.employerId),
  ]);

  // Meet link from Findtern's calendar when it's connected; otherwise an
  // admin adds one by hand (api/admin/interviews/[id]/meeting-link).
  let meetingLink = interview.meetingLink;
  let calendarEventId = interview.calendarEventId;
  if (!meetingLink) {
    const [token] = await db
      .select({ refreshToken: schema.employerGoogleTokens.refreshToken })
      .from(schema.employerGoogleTokens)
      .where(eq(schema.employerGoogleTokens.employerId, CALENDAR_TOKEN_OWNER))
      .limit(1);
    if (token?.refreshToken) {
      try {
        const ev = await createMeetEvent(token.refreshToken, {
          summary: "Findtern Interview",
          description: `Interview between ${names.company} and a Findtern candidate.`,
          start,
          end,
          timezone: tz,
          attendees: [intern?.email, employer?.companyEmail].filter((e): e is string => Boolean(e)),
        });
        meetingLink = ev.meetUrl;
        calendarEventId = ev.eventId;
      } catch (err) {
        console.error("[select-slot] Meet creation failed", err);
      }
    }
  }

  await db
    .update(schema.interviews)
    .set({ selectedSlot: parsed.data.slot, status: "scheduled", meetingLink, calendarEventId, updatedAt: new Date() })
    .where(eq(schema.interviews.id, id));

  const when = formatSlotTime(start, tz);
  // The intern sees the company's name only once it has hired them.
  const [hire] = await db
    .select({ id: schema.proposals.id })
    .from(schema.proposals)
    .where(
      and(
        eq(schema.proposals.employerId, interview.employerId),
        eq(schema.proposals.internId, interview.internId),
        eq(schema.proposals.status, "hired"),
      ),
    )
    .limit(1);
  const companyForIntern = hire ? names.company : "a company on Findtern";
  const invite = icsInvite({ uid: id, start, end, title: "Findtern Interview", description: meetingLink ?? "Meeting link to follow", url: meetingLink });
  const candidate = `Candidate ${initialsOf(intern?.firstName ?? "", intern?.lastName ?? "")}`;
  await Promise.all([
    notify({
      to: { type: "intern", id: interview.internId },
      type: "meeting_scheduled",
      title: "Interview scheduled",
      message: `Your interview with ${companyForIntern} is on ${when}.`,
      data: { interviewId: id },
      email: emails.meetingScheduled({ name: intern?.firstName ?? "", other: companyForIntern, when, link: meetingLink, forEmployer: false }),
      attachments: [invite],
    }),
    notify({
      to: { type: "employer", id: interview.employerId },
      type: "meeting_scheduled",
      title: "Interview scheduled",
      message: `${candidate} picked ${when}.`,
      data: { interviewId: id },
      email: emails.meetingScheduled({ name: names.contact, other: candidate, when, link: meetingLink, forEmployer: true }),
      attachments: [invite],
    }),
  ]);
  return NextResponse.json({ ok: true, meetingLink });
}
