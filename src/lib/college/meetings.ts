import { and, eq, inArray, isNotNull, isNull, sql, type SQL } from "drizzle-orm";
import { randomBytes } from "node:crypto";

import { withLock } from "@/lib/advisory-lock";
import { getDb, schema } from "@/lib/db";
import { CALENDAR_TOKEN_OWNER, calendarConfig, createMeetEvent } from "@/lib/google";
import { initialsOf } from "@/lib/employer-candidates";
import { notify } from "@/lib/notify";
import { linkTo } from "@/lib/origin";
import { studentCallOpen } from "./access";
import { CALL_GRACE_MS } from "./constants";
import { pickMeetingLink } from "./meeting-link";
import { maskMeetingViews, type MeetingView } from "./meeting-views";
import { sendPush } from "./push";

/**
 * Instant meetings inside a live drive: the employer asks for a call now, in
 * 5 or in 10 minutes; the student accepts or declines from the banner, the
 * bell or a push. A request no one answered by start + GRACE is expired.
 */
export const MEETING_DELAYS = [0, 5, 10] as const;
export const MEETING_MINUTES = 20;
const GRACE_MS = CALL_GRACE_MS;

export type { MeetingView };

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
  // The request is committed: with no PUBLIC_ORIGIN the student gets the bell and push, not an email.
  const dashboard = linkTo("/intern/dashboard");
  await notify({
    to: { type: "intern", id: input.userId },
    type: "drive_meeting_request",
    title,
    message,
    data: { meetingId: row.id, driveId: input.driveId, url: "/intern/dashboard" },
    email: dashboard === null ? undefined : { subject: title, heading: title, greeting: "Hi,", lines: [message], cta: { label: "Open Findtern", url: dashboard } },
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

/**
 * A student's call rows with what decides whether the call is still open to them (studentCallOpen): the drive's
 * window and revoke, its college switched on, and the student's membership of that college.
 */
function studentCallRows(where: SQL | undefined) {
  return getDb()
    .select({
      m: schema.collegeDriveMeetings,
      title: schema.collegeDrives.title,
      company: schema.employers.companyName,
      drive: { startsAt: schema.collegeDrives.startsAt, endsAt: schema.collegeDrives.endsAt, revokedAt: schema.collegeDrives.revokedAt },
      collegeActive: schema.colleges.isActive,
      membershipId: schema.collegeMemberships.id,
      leftAt: schema.collegeMemberships.leftAt,
    })
    .from(schema.collegeDriveMeetings)
    .innerJoin(schema.collegeDrives, eq(schema.collegeDrives.id, schema.collegeDriveMeetings.driveId))
    .innerJoin(schema.colleges, eq(schema.colleges.id, schema.collegeDrives.collegeId))
    .leftJoin(
      schema.collegeMemberships,
      and(eq(schema.collegeMemberships.userId, schema.collegeDriveMeetings.userId), eq(schema.collegeMemberships.collegeId, schema.collegeDrives.collegeId)),
    )
    .leftJoin(schema.employers, eq(schema.employers.id, schema.collegeDriveMeetings.employerId))
    .where(where);
}

type StudentCallRow = Awaited<ReturnType<typeof studentCallRows>>[number];

function callRowOpen(r: StudentCallRow, now = Date.now()): boolean {
  return studentCallOpen({ drive: r.drive, collegeActive: r.collegeActive, membership: r.membershipId ? { leftAt: r.leftAt } : null, now });
}

/** The student's own call request, and whether its drive still lets them answer it. Null when it is not theirs. */
export async function studentCall(userId: string, meetingId: string): Promise<{ meeting: typeof schema.collegeDriveMeetings.$inferSelect; open: boolean } | null> {
  const [r] = await studentCallRows(and(eq(schema.collegeDriveMeetings.id, meetingId), eq(schema.collegeDriveMeetings.userId, userId))).limit(1);
  return r ? { meeting: r.m, open: callRowOpen(r) } : null;
}

/**
 * The employer's views of their calls in a drive (see maskMeetingViews): a call reads `cancelled` only when the student is
 * no longer a live member of THIS college, never because the drive's eligibility (officer exclusion, a raised CGPA cutoff)
 * stopped listing them. `liveMemberIds` comes from `liveDriveStudents`.
 */
export function viewsForStudentsInDrive(rows: (typeof schema.collegeDriveMeetings.$inferSelect)[], liveMemberIds: ReadonlySet<string>, labelOf?: ReadonlyMap<string, string>): MeetingView[] {
  return maskMeetingViews(rows.map(toView), liveMemberIds, labelOf);
}

/** Of these students: who still has a live membership (left_at IS NULL) in this college, and each one's initials (never a name). */
export async function liveDriveStudents(collegeId: string, userIds: string[]): Promise<{ live: Set<string>; labels: Map<string, string> }> {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return { live: new Set(), labels: new Map() };
  const rows = await getDb()
    .select({ id: schema.users.id, firstName: schema.users.firstName, lastName: schema.users.lastName, membershipId: schema.collegeMemberships.id })
    .from(schema.users)
    .leftJoin(
      schema.collegeMemberships,
      and(eq(schema.collegeMemberships.userId, schema.users.id), eq(schema.collegeMemberships.collegeId, collegeId), isNull(schema.collegeMemberships.leftAt)),
    )
    .where(inArray(schema.users.id, ids));
  return {
    live: new Set(rows.filter((r) => r.membershipId).map((r) => r.id)),
    labels: new Map(rows.map((r) => [r.id, initialsOf(r.firstName ?? "", r.lastName ?? "")])),
  };
}

/**
 * Turning a drive off closes its open calls too: requests and accepted calls become `cancelled`, so no student
 * accepts (or joins) a call of a drive the officer shut. Runs on the caller's db/tx.
 */
export async function closeDriveCalls(db: Pick<ReturnType<typeof getDb>, "update">, driveId: string): Promise<void> {
  await db
    .update(schema.collegeDriveMeetings)
    .set({ status: "cancelled", respondedAt: new Date() })
    .where(and(eq(schema.collegeDriveMeetings.driveId, driveId), inArray(schema.collegeDriveMeetings.status, ["requested", "accepted"])));
}

/** Requests waiting on this student, plus accepted calls not yet over, of drives still open to them. */
export async function meetingsForStudent(userId: string): Promise<MeetingView[]> {
  const rows = await studentCallRows(
    and(
      eq(schema.collegeDriveMeetings.userId, userId),
      // A row still waiting for its Meet link (see requestMeeting) is not a call yet.
      isNotNull(schema.collegeDriveMeetings.meetingLink),
      inArray(schema.collegeDriveMeetings.status, ["requested", "accepted"]),
      sql`${schema.collegeDriveMeetings.startsAt} > now() - interval '40 minutes'`,
    ),
  );
  const now = Date.now();
  return rows
    .filter((r) => callRowOpen(r, now))
    .map((r) => ({ ...toView(r.m), driveTitle: r.title, company: r.company ?? "An employer" }))
    .filter((m) => m.status === "requested" || m.status === "accepted")
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}
