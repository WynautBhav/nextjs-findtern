import { and, eq, gte, inArray, lte, ne, sql, type AnyColumn } from "drizzle-orm";

import { realEmployerId } from "@/lib/admin/scope";
import { getDb, schema } from "@/lib/db";
import { todayIst } from "@/lib/offer";
import { startBegunSql } from "@/lib/offer-start-sql";
import { q } from "./sql";
import { buildDriveBoard, matchInvites, type CameEmployer, type DriveBoard, type DriveStudentRef, type Invite, type NudgeRow } from "./drive-board";
import { loadDriveInterviews } from "./drive-interviews-db";
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
  const employerId = q(e, e.employerId);
  const rows = await getDb()
    .select({
      shortlisted: sql<number>`(SELECT count(*)::int FROM ${schema.collegeDriveShortlist} s WHERE s.drive_id = ${driveId} AND s.employer_id = ${employerId})`,
      calls: sql<number>`(SELECT count(*)::int FROM ${schema.collegeDriveMeetings} m WHERE m.drive_id = ${driveId} AND m.employer_id = ${employerId})`,
      employerId: e.employerId, status: e.status, joinedAt: utc(e.joinedAt), company: em.companyName, name: em.name, contact: em.primaryContactName, email: em.companyEmail, cc: em.countryCode, phone: em.phoneNumber })
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
    shortlisted: Number(r.shortlisted ?? 0),
    calls: Number(r.calls ?? 0),
    exited: r.status === "exited",
  }));
}

/**
 * Everything the drive page needs for one drive: the employer alert and the board. `students` are the drive's
 * students (eligibleStudents), already scoped to this college; offline is passed in from the presence snapshot.
 * `employerId`: one company that came through the link. Then `view` is the board of the students that company met or
 * made an offer to (from its meetings and offers only); `board` stays the whole drive's. Without it, `view` is `board`.
 * An id that is not a company of this drive is ignored.
 */
