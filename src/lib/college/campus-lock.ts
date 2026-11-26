import { cache } from "react";
import { and, eq, gt, inArray, isNull, lte, ne, sql, type SQL } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { emails } from "@/lib/emails";
import { inIdList } from "@/lib/sql-ids";
import { mailCollegeOfficers } from "./mail";
import { busyDriveFor, lockEmployerDrives } from "./drive-overlap";
import { eligibleStudents, type Drive } from "./scope";
import { fullTimeReady } from "./eligibility";

/**
 * Campus-locked mode. While a company is inside a live campus drive (joined, not exited, the drive inside its window, not
 * switched off, its college active), Findtern's candidate pool narrows to that drive's students: the candidate list, a
 * profile, a shortlist add, an interview and an offer all go through `campusCohort` (lib/employer-pool.ts). The window is
 * checked against the database clock on every call, so a drive that ended a minute ago lifts the lock on the next request
 * with no cron. Leaving the drive ("Exit campus drive") lifts it at once. Offers, hires and shortlists made inside a drive
 * stay: they belong to the company, not to the lock.
 */

export type DriveAction =
  | "joined_drive"
  | "viewed_candidates"
  | "shortlisted_candidate"
  | "sent_internship_offer"
  | "sent_fulltime_offer"
  | "exited_drive_early"
  | "drive_auto_completed";

type Db = ReturnType<typeof getDb>;

/** The database clock as the app stores times (timestamp without time zone, in UTC), whatever the session's TimeZone. */
const NOW_UTC = sql`(now() AT TIME ZONE 'UTC')`;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/** Best effort: an activity row never fails the action it records. */
export async function logDriveActivity(
  db: Db | Tx,
  row: { driveId: string; collegeId: string; employerId: string; action: DriveAction; metadata?: Record<string, unknown> },
): Promise<void> {
  try {
    await db.insert(schema.driveActivityLogs).values({ ...row, metadata: row.metadata ?? {} });
  } catch (err) {
    console.error("[drive-activity] log failed", row.action, err);
  }
}

/**
 * The live drives this company is inside right now. Server (database) time decides the window. Memoised per request
 * (React `cache`): the layout, the page and the pool checks of one render share a single read.
 */
export const activeCampusDrives = cache((employerId: string) => loadActiveCampusDrives(employerId, getDb()));

async function loadActiveCampusDrives(employerId: string, db: Db): Promise<{ drive: Drive; collegeName: string; collegeLogoUrl: string | null }[]> {
  await settleEndedDrives(employerId, db);
  const rows = await db
    .select({ drive: schema.collegeDrives, collegeName: schema.colleges.name, collegeLogoUrl: schema.colleges.logoUrl })
    .from(schema.collegeDriveEmployers)
    .innerJoin(schema.collegeDrives, eq(schema.collegeDrives.id, schema.collegeDriveEmployers.driveId))
    .innerJoin(schema.colleges, eq(schema.colleges.id, schema.collegeDrives.collegeId))
    .where(
      and(
        eq(schema.collegeDriveEmployers.employerId, employerId),
        // "completed" too: an officer who extends a drive that had ended puts the company back in it.
        ne(schema.collegeDriveEmployers.status, "exited"),
        isNull(schema.collegeDrives.revokedAt),
        lte(schema.collegeDrives.startsAt, NOW_UTC),
        gt(schema.collegeDrives.endsAt, NOW_UTC),
        eq(schema.colleges.isActive, true),
      ),
    )
    .orderBy(schema.collegeDrives.endsAt);
  return rows;
}

/**
 * Join rows whose drive has ended or been switched off are marked completed, once (the update is the guard), and the
 * officer's log gets `drive_auto_completed`. A record only: the lock never depends on it.
 */
async function settleEndedDrives(employerId: string, db: Db): Promise<void> {
  try {
    const done = await db
      .update(schema.collegeDriveEmployers)
      .set({ status: "completed", completedAt: NOW_UTC })
      .where(
        and(
          eq(schema.collegeDriveEmployers.employerId, employerId),
          eq(schema.collegeDriveEmployers.status, "joined"),
          sql`${schema.collegeDriveEmployers.driveId} IN (SELECT id FROM ${schema.collegeDrives} WHERE ends_at <= ${NOW_UTC} OR (revoked_at IS NOT NULL AND revoked_at <= ${NOW_UTC}))`,
        ),
      )
      .returning({ driveId: schema.collegeDriveEmployers.driveId });
    if (done.length === 0) return;
    const drives = await db
      .select({ id: schema.collegeDrives.id, collegeId: schema.collegeDrives.collegeId })
      .from(schema.collegeDrives)
      .where(inArray(schema.collegeDrives.id, done.map((d) => d.driveId)));
    for (const d of drives) await logDriveActivity(db, { driveId: d.id, collegeId: d.collegeId, employerId, action: "drive_auto_completed" });
  } catch (err) {
    console.error("[campus-lock] settle ended drives", err);
  }
}

