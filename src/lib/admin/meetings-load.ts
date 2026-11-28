/**
 * Every employer–student meeting, for /admin/meetings and the admin dashboard: employer interviews (`interviews`, not
 * the AI interview) and campus drive calls (`college_drive_meetings`). Each row's stage comes from meeting-stage.ts, so
 * a stage card, its filtered list and the dashboard's meetings line are the same rows. Read-only.
 */
import { sql, type SQL, type SQLWrapper } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { realEmployers } from "@/lib/admin/scope";
import { MEETING_MINUTES as CALL_MINUTES } from "@/lib/college/constants";
import { meetingDetail } from "@/lib/admin/dashboard-board-pure";
import { meetingStage, pickedSlot, type MeetingRow } from "@/lib/admin/meeting-stage";

export type { MeetingRow };
import { parseOffer } from "@/lib/offer";


/**
 * Whose meetings count: an employer that still has its row and is not a test or AI employer. The ONE clause for the
 * loader below and meetingsNoLinkWhere, so the page, the dashboard, its queue and the rail badge select the same set
 * (realEmployerId alone would keep an interview whose employer row is gone). Planned as a hashed semi-join, no per-row cost.
 */
export function meetingEmployerScope(employerIdCol: SQLWrapper): SQL {
  return sql`${employerIdCol} IN (SELECT ${schema.employers.id} FROM ${schema.employers} WHERE ${realEmployers()})`;
}

/**
 * SQL twin of needsMeetingLink (meeting-stage.ts) over the unaliased `interviews` table: a real employer's interview
 * that is booked (scheduled with a picked slot) and still Upcoming by the stage rule (meetOutcome reads a booked
 * meeting as over CALL_MINUTES after it starts, before interviewLifecycle's 30), with no link saved. The dashboard
 * queue and the rail badge count this; /admin/meetings?nolink=1 lists the same rows.
 */
export function meetingsNoLinkWhere(): SQL {
  const iv = schema.interviews;
  const slot = sql`(CASE ${iv.selectedSlot} WHEN 1 THEN ${iv.slot1} WHEN 2 THEN ${iv.slot2} WHEN 3 THEN ${iv.slot3} END)`;
  return sql`(lower(trim(${iv.status})) = 'scheduled' AND ${meetingEmployerScope(iv.employerId)} AND ${slot} IS NOT NULL
    AND ${slot} + make_interval(mins => ${CALL_MINUTES}) > (now() AT TIME ZONE 'UTC') AND coalesce(trim(${iv.meetingLink}), '') = '')`;
}

