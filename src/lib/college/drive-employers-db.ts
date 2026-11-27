import { and, gte, inArray, lte, sql, type AnyColumn } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import type { Invite } from "./drive-board";
import { buildDriveEmployers, countByEmployer, type DriveEmployers } from "./drive-employers";
import type { DrivePool } from "./drive-board-db";
import type { Drive } from "./scope";

/** Plain `timestamp` columns hold UTC wall time; read them as timestamptz (see drive-board-db.ts). */
const utc = (col: AnyColumn) => sql<Date>`(${col} AT TIME ZONE 'UTC')`.mapWith((v: string | Date) => new Date(v));

/**
 * The Employers panel's data. Meetings and offers come from the drive's one pool (the board's own rows: every meeting,
 * every offer, withdrawn ones too), so each company's figures add up to the board's Total meetings and Total offers.
 * Online / last seen from user_presence.
 */
export async function loadDriveEmployers(drive: Drive, pool: DrivePool, invited: Invite[], open: boolean, now = Date.now()): Promise<DriveEmployers> {
  const came = pool.came;
  const employerIds = came.map((c) => c.employerId);
  const db = getDb();
  const end = drive.revokedAt && drive.revokedAt < drive.endsAt ? drive.revokedAt : drive.endsAt;
  const pm = schema.presenceMinutes;
  const { meets: meetings, offers } = pool;
  const [presence, minuteRows, [since]] = employerIds.length
    ? await Promise.all([
        // Only a running drive shows who is online; a finished one never reads presence.
        open
          ? db
              .select({ userId: schema.userPresence.userId, lastSeenAt: utc(schema.userPresence.lastSeenAt) })
              .from(schema.userPresence)
              .where(inArray(schema.userPresence.userId, employerIds))
          : Promise.resolve([]),
        // Online time per company, counted as the drive summary does (minute rows inside the window); a running drive counts to now.
        db
          .select({ userId: pm.userId, n: sql<number>`count(*)::int` })
          .from(pm)
          .where(and(inArray(pm.userId, employerIds), gte(pm.minute, drive.startsAt), lte(pm.minute, end)))
          .groupBy(pm.userId),
        db.select({ first: sql<Date | null>`(min(${pm.minute}) AT TIME ZONE 'UTC')`.mapWith((v: string | Date | null) => (v ? new Date(v) : null)) }).from(pm),
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
    // Not recorded at all before the drive ended: "tracked: none" in the summary, shown as a dash.
    minutes: since?.first && since.first <= end ? new Map(minuteRows.map((r) => [r.userId, r.n])) : null,
    over: !open,
    now,
  });
}
