import { eq } from "drizzle-orm";
import { after, NextResponse } from "next/server";
import { z } from "zod";

import { getDb, schema } from "@/lib/db";
import { emails, icsInvite } from "@/lib/emails";
import { requireMutation } from "@/lib/guards-mutation";
import { employerNames, internFirstName, notify } from "@/lib/notify";
import { wallTimeToUtc } from "@/lib/timezones";
import { hasDuplicateSlots, isQuarterHourWall } from "@/lib/employer-interview-rules";
import { CALENDAR_TOKEN_OWNER, calendarConfig, refreshAccessToken } from "@/lib/google";

const wall = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
const bodySchema = z.object({ slot1: wall.optional(), slot2: wall.optional(), slot3: wall.optional() });

/**
 * Employer: offer new slots (wall-clock times in the interview's timezone).
 * Intern: ask the employer for new slots. Either way it goes back to pending.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireMutation({ req, roles: ["employer", "intern"] });
  if (!guard.ok) return guard.response;
  const { session } = guard;

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const db = getDb();
  const [interview] = await db.select().from(schema.interviews).where(eq(schema.interviews.id, id)).limit(1);
  if (!interview) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const byEmployer = session.role === "employer";
  if ((byEmployer ? interview.employerId : interview.internId) !== session.uid) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!["pending", "scheduled"].includes(interview.status)) {
    return NextResponse.json({ error: `This interview is already ${interview.status}` }, { status: 409 });
  }

  let slots: (Date | null)[] = [interview.slot1, interview.slot2, interview.slot3];
  if (byEmployer) {
    const wanted = [parsed.data.slot1, parsed.data.slot2, parsed.data.slot3].filter((s): s is string => Boolean(s));
    // Same rule as booking: three times, on the quarter hour.
    if (wanted.length !== 3) return NextResponse.json({ error: "Offer three time slots." }, { status: 400 });
    if (!wanted.every(isQuarterHourWall)) {
      return NextResponse.json({ error: "Slots start on the hour or at :15, :30 or :45." }, { status: 400 });
    }
    slots = wanted.map((s) => wallTimeToUtc(s, interview.timezone || "Asia/Kolkata"));
    if (slots.some((s) => s!.getTime() < Date.now())) {
      return NextResponse.json({ error: "Slots must be in the future" }, { status: 400 });
    }
    if (hasDuplicateSlots(slots as Date[])) {
      return NextResponse.json({ error: "Offer different times - two slots are the same." }, { status: 400 });
    }
  }

  await db
    .update(schema.interviews)
    .set({
      slot1: slots[0] ?? null,
      slot2: slots[1] ?? null,
      slot3: slots[2] ?? null,
      status: "pending",
      selectedSlot: null,
      meetingLink: null,
      calendarEventId: null,
      updatedAt: new Date(),
    })
    .where(eq(schema.interviews.id, id));

  // The old Google Calendar / Meet event goes too, or it lingers on
  // Findtern's calendar with a dead link (EMB-23). Best effort, after the
  // response: a Google outage must not block a reschedule.
  if (interview.calendarEventId) {
    const eventId = interview.calendarEventId;
    after(() => deleteCalendarEvent(eventId).catch((e) => console.error("[reschedule] calendar delete", e)));
  }

  // An AI interview's "employer" is the synthetic `admin` row - nobody to
  // tell (legacy R:11717 skipped it too).
  if (!byEmployer && interview.employerId === "admin") return NextResponse.json({ ok: true });

  // A booked slot put an invite in each side's calendar; withdraw the
  // recipient's copy (same per-party uid as select-slot sent).
  const bookedStart =
    interview.status === "scheduled" && interview.selectedSlot
      ? [interview.slot1, interview.slot2, interview.slot3][interview.selectedSlot - 1]
      : null;
  const cancelFor = (party: "intern" | "employer") =>
    bookedStart
      ? [
          icsInvite({
            uid: `${id}-${party}`,
            start: bookedStart,
            end: new Date(bookedStart.getTime() + 30 * 60_000),
            title: "Findtern interview (cancelled)",
            description: "This time was replaced. New times are on Findtern.",
            cancel: true,
            sequence: Math.floor(Date.now() / 1000),
          }),
        ]
      : undefined;

  await notify(
    byEmployer
      ? {
          to: { type: "intern", id: interview.internId },
          type: "interview_rescheduled_by_employer",
          title: "Interview rescheduled",
          message: "The company offered new times. Pick the one that works for you.",
          data: { interviewId: id },
          email: emails.interviewRescheduled({ name: await internFirstName(interview.internId), byEmployer: true }),
          attachments: cancelFor("intern"),
        }
      : {
          to: { type: "employer", id: interview.employerId },
          type: "interview_reschedule_requested_by_intern",
          title: "Reschedule requested",
          message: "The candidate asked to reschedule. Offer new slots.",
          data: { interviewId: id },
          email: emails.interviewRescheduled({ name: (await employerNames(interview.employerId)).contact, byEmployer: false }),
          attachments: cancelFor("employer"),
        },
  );
  return NextResponse.json({ ok: true });
}

/** Remove an event from Findtern's calendar (the one select-slot created). */
async function deleteCalendarEvent(eventId: string): Promise<void> {
  const cfg = calendarConfig();
  if (!cfg) return;
  const [token] = await getDb()
    .select({ refreshToken: schema.employerGoogleTokens.refreshToken })
    .from(schema.employerGoogleTokens)
    .where(eq(schema.employerGoogleTokens.employerId, CALENDAR_TOKEN_OWNER))
    .limit(1);
  if (!token?.refreshToken) return;
  const access = await refreshAccessToken(cfg, token.refreshToken);
  const calendarId = encodeURIComponent(process.env.MEET_CALENDAR_ID || "primary");
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${encodeURIComponent(eventId)}?sendUpdates=none`,
    { method: "DELETE", headers: { Authorization: `Bearer ${access}` } },
  );
  // 404/410: already gone, which is the outcome we wanted.
  if (!res.ok && res.status !== 404 && res.status !== 410) throw new Error(`Google Calendar delete failed (${res.status})`);
}
