import { and, eq, gte, inArray, lte, sql, type AnyColumn, type SQL } from "drizzle-orm";

import { realEmployerId } from "@/lib/admin/scope";
import { getDb, schema } from "@/lib/db";
import { interviewLifecycle } from "@/lib/interview-lifecycle";
import { feedbackForIntern } from "@/lib/interview-feedback";
import { interviewMeetStatus } from "./meet-outcome";
import type { Drive } from "./scope";

/** Plain `timestamp` columns hold UTC wall time; read them as instants (as drive-board-db.ts does). */
const utc = (col: AnyColumn) => sql<Date>`(${col} AT TIME ZONE 'UTC')`.mapWith((v: string | Date) => new Date(v));
const utcOrNull = (col: AnyColumn) => sql<string | null>`(${col} AT TIME ZONE 'UTC')`;

/** A meet in the drive, in the drive-call vocabulary: requested | accepted | completed | missed | declined | expired | cancelled, and unmarked (meet-outcome.ts). */
export type DriveMeetRow = {
  userId: string; employerId: string; status: string; createdAt: Date; startsAt: Date | null; respondedAt: Date | null;
  /** Why a cancelled meet was called off, in the words of whoever cancelled it (cancelledBy: employer | intern | admin). */
  reason?: string | null;
  cancelledBy?: string | null;
  /** A conducted or missed interview: the company's feedback, as the student sees it (contact details scrubbed). */
  feedback?: string | null;
};

const at = (v: string | null | undefined): Date | null => (v ? new Date(v) : null);

/**
 * Interviews a company in the drive scheduled with the drive's students (the three-slot invite, not the drive's instant
 * call), counted for the drive when sent inside its window: the rule offers already follow. Their state comes from
 * interview-lifecycle.ts, so a picked slot that passed unmarked reads expired here as it does for the employer.
 */
export async function loadDriveInterviews(drive: Drive, studentIds: string[], employerIds: string[], now = Date.now()): Promise<DriveMeetRow[]> {
  if (!studentIds.length || !employerIds.length) return [];
  const i = schema.interviews;
  const end = drive.revokedAt && drive.revokedAt < drive.endsAt ? drive.revokedAt : drive.endsAt;
  return interviewMeets(and(inArray(i.internId, studentIds), inArray(i.employerId, employerIds), gte(i.createdAt, drive.startsAt), lte(i.createdAt, end)), now);
}

/** Interviews matching `where` (from real employers), each as a meet in the drive-call vocabulary. */
async function interviewMeets(where: SQL | undefined, now: number): Promise<DriveMeetRow[]> {
  const i = schema.interviews;
  const rows = await getDb()
    .select({
      userId: i.internId,
      employerId: i.employerId,
      status: i.status,
      createdAt: utc(i.createdAt),
      updatedAt: utcOrNull(i.updatedAt),
      slot1: utcOrNull(i.slot1),
      slot2: utcOrNull(i.slot2),
      slot3: utcOrNull(i.slot3),
      selectedSlot: i.selectedSlot,
      respondBy: utcOrNull(i.respondBy),
      cancelReason: i.cancelReason,
      cancelledBy: i.cancelledBy,
      notes: i.notes,
    })
    .from(i)
    .where(and(where, realEmployerId(i.employerId)));
  const out: DriveMeetRow[] = [];
  for (const r of rows) {
    const slots = [at(r.slot1), at(r.slot2), at(r.slot3)];
    const picked = r.selectedSlot && r.selectedSlot >= 1 && r.selectedSlot <= 3 ? slots[r.selectedSlot - 1] : null;
    const life = interviewLifecycle({ status: r.status, slot1: slots[0], slot2: slots[1], slot3: slots[2], selectedSlot: r.selectedSlot, respondBy: at(r.respondBy), employerId: r.employerId }, now);
    const status = interviewMeetStatus(life.state, Boolean(picked));
    if (status === null) continue;
    const answeredAt = status === "requested" || status === "expired" ? null : at(r.updatedAt);
    out.push({
      userId: r.userId, employerId: r.employerId, status, createdAt: r.createdAt, startsAt: picked, respondedAt: answeredAt,
      ...(status === "cancelled" ? { reason: r.cancelReason?.trim() || null, cancelledBy: r.cancelledBy } : {}),
      ...(status === "completed" || status === "missed" ? { feedback: feedbackForIntern(r.notes) || null } : {}),
    });
  }
  return out;
}

/**
 * Every meet of a drive: its instant calls and the interviews its companies scheduled with its students inside the
 * window. The ONE loader for a drive's meetings: the board, the drives list, the summary and the employers table all
 * read this, and count it by meet-outcome.ts, so their numbers agree.
 */
export async function loadDriveMeets(drive: Drive, studentIds: string[], employerIds: string[], now = Date.now()): Promise<DriveMeetRow[]> {
  const m = schema.collegeDriveMeetings;
  const [calls, interviews] = await Promise.all([
    getDb()
      .select({ userId: m.userId, employerId: m.employerId, status: m.status, createdAt: utc(m.createdAt), startsAt: utc(m.startsAt), respondedAt: utcOrNull(m.respondedAt) })
      .from(m)
      .where(eq(m.driveId, drive.id)),
    loadDriveInterviews(drive, studentIds, employerIds, now),
  ]);
  return [...calls.map((c) => ({ ...c, respondedAt: at(c.respondedAt) })), ...interviews];
}

/**
 * Every meet a college's students had, from any employer at any time (the dashboard and Master data): their
 * interviews, and the calls in this college's drives. Same mapping as a drive's meets, counted by meet-outcome.ts.
 */
export async function loadCollegeMeets(collegeId: string, studentIds: string[], now = Date.now()): Promise<(DriveMeetRow & { call: boolean })[]> {
  if (!studentIds.length) return [];
  const m = schema.collegeDriveMeetings;
  const d = schema.collegeDrives;
  const [calls, interviews] = await Promise.all([
    getDb()
      .select({ userId: m.userId, employerId: m.employerId, status: m.status, createdAt: utc(m.createdAt), startsAt: utc(m.startsAt), respondedAt: utcOrNull(m.respondedAt) })
      .from(m)
      .innerJoin(d, eq(d.id, m.driveId))
      .where(and(eq(d.collegeId, collegeId), inArray(m.userId, studentIds))),
    interviewMeets(inArray(schema.interviews.internId, studentIds), now),
  ]);
  return [...calls.map((c) => ({ ...c, respondedAt: at(c.respondedAt), call: true })), ...interviews.map((x) => ({ ...x, call: false }))];
}