export type CampusCohort = {
  drives: { drive: Drive; collegeName: string; collegeLogoUrl: string | null }[];
  /** Every student of those drives: the only interns the company may browse or start something new with. */
  ids: Set<string>;
  /** The final-year ones (fullTimeReady): the Full-time track, and who can take a full-time offer at the drive's 1%. */
  finalYear: Set<string>;
  /** Which drive each student is in (the first live one), for a drive full-time offer. */
  driveOf: Map<string, string>;
};

/** Null when the company is not locked. Otherwise the drives and their students (the drives' own eligibility rules). */
export const campusCohort = cache(async (employerId: string): Promise<CampusCohort | null> => {
  const drives = await activeCampusDrives(employerId);
  if (drives.length === 0) return null;
  const ids = new Set<string>();
  const finalYear = new Set<string>();
  const driveOf = new Map<string, string>();
  for (const d of drives) {
    for (const s of await eligibleStudents(d.drive)) {
      ids.add(s.userId);
      if (fullTimeReady(s)) finalYear.add(s.userId);
      if (!driveOf.has(s.userId)) driveOf.set(s.userId, d.drive.id);
    }
  }
  return { drives, ids, finalYear, driveOf };
});

/**
 * A WHERE clause on `users.id` for a locked company; undefined when there is no lock. An empty cohort matches nobody.
 * `fullTime`: the Full-time track, final-year students only.
 */
export function cohortClause(cohort: CampusCohort | null, opts: { fullTime?: boolean } = {}): SQL | undefined {
  return cohort ? inIdList(schema.users.id, [...(opts.fullTime ? cohort.finalYear : cohort.ids)]) : undefined;
}

/**
 * The drive an offer to this intern is sourced from: a live drive the company is in whose students include the intern.
 * Null for the open marketplace. Decided here, never from the request.
 */
export async function driveSourceFor(employerId: string, internId: string): Promise<{ driveId: string; collegeId: string } | null> {
  const drives = await activeCampusDrives(employerId);
  for (const d of drives) {
    if ((await eligibleStudents(d.drive)).some((s) => s.userId === internId)) return { driveId: d.drive.id, collegeId: d.drive.collegeId };
  }
  return null;
}

/**
 * Path B of the invite: a company that signs up or signs in with an email the officer invited enters the drive without
 * opening the link. Only drives that are open now (started, not ended, not switched off); the match is on the normalized email. Returns
 * the drives newly joined.
 */
export async function autoJoinInvitedDrives(employerId: string, email: string, db: Db = getDb()): Promise<string[]> {
  const norm = email.trim().toLowerCase();
  if (!norm) return [];
  try {
    const drives = await db
      .select({ id: schema.collegeDrives.id, collegeId: schema.collegeDrives.collegeId, startsAt: schema.collegeDrives.startsAt, endsAt: schema.collegeDrives.endsAt, revokedAt: schema.collegeDrives.revokedAt })
      .from(schema.collegeDrives)
      .innerJoin(schema.colleges, eq(schema.colleges.id, schema.collegeDrives.collegeId))
      .where(
        and(
          isNull(schema.collegeDrives.revokedAt),
          // Open drives only: an invited company is not let in before the drive's start (bug sheet 26 Nov). It enters on
          // its next sign-in once the drive is live, or from its invite link.
          lte(schema.collegeDrives.startsAt, NOW_UTC),
          gt(schema.collegeDrives.endsAt, NOW_UTC),
          eq(schema.colleges.isActive, true),
          sql`EXISTS (SELECT 1 FROM jsonb_array_elements(${schema.collegeDrives.invitedEmployers}) inv WHERE lower(btrim(inv->>'email')) = ${norm})`,
        ),
      );
    const joined: string[] = [];
    // Earliest first: with two overlapping invites, the company enters the one that opens first (one drive at a time).
    for (const d of [...drives].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())) {
      const row = await db.transaction(async (tx) => {
        await lockEmployerDrives(tx, employerId);
        if (await busyDriveFor(tx, employerId, d, d.id)) return null;
        const [added] = await tx
          .insert(schema.collegeDriveEmployers)
          .values({ driveId: d.id, employerId, via: "auto" })
          .onConflictDoNothing()
          .returning({ id: schema.collegeDriveEmployers.id });
        return added ?? null;
      });
      if (!row) continue;
      joined.push(d.id);
      await logDriveActivity(db, { driveId: d.id, collegeId: d.collegeId, employerId, action: "joined_drive", metadata: { via: "auto" } });
    }
    return joined;
  } catch (err) {
    // Sign-in must never fail because of a drive.
    console.error("[campus-lock] auto join", err);
    return [];
  }
}

