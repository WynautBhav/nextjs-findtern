import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { randomBytes } from "node:crypto";

import { withLock } from "@/lib/advisory-lock";
import { getDb, schema } from "@/lib/db";
import { CALENDAR_TOKEN_OWNER, calendarConfig, createMeetEvent } from "@/lib/google";
import { origin } from "@/lib/emails";
import { notify } from "@/lib/notify";
import { pickMeetingLink } from "./meeting-link";
import { sendPush } from "./push";

/**
 * Instant meetings inside a live drive: the employer asks for a call now, in
 * 5 or in 10 minutes; the student accepts or declines from the banner, the
 * bell or a push. A request no one answered by start + GRACE is expired.
 */
export const MEETING_DELAYS = [0, 5, 10] as const;
export const MEETING_MINUTES = 20;
const GRACE_MS = 10 * 60_000;

export type MeetingView = {
  id: string;
  driveId: string;
  employerId: string;
  userId: string;
  startsAt: string;
  status: string;
  meetingLink: string | null;
  company?: string;
  driveTitle?: string;
};

export function effectiveStatus(m: { status: string; startsAt: Date }, now = Date.now()): string {
  if (m.status === "requested" && m.startsAt.getTime() + GRACE_MS < now) return "expired";
  return m.status;
}

/**
 * A Meet link from Findtern's calendar, like scheduled interviews. Without
 * Google configured (local dev) a throwaway Jitsi room stands in so the flow
 * can be tested end to end; production never takes that branch.
 */
async function meetLink(start: Date): Promise<{ link: string | null; eventId: string | null }> {
  if (calendarConfig()) {
    const [token] = await getDb()
      .select({ refreshToken: schema.employerGoogleTokens.refreshToken })
      .from(schema.employerGoogleTokens)
      .where(eq(schema.employerGoogleTokens.employerId, CALENDAR_TOKEN_OWNER))
      .limit(1);
    if (token?.refreshToken) {
      try {
        const ev = await createMeetEvent(token.refreshToken, {
          summary: "Findtern campus drive call",
          description: "Findtern campus drive. Join from your Findtern dashboard.",
          start,
          end: new Date(start.getTime() + MEETING_MINUTES * 60_000),
          timezone: "Asia/Kolkata",
          attendees: [],
        });
        return { link: ev.meetUrl, eventId: ev.eventId };
      } catch (err) {
        console.error("[drive-meeting] Meet creation failed", err);
      }
    }
  }
  if (process.env.NODE_ENV !== "production") {
    return { link: `https://meet.jit.si/findtern-dev-${randomBytes(6).toString("hex")}`, eventId: null };
  }
  return { link: null, eventId: null };
}

