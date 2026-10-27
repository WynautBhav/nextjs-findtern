import { and, eq, inArray, sql } from "drizzle-orm";
import { randomBytes } from "node:crypto";

import { getDb, schema } from "@/lib/db";
import { CALENDAR_TOKEN_OWNER, calendarConfig, createMeetEvent } from "@/lib/google";
import { origin } from "@/lib/emails";
import { notify } from "@/lib/notify";
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
}): Promise<{ ok: true; meeting: MeetingView } | { ok: false; error: string }> {
  const db = getDb();
  const open = await db
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
  if (open.some((m) => effectiveStatus(m) === "requested" || (m.status === "accepted" && m.startsAt.getTime() + MEETING_MINUTES * 60_000 > Date.now()))) {
    return { ok: false, error: "You already have an open call with this student." };
  }

  const startsAt = new Date(Date.now() + input.inMinutes * 60_000);
  const { link, eventId } = await meetLink(startsAt);
  // Never hand the student a call they can accept but can't join (QA-001).
  if (!link) return { ok: false, error: "Calendar not connected; ask Findtern to connect it." };
  const [row] = await db
    .insert(schema.collegeDriveMeetings)
    .values({
      driveId: input.driveId,
      employerId: input.employerId,
      userId: input.userId,
      startsAt,
      meetingLink: link,
      calendarEventId: eventId,
    })
    .returning();

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
        inArray(schema.collegeDriveMeetings.status, ["requested", "accepted"]),
        sql`${schema.collegeDriveMeetings.startsAt} > now() - interval '40 minutes'`,
      ),
    );
  return rows
    .map((r) => ({ ...toView(r.m), driveTitle: r.title, company: r.company ?? "An employer" }))
    .filter((m) => m.status === "requested" || m.status === "accepted")
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}
