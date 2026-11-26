import { and, gte, inArray, lte, sql, type AnyColumn } from "drizzle-orm";

import { realEmployerId } from "@/lib/admin/scope";
import { getDb, schema } from "@/lib/db";
import { interviewLifecycle } from "@/lib/interview-lifecycle";
import type { Drive } from "./scope";

/** Plain `timestamp` columns hold UTC wall time; read them as instants (as drive-board-db.ts does). */
const utc = (col: AnyColumn) => sql<Date>`(${col} AT TIME ZONE 'UTC')`.mapWith((v: string | Date) => new Date(v));
const utcOrNull = (col: AnyColumn) => sql<string | null>`(${col} AT TIME ZONE 'UTC')`;

/** A meet in the drive, in the drive-call vocabulary: requested | accepted | completed | missed | declined | expired | cancelled. */
export type DriveMeetRow = { userId: string; employerId: string; status: string; createdAt: Date; startsAt: Date | null; respondedAt: Date | null };

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
    })
    .from(i)
    .where(and(inArray(i.internId, studentIds), inArray(i.employerId, employerIds), gte(i.createdAt, drive.startsAt), lte(i.createdAt, end), realEmployerId(i.employerId)));
  const out: DriveMeetRow[] = [];
  for (const r of rows) {
    const slots = [at(r.slot1), at(r.slot2), at(r.slot3)];
    const picked = r.selectedSlot && r.selectedSlot >= 1 && r.selectedSlot <= 3 ? slots[r.selectedSlot - 1] : null;
    const life = interviewLifecycle({ status: r.status, slot1: slots[0], slot2: slots[1], slot3: slots[2], selectedSlot: r.selectedSlot, respondBy: at(r.respondBy), employerId: r.employerId }, now);
    // A rescheduled invite was replaced by a new one, which is counted: this one is no meet at all (not a cancelled one).
    if (life.state === "rescheduled") continue;
    const status =
      life.state === "upcoming" || life.state === "live" ? "accepted"
      : life.state === "awaiting_pick" ? "requested"
      : life.state === "completed" || life.state === "missed" || life.state === "declined" || life.state === "expired" ? life.state
      // Cancelled, and rescheduled (the invite was replaced by a new one), are not counted.
      : "cancelled";
    const answeredAt = status === "requested" || status === "expired" ? null : at(r.updatedAt);
    out.push({ userId: r.userId, employerId: r.employerId, status, createdAt: r.createdAt, startsAt: picked, respondedAt: answeredAt });
  }
  return out;
}
