import { and, eq, gte, inArray, lte, ne, sql, type AnyColumn } from "drizzle-orm";

import { realEmployerId } from "@/lib/admin/scope";
import { getDb, schema } from "@/lib/db";
import type { CameEmployer, Invite } from "./drive-board";
import { buildDriveEmployers, countByEmployer, type DriveEmployers } from "./drive-employers";
import type { Drive } from "./scope";

/** Plain `timestamp` columns hold UTC wall time; read them as timestamptz (see drive-board-db.ts). */
const utc = (col: AnyColumn) => sql<Date>`(${col} AT TIME ZONE 'UTC')`.mapWith((v: string | Date) => new Date(v));

/**
 * The Employers panel's data. Meetings come from college_drive_meetings for this drive; offers and hires from
 * proposals to the drive's students created inside the drive window (not draft, not withdrawn: the rule loadDriveBoard
 * uses); online / last seen from user_presence. `studentIds` are the drive's verified students.
 */
export async function loadDriveEmployers(drive: Drive, studentIds: string[], came: CameEmployer[], invited: Invite[], open: boolean, now = Date.now()): Promise<DriveEmployers> {
  const employerIds = came.map((c) => c.employerId);
  const db = getDb();
  const p = schema.proposals;
  const end = drive.revokedAt && drive.revokedAt < drive.endsAt ? drive.revokedAt : drive.endsAt;
  const [meetings, offers, presence] = employerIds.length
    ? await Promise.all([
        db
          .select({ employerId: schema.collegeDriveMeetings.employerId, status: schema.collegeDriveMeetings.status })
          .from(schema.collegeDriveMeetings)
          .where(and(eq(schema.collegeDriveMeetings.driveId, drive.id), inArray(schema.collegeDriveMeetings.employerId, employerIds))),
        studentIds.length
          ? db
              .select({ employerId: p.employerId, userId: p.internId, status: p.status, hiredAt: p.hiredAt })
              .from(p)
              .where(and(inArray(p.internId, studentIds), inArray(p.employerId, employerIds), gte(p.createdAt, drive.startsAt), lte(p.createdAt, end), ne(p.status, "draft"), ne(p.status, "withdrawn"), realEmployerId(p.employerId)))
          : Promise.resolve([]),
        // Only a running drive shows who is online; a finished one never reads presence.
        open
          ? db
              .select({ userId: schema.userPresence.userId, lastSeenAt: utc(schema.userPresence.lastSeenAt) })
              .from(schema.userPresence)
              .where(inArray(schema.userPresence.userId, employerIds))
          : Promise.resolve([]),
      ])
    : [[], [], []];
  return buildDriveEmployers({
    came,
    invited,
    counts: countByEmployer(
      meetings.map((m) => ({ employerId: m.employerId, status: m.status ?? "" })),
      offers.map((o) => ({ employerId: o.employerId, userId: o.userId, status: o.status ?? "", hiredAt: o.hiredAt })),
    ),
    lastSeen: new Map(presence.map((r) => [r.userId, r.lastSeenAt])),
    over: !open,
    now,
  });
}