/** Plain `timestamp` columns hold UTC wall time: read them as instants. */
const utc = (col: string) => sql.raw(`(${col} AT TIME ZONE 'UTC')`);
const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
const date = (v: unknown) => (v ? new Date(v as string) : null);
const str = (v: unknown) => (v == null || v === "" ? null : String(v));
const nameOf = (r: Record<string, unknown>) => `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim() || "Unnamed student";

export async function loadMeetings(now: Date = new Date()): Promise<{ rows: MeetingRow[] }> {
  const db = getDb();
  const NOW = now.getTime();
  const ex = (q: ReturnType<typeof sql>) => db.execute(q).then((r) => r.rows as Record<string, unknown>[]);

  const [interviews, calls] = await Promise.all([
    ex(sql`
      SELECT i.id, i.intern_id, i.employer_id, i.project_id, i.status, i.selected_slot, i.timezone, i.meeting_link, i.notes,
             i.proposed_by, i.round, i.cancelled_by, i.cancel_reason,
             ${utc("i.slot1")} AS slot1, ${utc("i.slot2")} AS slot2, ${utc("i.slot3")} AS slot3, ${utc("i.respond_by")} AS respond_by,
             ${utc("i.employer_joined_at")} AS employer_joined_at, ${utc("i.created_at")} AS created_at, ${utc("i.updated_at")} AS updated_at,
             u.first_name, u.last_name, ${schema.employers.companyName} AS company_name,
             pj.project_name, pj.full_time_offer,
             pr.id AS proposal_id, pr.offer_details, pr.currency,
             coalesce(pd.title, cd.title) AS drive_title, (pr.drive_id IS NOT NULL OR cd.id IS NOT NULL) AS campus
        FROM interviews i
        JOIN ${schema.employers} ON ${schema.employers.id} = i.employer_id
        LEFT JOIN users u ON u.id = i.intern_id
        LEFT JOIN projects pj ON pj.id = i.project_id
        LEFT JOIN LATERAL (SELECT p.id, p.offer_details, p.currency, p.drive_id FROM proposals p WHERE p.interview_id = i.id ORDER BY p.created_at DESC LIMIT 1) pr ON true
        LEFT JOIN college_drives pd ON pd.id = pr.drive_id
        -- The company was in a drive of the student's college when it sent the invite (the window drive-interviews-db.ts uses).
        LEFT JOIN LATERAL (
          SELECT d.id, d.title FROM college_drive_employers j
            JOIN college_drives d ON d.id = j.drive_id
            JOIN college_memberships m ON m.college_id = d.college_id AND m.user_id = i.intern_id AND m.left_at IS NULL
           WHERE j.employer_id = i.employer_id AND i.created_at >= d.starts_at AND i.created_at <= least(d.ends_at, coalesce(d.revoked_at, d.ends_at))
           ORDER BY d.starts_at DESC LIMIT 1) cd ON true
       WHERE ${meetingEmployerScope(sql.raw("i.employer_id"))}`),
    ex(sql`
      SELECT c.id, c.user_id, c.employer_id, c.status, c.meeting_link,
             ${utc("c.starts_at")} AS starts_at, ${utc("c.created_at")} AS created_at, ${utc("c.responded_at")} AS responded_at,
             u.first_name, u.last_name, ${schema.employers.companyName} AS company_name, d.title AS drive_title, d.kind AS drive_kind
        FROM college_drive_meetings c
        JOIN ${schema.employers} ON ${schema.employers.id} = c.employer_id
        LEFT JOIN users u ON u.id = c.user_id
        LEFT JOIN college_drives d ON d.id = c.drive_id
       WHERE ${meetingEmployerScope(sql.raw("c.employer_id"))}`),
  ]);

  const rows: MeetingRow[] = [];
  for (const r of interviews) {
    const m = {
      kind: "interview" as const, status: String(r.status ?? ""), slot1: date(r.slot1), slot2: date(r.slot2), slot3: date(r.slot3),
      selectedSlot: r.selected_slot == null ? null : Number(r.selected_slot), respondBy: date(r.respond_by), cancelledBy: str(r.cancelled_by),
    };
    const stage = meetingStage(m, NOW);
    if (stage === null) continue;
    const fullTime = r.full_time_offer === true || (r.proposal_id ? parseOffer(r.offer_details, str(r.currency)).fullTime !== null : false);
    rows.push({
      id: String(r.id), kind: "interview", stage, internId: String(r.intern_id), candidate: nameOf(r), employerId: String(r.employer_id),
      company: String(r.company_name ?? ""), projectId: str(r.project_id), project: str(r.project_name), track: fullTime ? "full_time" : "internship",
      campus: r.campus === true, driveTitle: str(r.drive_title), round: r.round == null ? null : Number(r.round), status: m.status,
      slots: [m.slot1, m.slot2, m.slot3].filter((d): d is Date => d !== null).map((d) => d.toISOString()), startsAt: iso(pickedSlot(m)),
      timezone: str(r.timezone), proposedBy: str(r.proposed_by), respondBy: iso(r.respond_by), meetingLink: str(r.meeting_link),
      employerJoinedAt: iso(r.employer_joined_at), cancelledBy: m.cancelledBy, cancelReason: str(r.cancel_reason), notes: str(r.notes),
      ...meetingDetail({ stage, cancelledBy: m.cancelledBy, cancelReason: str(r.cancel_reason), notes: str(r.notes) }),
      proposalId: str(r.proposal_id), createdAt: iso(r.created_at), updatedAt: iso(r.updated_at),
    });
  }
  for (const r of calls) {
    const status = String(r.status ?? "");
    const stage = meetingStage({ kind: "call", status, startsAt: date(r.starts_at), cancelledBy: null }, NOW);
    if (stage === null) continue;
    rows.push({
      id: String(r.id), kind: "call", stage, internId: String(r.user_id), candidate: nameOf(r), employerId: String(r.employer_id),
      company: String(r.company_name ?? ""), projectId: null, project: null, track: r.drive_kind === "full_time" ? "full_time" : "internship",
      campus: true, driveTitle: str(r.drive_title), round: null, status, slots: r.starts_at ? [iso(r.starts_at)!] : [], startsAt: iso(r.starts_at),
      timezone: null, proposedBy: "employer", respondBy: null, meetingLink: str(r.meeting_link), employerJoinedAt: null, cancelledBy: null,
      cancelReason: null, notes: null, ...meetingDetail({ stage, cancelledBy: null, cancelReason: null, notes: null }),
      proposalId: null, createdAt: iso(r.created_at), updatedAt: iso(r.responded_at),
    });
  }
  rows.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
  return { rows };
}
