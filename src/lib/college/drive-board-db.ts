import { and, eq, gte, inArray, lte, ne, sql, type AnyColumn } from "drizzle-orm";

import { realEmployerId } from "@/lib/admin/scope";
import { getDb, schema } from "@/lib/db";
import { todayIst } from "@/lib/offer";
import { startBegunSql } from "@/lib/offer-start-sql";
import { buildDriveBoard, matchInvites, mergeShortlist, type CameEmployer, type DriveBoard, type DriveStudentRef, type Invite, type NudgeRow } from "./drive-board";
import { loadDriveMeets, type DriveMeetRow } from "./drive-interviews-db";
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
    .select({
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
    exited: r.status === "exited",
  }));
}

/**
 * Who this drive's companies shortlisted, among the given students: the drive's own list plus each company's regular
 * Shortlist (employer_cart_items, what the company's own drive page counts). One row per (company, student).
 * Every figure that says "shortlisted" for a drive reads this, so the officer's number is the employer's number.
 */
export async function loadDriveShortlist(driveId: string, employerIds: string[], studentIds: string[]): Promise<{ userId: string; employerId: string; createdAt: Date }[]> {
  if (!studentIds.length) return [];
  const db = getDb();
  const [own, regular] = await Promise.all([
    db
      .select({ userId: schema.collegeDriveShortlist.userId, employerId: schema.collegeDriveShortlist.employerId, createdAt: utc(schema.collegeDriveShortlist.createdAt) })
      .from(schema.collegeDriveShortlist)
      .where(and(eq(schema.collegeDriveShortlist.driveId, driveId), inArray(schema.collegeDriveShortlist.userId, studentIds))),
    employerIds.length
      ? db
          .select({ userId: schema.employerCartItems.internId, employerId: schema.employerCartItems.employerId, createdAt: utc(schema.employerCartItems.createdAt) })
          .from(schema.employerCartItems)
          .where(and(inArray(schema.employerCartItems.employerId, employerIds), inArray(schema.employerCartItems.internId, studentIds)))
      : Promise.resolve([] as { userId: string; employerId: string; createdAt: Date }[]),
  ]);
  return mergeShortlist(own, regular);
}


/** An offer to a drive's student from one of its companies, sent inside the drive's window (drafts left out). */
export type PoolOffer = { userId: string; employerId: string; status: string; hiredAt: Date | null; createdAt: Date; fullTime: boolean; pastStart: boolean; answeredAt: Date | null };
/**
 * Everything a drive's figures are made of, fetched ONCE: the companies that came, every meeting (loadDriveMeets),
 * every offer (withdrawn ones too), the officer's nudges and the shortlists. The board, the summary, the Employers
 * table and the drives list all build from this one object, so a card, the summary and the cards under it can never
 * show different numbers for the same thing (bug sheet 27 Nov: "one shared pool").
 */
export type DrivePool = {
  drive: Drive;
  studentIds: string[];
  came: CameEmployer[];
  meets: DriveMeetRow[];
  offers: PoolOffer[];
  nudges: { userId: string; kind: string; createdAt: Date }[];
  shortlist: { userId: string; employerId: string; createdAt: Date }[];
  now: number;
};