export async function requestMeeting(input: {
  driveId: string;
  driveTitle: string;
  employerId: string;
  userId: string;
  inMinutes: (typeof MEETING_DELAYS)[number];
  manualLink?: string | null;
}): Promise<{ ok: true; meeting: MeetingView } | { ok: false; error: string }> {
  // One request per student at a time: the check and a placeholder row run under
  // a per-pair lock, so a double click makes one request and the second caller
  // sees the first's row (QA-202), and so only one Meet event is ever made. The
  // event is created after the lock is released: a Google call inside it would
  // hold a pool connection while Google answers.
  const startsAt = new Date(Date.now() + input.inMinutes * 60_000);
  const placeholder = await withLock(`drive-meeting:${input.driveId}:${input.employerId}:${input.userId}`, async (tx) => {
    const open = await tx
      .select()
      .from(schema.collegeDriveMeetings)
      .where(
        and(
          eq(schema.collegeDriveMeetings.driveId, input.driveId),
          eq(schema.collegeDriveMeetings.employerId, input.employerId),
          eq(schema.collegeDriveMeetings.userId, input.userId),
          inArray(schema.collegeDriveMeetings.status, ["requested", "accepted"]),
        ),
      );
    // A row with no link for over two minutes is a request that never finished
    // (a crash between the insert and the Meet event); it holds no one.
    const live = open.filter((m) => m.meetingLink || Date.now() - m.createdAt.getTime() < 2 * 60_000);
    if (live.some((m) => effectiveStatus(m) === "requested" || (m.status === "accepted" && m.startsAt.getTime() + MEETING_MINUTES * 60_000 > Date.now()))) {
      return null;
    }
    const [inserted] = await tx
      .insert(schema.collegeDriveMeetings)
      .values({ driveId: input.driveId, employerId: input.employerId, userId: input.userId, startsAt })
      .returning();
    return inserted;
  });
  if (!placeholder) return { ok: false, error: "You already have an open call with this student." };

  const dropPlaceholder = () => getDb().delete(schema.collegeDriveMeetings).where(eq(schema.collegeDriveMeetings.id, placeholder.id));
  let made: { link: string | null; eventId: string | null };
  try {
    made = await pickMeetingLink(input.manualLink, () => meetLink(startsAt));
  } catch (err) {
    await dropPlaceholder();
    throw err;
  }
  // Never hand the student a call they can accept but can't join (QA-001).
  if (!made.link) {
    await dropPlaceholder();
    return { ok: false, error: "Google Calendar is not connected. Paste a meeting link instead." };
  }
  const [row] = await getDb()
    .update(schema.collegeDriveMeetings)
    .set({ meetingLink: made.link, calendarEventId: made.eventId })
    // Still "requested": a row the student declined in the meantime stays declined, and no one is told.
    .where(and(eq(schema.collegeDriveMeetings.id, placeholder.id), eq(schema.collegeDriveMeetings.status, "requested")))
    .returning();
  if (!row) return { ok: false, error: "Could not request the call." };

  const when = input.inMinutes === 0 ? "right now" : `in ${input.inMinutes} minutes`;
  const title = `An employer wants to talk ${when}`;
  const message = `${input.driveTitle}: accept to get the call link. The request lapses 10 minutes after the start time.`;
  await notify({
    to: { type: "intern", id: input.userId },
    type: "drive_meeting_request",
    title,
    message,
    data: { meetingId: row.id, driveId: input.driveId, url: "/intern/dashboard" },
    email: { subject: title, heading: title, greeting: "Hi,", lines: [message], cta: { label: "Open Findtern", url: `${origin()}/intern/dashboard` } },
  }).catch((err) => console.error("[drive-meeting] notify failed", err));
  await sendPush(input.userId, { title, body: message, url: "/intern/dashboard", tag: `drive-meeting-${row.id}` }).catch(() => 0);

  return { ok: true, meeting: toView(row) };
}

export function toView(m: typeof schema.collegeDriveMeetings.$inferSelect): MeetingView {
  const status = effectiveStatus(m);
  return {
    id: m.id,
    driveId: m.driveId,
    employerId: m.employerId,
    userId: m.userId,
    startsAt: m.startsAt.toISOString(),
    status,
    // The link is only handed out once the student has accepted.
    meetingLink: status === "accepted" ? m.meetingLink : null,
  };
}

/** Requests waiting on this student, plus accepted calls not yet over. */
export async function meetingsForStudent(userId: string): Promise<MeetingView[]> {
  const rows = await getDb()
    .select({
      m: schema.collegeDriveMeetings,
      title: schema.collegeDrives.title,
      company: schema.employers.companyName,
    })
    .from(schema.collegeDriveMeetings)
    .innerJoin(schema.collegeDrives, eq(schema.collegeDrives.id, schema.collegeDriveMeetings.driveId))
    .leftJoin(schema.employers, eq(schema.employers.id, schema.collegeDriveMeetings.employerId))
    .where(
      and(
        eq(schema.collegeDriveMeetings.userId, userId),
        // A row still waiting for its Meet link (see requestMeeting) is not a call yet.
        isNotNull(schema.collegeDriveMeetings.meetingLink),
        inArray(schema.collegeDriveMeetings.status, ["requested", "accepted"]),
        sql`${schema.collegeDriveMeetings.startsAt} > now() - interval '40 minutes'`,
      ),
    );
  return rows
    .map((r) => ({ ...toView(r.m), driveTitle: r.title, company: r.company ?? "An employer" }))
    .filter((m) => m.status === "requested" || m.status === "accepted")
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}