/** What the company did in a drive, for the officer's exit email. */
export async function driveActivitySummary(driveId: string, employerId: string, db: Db = getDb()): Promise<Record<string, number>> {
  const rows = await db
    .select({ action: schema.driveActivityLogs.action, n: sql<number>`count(*)::int` })
    .from(schema.driveActivityLogs)
    .where(and(eq(schema.driveActivityLogs.driveId, driveId), eq(schema.driveActivityLogs.employerId, employerId)))
    .groupBy(schema.driveActivityLogs.action);
  return Object.fromEntries(rows.map((r) => [r.action, r.n]));
}

/**
 * "Exit campus drive": the company leaves, the lock lifts at once, the officer is told. Offers and hires made inside the
 * drive keep their drive pricing (it is on the offer). Returns null when the company is not inside this drive.
 */
export async function exitCampusDrive(employerId: string, driveId: string, db: Db = getDb()): Promise<{ exitedAt: Date } | null> {
  const [row] = await db
    .update(schema.collegeDriveEmployers)
    .set({ status: "exited", exitedAt: NOW_UTC })
    .where(and(eq(schema.collegeDriveEmployers.employerId, employerId), eq(schema.collegeDriveEmployers.driveId, driveId), eq(schema.collegeDriveEmployers.status, "joined")))
    .returning({ exitedAt: schema.collegeDriveEmployers.exitedAt });
  if (!row?.exitedAt) return null;
  const [drive] = await db
    .select({ collegeId: schema.collegeDrives.collegeId, title: schema.collegeDrives.title, collegeName: schema.colleges.name })
    .from(schema.collegeDrives)
    .innerJoin(schema.colleges, eq(schema.colleges.id, schema.collegeDrives.collegeId))
    .where(eq(schema.collegeDrives.id, driveId))
    .limit(1);
  if (!drive) return { exitedAt: row.exitedAt };
  await logDriveActivity(db, { driveId, collegeId: drive.collegeId, employerId, action: "exited_drive_early" });
  const [employer] = await db
    .select({ company: schema.employers.companyName, name: schema.employers.name, email: schema.employers.companyEmail })
    .from(schema.employers)
    .where(eq(schema.employers.id, employerId))
    .limit(1);
  const summary = await driveActivitySummary(driveId, employerId, db);
  await notifyOfficersOfExit({
    collegeId: drive.collegeId,
    collegeName: drive.collegeName,
    driveTitle: drive.title,
    company: employer?.company ?? "A company",
    contact: [employer?.name, employer?.email].filter(Boolean).join(", "),
    exitedAt: row.exitedAt,
    summary,
  });
  return { exitedAt: row.exitedAt };
}

/** The officer's email when a company leaves early. Exported for the test seam; never throws. */
export async function notifyOfficersOfExit(input: {
  collegeId: string;
  collegeName: string;
  driveTitle: string;
  company: string;
  contact: string;
  exitedAt: Date;
  summary: Record<string, number>;
}): Promise<void> {
  await mailCollegeOfficers(input.collegeId, emails.collegeDriveEmployerExited(input));
}

/** `viewed_candidates`, at most once per company, drive and India day: enough for the officer, not a row per page load. */
export async function logDriveViewOncePerDay(driveId: string, collegeId: string, employerId: string, db: Db = getDb()): Promise<void> {
  try {
    const [seen] = await db
      .select({ id: schema.driveActivityLogs.id })
      .from(schema.driveActivityLogs)
      .where(
        and(
          eq(schema.driveActivityLogs.driveId, driveId),
          eq(schema.driveActivityLogs.employerId, employerId),
          eq(schema.driveActivityLogs.action, "viewed_candidates"),
          sql`(${schema.driveActivityLogs.createdAt} AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date = (now() AT TIME ZONE 'Asia/Kolkata')::date`,
        ),
      )
      .limit(1);
    if (!seen) await logDriveActivity(db, { driveId, collegeId, employerId, action: "viewed_candidates" });
  } catch (err) {
    console.error("[drive-activity] view log", err);
  }
}