export async function loadDrivePool(drive: Drive, studentIds: string[], now = Date.now()): Promise<DrivePool> {
  const came = await driveEmployerContacts(drive.id);
  const ids = studentIds;
  const employerIds = came.map((c) => c.employerId);
  const db = getDb();
  const p = schema.proposals;
  const n = schema.collegeNudges;
  const end = drive.revokedAt && drive.revokedAt < drive.endsAt ? drive.revokedAt : drive.endsAt;
  const [meets, offers, nudges, shortlist] = await Promise.all([
    loadDriveMeets(drive, ids, employerIds, now),
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
            answeredAt: sql<string | null>`coalesce(
              nullif(${p.offerDetails}->>'acceptedAt', '')::timestamptz,
              nullif(${p.offerDetails}->>'declinedAt', '')::timestamptz,
              CASE WHEN ${p.status} IN ('accepted', 'rejected', 'processing', 'hired', 'completed') THEN ${p.updatedAt} AT TIME ZONE 'UTC' END)`,
          })
          .from(p)
          .where(and(inArray(p.internId, ids), inArray(p.employerId, employerIds), gte(p.createdAt, drive.startsAt), lte(p.createdAt, end), ne(p.status, "draft"), realEmployerId(p.employerId)))
      : Promise.resolve([]),
    // Nudges carry no drive id: the drive's students, nudged by this college inside the drive's window.
    ids.length
      ? db
          .select({ userId: n.userId, kind: n.kind, createdAt: utc(n.createdAt) })
          .from(n)
          .where(and(eq(n.collegeId, drive.collegeId), inArray(n.userId, ids), gte(n.createdAt, drive.startsAt), lte(n.createdAt, end)))
      : Promise.resolve([]),
    // Who the drive's companies shortlisted (the regular Shortlist counts too).
    loadDriveShortlist(drive.id, employerIds, ids),
  ]);
  // Each company's shortlisted figure comes from the same rows as the board.
  const shortlistedBy = new Map<string, number>();
  for (const r of shortlist) shortlistedBy.set(r.employerId, (shortlistedBy.get(r.employerId) ?? 0) + 1);
  for (const c of came) c.shortlisted = shortlistedBy.get(c.employerId) ?? 0;
  return {
    drive, studentIds: ids, came, meets, shortlist, now,
    offers: offers.map((o) => ({ userId: o.userId, employerId: o.employerId, status: (o.status ?? "").toLowerCase(), hiredAt: o.hiredAt, createdAt: o.createdAt, fullTime: Boolean(o.fullTime), pastStart: Boolean(o.pastStart), answeredAt: o.answeredAt ? new Date(o.answeredAt) : null })),
    nudges,
  };
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
  /** The drive's pool, when the page has already fetched it for the summary and the Employers table. */
  pool?: DrivePool,
): Promise<{ board: DriveBoard; view: DriveBoard; byEmployer: Record<string, DriveBoard>; filter: { employerId: string; company: string } | null; came: CameEmployer[]; invited: Invite[]; arrived: Invite[]; missing: Invite[]; walkIns: number }> {
  // The drive's one pool, fetched here unless the page already has it.
  const { came, meets: meetings, offers, nudges: allNudges, shortlist } = pool ?? (await loadDrivePool(drive, students.map((s) => s.userId), now));
  const employerIds = came.map((c) => c.employerId);
  const companyOf = new Map(came.map((c) => [c.employerId, c.company]));
  const nudges = allNudges.filter((x) => BOARD_NUDGES.has(x.kind));
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
      meetings: ms.map((m) => ({ userId: m.userId, company: companyOf.get(m.employerId) ?? null, status: m.status, createdAt: m.createdAt, startsAt: m.startsAt ?? undefined, reason: m.reason ?? null, cancelledBy: m.cancelledBy ?? null, feedback: m.feedback ?? null })),
      offers: os.map((o) => ({ userId: o.userId, company: companyOf.get(o.employerId) ?? null, status: o.status, hired: o.hiredAt !== null, fullTime: o.fullTime, pastStart: o.pastStart, createdAt: o.createdAt })),
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

const BOARD_NUDGES = new Set(["online", "open_to_work", "meeting", "meeting_reminder", "offer"]);

/** The drives list's figures for one drive: the board built from the same pool, so they are the drive page's own. */
export async function driveListFigures(drive: Drive, studentIds: string[], now: number): Promise<{ meetCounts: DriveBoard["meetCounts"]; shortlistCount: number }> {
  const students: DriveStudentRef[] = studentIds.map((userId) => ({ userId, name: "", rollNo: null, year: null, branch: null, phone: null }));
  const { board } = await loadDriveBoard(drive, students, null, now, null, false, await loadDrivePool(drive, studentIds, now));
  return { meetCounts: board.meetCounts, shortlistCount: board.shortlistCount };
}
