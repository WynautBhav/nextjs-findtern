import { and, gte, inArray, lte, sql, type AnyColumn } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import type { DrivePool } from "./drive-board-db";
import { buildDriveSummary, NUDGE_WINDOW_MS, type DriveSummary, type SummaryStudent } from "./drive-summary";
import { matchInvites } from "./drive-board";
import type { Drive } from "./scope";

/** Plain `timestamp` columns hold UTC wall time; read them as instants (as drive-board-db.ts does). */
const utc = (col: AnyColumn) => sql<Date>`(${col} AT TIME ZONE 'UTC')`.mapWith((v: string | Date) => new Date(v));
const instant = (v: unknown): Date | null => (v ? new Date(v as string) : null);

/**
 * Reads what the summary needs for one drive, already scoped by the caller: `students` are the drive's verified
 * students of this officer's college, `came` the companies that came in through its link.
 */
export async function loadDriveSummary(drive: Drive, students: SummaryStudent[], pool: DrivePool, open: boolean): Promise<DriveSummary> {
  const db = getDb();
  const start = drive.startsAt;
  const end = drive.revokedAt && drive.revokedAt < drive.endsAt ? drive.revokedAt : drive.endsAt;
  const ids = students.map((s) => s.userId);
  const came = pool.came;
  const people = [...ids, ...came.map((c) => c.employerId)];
  const pm = schema.presenceMinutes;
  // Meetings, offers and nudges come from the drive's one pool (the board's own rows); only online time is read here.
  const { meets: meetings, nudges } = pool;
  // An offer the company withdrew is no offer to the student (the board's "Got an offer" leaves it out too).
  const offers = pool.offers.filter((o) => o.status !== "withdrawn");
  const [minuteRows, [since]] = await Promise.all([
    // Minutes online inside the window, and (for checking "come online" nudges) up to a day after it.
    people.length
      ? db
          .select({ userId: pm.userId, minute: utc(pm.minute) })
          .from(pm)
          .where(and(inArray(pm.userId, people), gte(pm.minute, start), lte(pm.minute, new Date(end.getTime() + NUDGE_WINDOW_MS))))
      : Promise.resolve([]),
    db.select({ first: sql<string | null>`(min(${pm.minute}) AT TIME ZONE 'UTC')` }).from(pm),
  ]);

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
    now: pool.now,
    offers: offers.map((o) => ({ userId: o.userId, employerId: o.employerId, status: o.status, hired: o.hiredAt !== null, createdAt: o.createdAt, answeredAt: o.answeredAt })),
    nudges,
    minutes,
    onlineAt: (userId, from, to) => (stamps.get(userId) ?? []).some((t) => t > from.getTime() && t <= to.getTime()),
    employers: came.map((c) => ({ employerId: c.employerId, company: c.company ?? "Employer", joinedAt: c.joinedAt, shortlisted: c.shortlisted ?? 0 })),
    invitedCount: (drive.invitedEmployers ?? []).length,
    invitedCame: matchInvites(drive.invitedEmployers ?? [], came).arrived.length,
  });
}
