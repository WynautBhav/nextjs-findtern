import { and, eq, gte, inArray, lte, ne, sql, type AnyColumn } from "drizzle-orm";

import { realEmployerId } from "@/lib/admin/scope";
import { getDb, schema } from "@/lib/db";
import { loadDriveInterviews } from "./drive-interviews-db";
import { buildDriveSummary, NUDGE_WINDOW_MS, type DriveSummary, type SummaryStudent } from "./drive-summary";
import { matchInvites, type CameEmployer } from "./drive-board";
import type { Drive } from "./scope";

/** Plain `timestamp` columns hold UTC wall time; read them as instants (as drive-board-db.ts does). */
const utc = (col: AnyColumn) => sql<Date>`(${col} AT TIME ZONE 'UTC')`.mapWith((v: string | Date) => new Date(v));
const instant = (v: unknown): Date | null => (v ? new Date(v as string) : null);

/**
 * Reads what the summary needs for one drive, already scoped by the caller: `students` are the drive's verified
 * students of this officer's college, `came` the companies that came in through its link.
 */
export async function loadDriveSummary(drive: Drive, students: SummaryStudent[], came: CameEmployer[], open: boolean): Promise<DriveSummary> {
  const db = getDb();
  const start = drive.startsAt;
  const end = drive.revokedAt && drive.revokedAt < drive.endsAt ? drive.revokedAt : drive.endsAt;
  const ids = students.map((s) => s.userId);
  const employerIds = came.map((c) => c.employerId);
  const people = [...ids, ...employerIds];
  const p = schema.proposals;
  const pm = schema.presenceMinutes;
  const n = schema.collegeNudges;

  const [calls, offers, nudges, minuteRows, [since], interviews] = await Promise.all([
    db
      .select({ userId: schema.collegeDriveMeetings.userId, employerId: schema.collegeDriveMeetings.employerId, status: schema.collegeDriveMeetings.status, createdAt: utc(schema.collegeDriveMeetings.createdAt), respondedAt: sql<string | null>`(${schema.collegeDriveMeetings.respondedAt} AT TIME ZONE 'UTC')` })
      .from(schema.collegeDriveMeetings)
      .where(eq(schema.collegeDriveMeetings.driveId, drive.id)),
    // The same offers the drive board counts: from companies that came, to the drive's students, sent inside the window.
    ids.length && employerIds.length
      ? db
          .select({
            userId: p.internId,
            employerId: p.employerId,
            status: p.status,
            hiredAt: p.hiredAt,
            createdAt: utc(p.createdAt),
            answeredAt: sql<string | null>`coalesce(
              nullif(${p.offerDetails}->>'acceptedAt', '')::timestamptz,
              nullif(${p.offerDetails}->>'declinedAt', '')::timestamptz,
              CASE WHEN ${p.status} IN ('accepted', 'rejected', 'processing', 'hired', 'completed') THEN ${p.updatedAt} AT TIME ZONE 'UTC' END)`,
          })
          .from(p)
          .where(and(inArray(p.internId, ids), inArray(p.employerId, employerIds), gte(p.createdAt, start), lte(p.createdAt, end), ne(p.status, "draft"), ne(p.status, "withdrawn"), realEmployerId(p.employerId)))
      : Promise.resolve([]),
    ids.length
      ? db
          .select({ userId: n.userId, kind: n.kind, createdAt: utc(n.createdAt) })
          .from(n)
          .where(and(eq(n.collegeId, drive.collegeId), inArray(n.userId, ids), gte(n.createdAt, start), lte(n.createdAt, end)))
      : Promise.resolve([]),
    // Minutes online inside the window, and (for checking "come online" nudges) up to a day after it.
    people.length
      ? db
          .select({ userId: pm.userId, minute: utc(pm.minute) })
          .from(pm)
          .where(and(inArray(pm.userId, people), gte(pm.minute, start), lte(pm.minute, new Date(end.getTime() + NUDGE_WINDOW_MS))))
      : Promise.resolve([]),
    db.select({ first: sql<string | null>`(min(${pm.minute}) AT TIME ZONE 'UTC')` }).from(pm),
    loadDriveInterviews(drive, ids, employerIds),
  ]);
  const meetings = [...calls.map((m) => ({ ...m, respondedAt: instant(m.respondedAt) })), ...interviews];

  const minutes = new Map<string, number>();
  const stamps = new Map<string, number[]>();
  for (const r of minuteRows) {
    const t = r.minute.getTime();
    if (t <= end.getTime()) minutes.set(r.userId, (minutes.get(r.userId) ?? 0) + 1);
    const list = stamps.get(r.userId) ?? [];
    list.push(t);
    stamps.set(r.userId, list);
  }

  return buildDriveSummary({
    open,
    driveHref: `/college/drives/${drive.id}`,
    window: { start, end },
    trackingSince: instant(since?.first),
    students,
    meetings,
    offers: offers.map((o) => ({ userId: o.userId, employerId: o.employerId, status: (o.status ?? "").toLowerCase(), hired: o.hiredAt !== null, createdAt: o.createdAt, answeredAt: instant(o.answeredAt) })),
    nudges,
    minutes,
    onlineAt: (userId, from, to) => (stamps.get(userId) ?? []).some((t) => t > from.getTime() && t <= to.getTime()),
    employers: came.map((c) => ({ employerId: c.employerId, company: c.company ?? "Employer", joinedAt: c.joinedAt, shortlisted: c.shortlisted ?? 0 })),
    invitedCount: (drive.invitedEmployers ?? []).length,
    invitedCame: matchInvites(drive.invitedEmployers ?? [], came).arrived.length,
  });
}