export async function loadDriveBoard(
  drive: Drive,
  students: DriveStudentRef[],
  offline: { userId: string }[] | null,
  now = Date.now(),
  employerId?: string | null,
  /** Also build each company's own board (the past-drive card's company pop-up). In memory, no extra queries. */
  perEmployer = false,
): Promise<{ board: DriveBoard; view: DriveBoard; byEmployer: Record<string, DriveBoard>; filter: { employerId: string; company: string } | null; came: CameEmployer[]; invited: Invite[]; arrived: Invite[]; missing: Invite[]; walkIns: number }> {
  const came = await driveEmployerContacts(drive.id);
  const ids = students.map((s) => s.userId);
  const employerIds = came.map((c) => c.employerId);
  const companyOf = new Map(came.map((c) => [c.employerId, c.company]));
  const db = getDb();
  const p = schema.proposals;
  const n = schema.collegeNudges;
  const end = drive.revokedAt && drive.revokedAt < drive.endsAt ? drive.revokedAt : drive.endsAt;
  const [calls, interviews, offers, nudges, shortlist] = await Promise.all([
    db
      .select({ userId: schema.collegeDriveMeetings.userId, employerId: schema.collegeDriveMeetings.employerId, status: schema.collegeDriveMeetings.status, createdAt: utc(schema.collegeDriveMeetings.createdAt), startsAt: utc(schema.collegeDriveMeetings.startsAt) })
      .from(schema.collegeDriveMeetings)
      .where(eq(schema.collegeDriveMeetings.driveId, drive.id)),
    // Interviews the drive's companies scheduled with its students count as meets too.
    loadDriveInterviews(drive, ids, employerIds, now),
    ids.length && employerIds.length
      ? db
          .select({
            userId: p.internId,
            employerId: p.employerId,
            status: p.status,
            hiredAt: p.hiredAt,
            createdAt: utc(p.createdAt),
            fullTime: sql<boolean>`jsonb_typeof(${p.offerDetails}->'fullTimeOffer') = 'object'`,
            pastStart: sql<boolean>`${startBegunSql(p.offerDetails, todayIst(new Date(now)))}`,
          })
          .from(p)
          .where(and(inArray(p.internId, ids), inArray(p.employerId, employerIds), gte(p.createdAt, drive.startsAt), lte(p.createdAt, end), ne(p.status, "draft"), realEmployerId(p.employerId)))
      : Promise.resolve([]),
    // Nudges carry no drive id: the drive's students, nudged by this college inside the drive's window.
    ids.length
      ? db
          .select({ userId: n.userId, kind: n.kind, createdAt: utc(n.createdAt) })
          .from(n)
          .where(and(eq(n.collegeId, drive.collegeId), inArray(n.userId, ids), inArray(n.kind, ["online", "open_to_work", "meeting", "meeting_reminder", "offer"]), gte(n.createdAt, drive.startsAt), lte(n.createdAt, end)))
      : Promise.resolve([] as NudgeRow[]),
    // Who the drive's companies shortlisted (bug sheet 26 Nov: the drive page shows it).
    db
      .select({ userId: schema.collegeDriveShortlist.userId, employerId: schema.collegeDriveShortlist.employerId, createdAt: utc(schema.collegeDriveShortlist.createdAt) })
      .from(schema.collegeDriveShortlist)
      .where(eq(schema.collegeDriveShortlist.driveId, drive.id)),
  ]);
  const meetings = [...calls, ...interviews];
  const invited = (drive.invitedEmployers ?? []) as Invite[];
  const { arrived, missing, walkIns } = matchInvites(invited, came);
  const make = (only: string | null) => {
    const ms = meetings.filter((m) => !only || m.employerId === only);
    // Withdrawn offers go in too: the board lists them on their own and counts them as no offer.
    const os = offers.filter((o) => !only || o.employerId === only);
    // One company's view lists the students it met or offered to, not the whole drive.
    const sl = shortlist.filter((r) => !only || r.employerId === only);
    // Shortlisted and withdrawn-offer students are this company's too, so its Shortlisted and Withdrawn lists stay whole.
    const touched = new Set([...ms.map((m) => m.userId), ...os.map((o) => o.userId), ...sl.map((r) => r.userId)]);
    return buildDriveBoard({
      students: only ? students.filter((s) => touched.has(s.userId)) : students,
      meetings: ms.map((m) => ({ userId: m.userId, company: companyOf.get(m.employerId) ?? null, status: m.status, createdAt: m.createdAt, startsAt: m.startsAt ?? undefined })),
      offers: os.map((o) => ({ userId: o.userId, company: companyOf.get(o.employerId) ?? null, status: (o.status ?? "").toLowerCase(), hired: o.hiredAt !== null, fullTime: Boolean(o.fullTime), pastStart: Boolean(o.pastStart), createdAt: o.createdAt ?? drive.startsAt })),
      offline,
      nudges: nudges as NudgeRow[],
      shortlist: sl.map((r) => ({ userId: r.userId, company: companyOf.get(r.employerId) ?? null, createdAt: r.createdAt })),
      now,
    });
  };
  const only = employerId && companyOf.has(employerId) ? employerId : null;
  const board = make(null);
  const byEmployer: Record<string, DriveBoard> = perEmployer ? Object.fromEntries(employerIds.map((id) => [id, make(id)])) : {};
  return { board, view: only ? make(only) : board, byEmployer, filter: only ? { employerId: only, company: companyOf.get(only)?.trim() || "This company" } : null, came, invited, arrived, missing, walkIns };
}

/**
 * The drive page's Meetings figures for one drive (sent, accepted, completed, expired), for screens that show a drive
 * without its board (the drives list). Same students, calls, interviews and rules as loadDriveBoard, so they agree.
 */
export async function driveMeetCounts(drive: Drive, studentIds: string[], now: number): Promise<DriveBoard["meetCounts"]> {
  const employerIds = (await driveEmployerContacts(drive.id)).map((c) => c.employerId);
  const [calls, interviews] = await Promise.all([
    getDb()
      .select({ userId: schema.collegeDriveMeetings.userId, status: schema.collegeDriveMeetings.status, createdAt: utc(schema.collegeDriveMeetings.createdAt), startsAt: utc(schema.collegeDriveMeetings.startsAt) })
      .from(schema.collegeDriveMeetings)
      .where(eq(schema.collegeDriveMeetings.driveId, drive.id)),
    loadDriveInterviews(drive, studentIds, employerIds, now),
  ]);
  const students: DriveStudentRef[] = studentIds.map((userId) => ({ userId, name: "", rollNo: null, year: null, branch: null, phone: null }));
  const meetings = [...calls, ...interviews].map((m) => ({ userId: m.userId, company: null, status: m.status, createdAt: m.createdAt, startsAt: m.startsAt ?? undefined }));
  return buildDriveBoard({ students, meetings, offers: [], offline: null, now }).meetCounts;
}
