import { and, eq, gte, inArray, ne, sql, type AnyColumn } from "drizzle-orm";

import { realEmployerId } from "@/lib/admin/scope";
import { getDb, schema } from "@/lib/db";
import { buildDriveBoard, matchInvites, type CameEmployer, type DriveBoard, type DriveStudentRef, type Invite } from "./drive-board";
import type { Drive } from "./scope";

/**
 * These columns are plain `timestamp` holding UTC wall time; node-postgres would read them as local time (5h30 off
 * on an IST server), so they are read as timestamptz, as scope.ts does.
 */
const utc = (col: AnyColumn) => sql<Date>`(${col} AT TIME ZONE 'UTC')`.mapWith((v: string | Date) => new Date(v));

/** Employers who came in through the drive's link, with the contact the officer can call. */
export async function driveEmployerContacts(driveId: string): Promise<CameEmployer[]> {
  const e = schema.collegeDriveEmployers;
  const em = schema.employers;
  const rows = await getDb()
    .select({ employerId: e.employerId, joinedAt: utc(e.joinedAt), company: em.companyName, name: em.name, contact: em.primaryContactName, email: em.companyEmail, cc: em.countryCode, phone: em.phoneNumber })
    .from(e)
    .leftJoin(em, eq(em.id, e.employerId))
    .where(eq(e.driveId, driveId))
    .orderBy(e.joinedAt);
  return rows.map((r) => ({
    employerId: r.employerId,
    company: r.company,
    contact: r.contact || r.name,
    email: r.email,
    phone: r.phone ? `${r.cc ?? ""} ${r.phone}`.trim() : null,
    joinedAt: r.joinedAt,
  }));
}

/**
 * Everything the drive page needs for one drive: the employer alert and the board. `students` are the drive's
 * students (eligibleStudents), already scoped to this college; offline is passed in from the presence snapshot.
 */
export async function loadDriveBoard(
  drive: Drive,
  students: DriveStudentRef[],
  offline: { userId: string }[] | null,
  now = Date.now(),
): Promise<{ board: DriveBoard; came: CameEmployer[]; invited: Invite[]; arrived: Invite[]; missing: Invite[] }> {
  const came = await driveEmployerContacts(drive.id);
  const ids = students.map((s) => s.userId);
  const employerIds = came.map((c) => c.employerId);
  const companyOf = new Map(came.map((c) => [c.employerId, c.company]));
  const db = getDb();
  const p = schema.proposals;
  const [meetings, offers] = await Promise.all([
    db
      .select({ userId: schema.collegeDriveMeetings.userId, employerId: schema.collegeDriveMeetings.employerId, status: schema.collegeDriveMeetings.status, createdAt: utc(schema.collegeDriveMeetings.createdAt) })
      .from(schema.collegeDriveMeetings)
      .where(eq(schema.collegeDriveMeetings.driveId, drive.id)),
    ids.length && employerIds.length
      ? db
          .select({
            userId: p.internId,
            employerId: p.employerId,
            status: p.status,
            hiredAt: p.hiredAt,
            createdAt: utc(p.createdAt),
            fullTime: sql<boolean>`jsonb_typeof(${p.offerDetails}->'fullTimeOffer') = 'object'`,
          })
          .from(p)
          .where(and(inArray(p.internId, ids), inArray(p.employerId, employerIds), gte(p.createdAt, drive.startsAt), ne(p.status, "draft"), realEmployerId(p.employerId)))
      : Promise.resolve([]),
  ]);
  const invited = (drive.invitedEmployers ?? []) as Invite[];
  const { arrived, missing } = matchInvites(invited, came);
  const board = buildDriveBoard({
    students,
    meetings: meetings.map((m) => ({ userId: m.userId, company: companyOf.get(m.employerId) ?? null, status: m.status, createdAt: m.createdAt })),
    offers: offers
      .filter((o) => o.status !== "withdrawn")
      .map((o) => ({ userId: o.userId, company: companyOf.get(o.employerId) ?? null, status: (o.status ?? "").toLowerCase(), hired: o.hiredAt !== null, fullTime: Boolean(o.fullTime), createdAt: o.createdAt ?? drive.startsAt })),
    offline,
    now,
  });
  return { board, came, invited, arrived, missing };
}
