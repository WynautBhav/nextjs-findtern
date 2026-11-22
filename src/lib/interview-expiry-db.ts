import { inArray, sql } from "drizzle-orm";

import { recordAdminAudit } from "@/lib/admin/audit";
import { getDb, schema } from "@/lib/db";
import { initialsOf } from "@/lib/employer-candidates";
import { formatSlotTime } from "@/lib/format";
import { MEETING_MINUTES, SWEEPABLE_STATUSES, interviewExpiryNotices, interviewNoticeDedupeKey, worthNotice } from "@/lib/interview-lifecycle";
import { timePassed } from "@/lib/interview-time-sql";
import { notify } from "@/lib/notify";

/**
 * Persists what every screen already shows (interview-lifecycle.ts): an interview still open (`pending`, `waiting`, `proposed`
 * or `scheduled`) whose time has passed becomes status `expired`.
 *   - booked: the picked slot started more than MEETING_MINUTES ago (nobody marked it completed, missed or cancelled);
 *   - invite: no usable pick and every offered slot has started.
 * `status` is plain text (no enum or check constraint), so there is no migration. Never touched: completed, missed, cancelled,
 * declined, rescheduled, already expired, an interview still ahead or running, and the AI interview (own expiry).
 *
 * Safety is the statement: one bounded UPDATE of at most MAX_ROWS ids picked `for update skip locked` (a row an employer is
 * marking completed right now is left for the next run, never overwritten), the status and the time rule re-asserted in the
 * UPDATE itself. Idempotent: a second run finds nothing. One strict audit row per row, same transaction. Notices go out after
 * the commit, only for interviews whose time passed in the last 48 h, at most one per side per interview (dedupe key).
 */

const MAX_ROWS = 500;
const SYSTEM_ACTOR = "system";
const AI_EMAIL = "ai-interview@findtern.ai";
const OPEN = sql.join(SWEEPABLE_STATUSES.map((s) => sql`${s}`), sql`, `);
const MINS = sql.raw(String(MEETING_MINUTES));

type Expired = {
  id: string;
  employerId: string;
  internId: string;
  projectId: string | null;
  timezone: string | null;
  previousStatus: string;
  booked: boolean;
  endsAt: string;
  slot: string | null;
};

export type InterviewSweep = { expired: number; ids: string[]; notified: number };

export async function expireInterviewsPastTime(now: Date = new Date()): Promise<InterviewSweep> {
  const nowIso = now.toISOString();
  const rows = await getDb().transaction(async (tx) => {
    const res = await tx.execute(sql`
      with picked as (
        select iv.id, iv.status as prev_status from interviews iv
         where iv.status in (${OPEN})
           and iv.employer_id <> 'admin'
           and not exists (select 1 from employers e where e.id = iv.employer_id and e.company_email = ${AI_EMAIL})
           and ${timePassed("iv", nowIso)}
         order by iv.id limit ${MAX_ROWS} for update skip locked),
      done as (
        update interviews i
           set status = 'expired', updated_at = ${nowIso}::timestamp
          from picked p
         where i.id = p.id and i.status = p.prev_status and i.status in (${OPEN}) and ${timePassed("i", nowIso)}
        returning i.id, i.employer_id, i.intern_id, i.project_id, i.timezone, i.selected_slot, i.slot1, i.slot2, i.slot3, p.prev_status)
      select id, employer_id as "employerId", intern_id as "internId", project_id as "projectId", timezone, prev_status as "previousStatus",
             (case selected_slot when 1 then slot1 when 2 then slot2 when 3 then slot3 end) is not null as booked,
             to_char(coalesce(case selected_slot when 1 then slot1 + make_interval(mins => ${MINS}) when 2 then slot2 + make_interval(mins => ${MINS}) when 3 then slot3 + make_interval(mins => ${MINS}) end, greatest(slot1, slot2, slot3)), 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "endsAt",
             to_char(case selected_slot when 1 then slot1 when 2 then slot2 when 3 then slot3 end, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as slot
        from done order by id`);
    const done = res.rows as Expired[];
    for (const r of done) {
      await recordAdminAudit(
        tx,
        {
          adminId: SYSTEM_ACTOR,
          action: "interview.expired",
          targetType: "interview",
          targetId: r.id,
          meta: { interviewId: r.id, employerId: r.employerId, internId: r.internId, previousStatus: r.previousStatus, reason: r.booked ? "time_passed_not_completed" : "invite_slots_passed", endedAt: r.endsAt },
        },
        { strict: true },
      );
    }
    return done;
  });
  const notified = await notifyExpired(rows, now);
  if (rows.length > 0) console.log(`[interview-expiry] expired ${rows.length} interview(s) whose time passed`);
  return { expired: rows.length, ids: rows.map((r) => r.id), notified };
}

async function notifyExpired(all: Expired[], now: Date): Promise<number> {
  const rows = all.filter((r) => worthNotice(Date.parse(r.endsAt), now.getTime()));
  if (rows.length === 0) return 0;
  const db = getDb();
  const projectIds = [...new Set(rows.map((r) => r.projectId).filter((p): p is string => Boolean(p)))];
  const projects = projectIds.length ? await db.select({ id: schema.projects.id, takenDownAt: schema.projects.takenDownAt }).from(schema.projects).where(inArray(schema.projects.id, projectIds)) : [];
  const down = new Set(projects.filter((p) => p.takenDownAt).map((p) => p.id));
  const users = await db
    .select({ id: schema.users.id, firstName: schema.users.firstName, lastName: schema.users.lastName })
    .from(schema.users)
    .where(inArray(schema.users.id, [...new Set(rows.map((r) => r.internId))]));
  const initials = new Map(users.map((u) => [u.id, initialsOf((u.firstName || "").trim(), (u.lastName || "").trim())]));
  let sent = 0;
  for (const r of rows) {
    try {
      const n = interviewExpiryNotices({
        interviewId: r.id,
        booked: r.booked,
        initials: initials.get(r.internId) ?? "the candidate",
        whenEmployer: r.slot ? formatSlotTime(r.slot, r.timezone || "Asia/Kolkata") : "",
        whenIntern: r.slot ? formatSlotTime(r.slot, "Asia/Kolkata") : "",
        employerTakenDown: Boolean(r.projectId && down.has(r.projectId)),
        // An offer that lapsed at its respond-by while a slot was still ahead.
        lapsed: !r.booked && Date.parse(r.endsAt) > now.getTime(),
      });
      if (n.employer) {
        if (await notify({ to: { type: "employer", id: r.employerId }, type: "interview_time_passed", title: n.employer.title, message: n.employer.message, data: n.employer.data, dedupeKey: interviewNoticeDedupeKey(r.id, "employer") })) sent++;
      }
      if (await notify({ to: { type: "intern", id: r.internId }, type: "interview_time_passed", title: n.intern.title, message: n.intern.message, data: n.intern.data, dedupeKey: interviewNoticeDedupeKey(r.id, "intern") })) sent++;
    } catch (err) {
      // A failed notice never undoes the expiry: the row is committed and a re-run would not re-send, so the loss is logged.
      console.error("[interview-expiry] notify failed", r.id, err);
    }
  }
  return sent;
}
