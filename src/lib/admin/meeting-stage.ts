/**
 * The one stage of an admin-side meeting: an employer interview (`interviews`, never the AI interview) or a campus drive
 * call (`college_drive_meetings`). Built on the app's own chain, never re-derived: interviewLifecycle (a picked time that
 * passed unmarked reads expired) -> interviewMeetStatus -> meetOutcome -> MEET_STAGE. The one split the college screens do
 * not make: a meeting the student (or employer) said no to is Declined here, not folded into Expired.
 *
 * Both /admin/meetings and the admin dashboard read this, so their numbers are the same. Pure, so `node --test` runs it.
 */
import { interviewLifecycle } from "../interview-lifecycle.ts";
import { interviewMeetStatus, meetOutcome, MEET_STAGE } from "../college/meet-outcome.ts";
import { formatDate, formatIstClock, shortDate } from "../format.ts";

/** Same keys the dashboard already used (sent = waiting for a reply, accepted = upcoming), plus declined. */
export const MEETING_STAGES = ["sent", "accepted", "completed", "declined", "expired", "withdrawn"] as const;
export type MeetingStage = (typeof MEETING_STAGES)[number];

export const MEETING_STAGE_LABEL: Record<MeetingStage, string> = {
  sent: "Waiting for a reply",
  accepted: "Upcoming",
  completed: "Completed",
  declined: "Declined",
  expired: "Expired",
  withdrawn: "Withdrawn",
};

type When = Date | null;
export type MeetingInput =
  | { kind: "interview"; status: string; slot1: When; slot2: When; slot3: When; selectedSlot: number | null; respondBy: When; cancelledBy: string | null }
  | { kind: "call"; status: string; startsAt: When; cancelledBy: string | null };

/** The slot the candidate picked, or null. */
export function pickedSlot(m: { slot1: When; slot2: When; slot3: When; selectedSlot: number | null }): When {
  const n = m.selectedSlot;
  return n && n >= 1 && n <= 3 ? [m.slot1, m.slot2, m.slot3][n - 1] : null;
}

/** The meeting's stage, or null for a rescheduled invite (a newer invite replaced it and is the meeting). */
export function meetingStage(m: MeetingInput, now: number): MeetingStage | null {
  let status: string;
  let startsAt: When;
  if (m.kind === "interview") {
    startsAt = pickedSlot(m);
    const life = interviewLifecycle({ status: m.status, slot1: m.slot1, slot2: m.slot2, slot3: m.slot3, selectedSlot: m.selectedSlot, respondBy: m.respondBy }, now);
    const s = interviewMeetStatus(life.state, startsAt !== null);
    if (s === null) return null;
    status = s;
  } else {
    status = m.status;
    startsAt = m.startsAt;
  }
  if (status === "declined" || status === "rejected") return "declined";
  return MEET_STAGE[meetOutcome({ status, startsAt, cancelledBy: m.cancelledBy }, now)];
}

/** The rows a stage card opens. The card's number is this list's length. */
export const inStage = <T extends { stage: MeetingStage }>(rows: T[], stage: MeetingStage): T[] => rows.filter((r) => r.stage === stage);

export function stageCounts(rows: { stage: MeetingStage }[]): Record<MeetingStage | "total", number> {
  const out = { total: rows.length } as Record<MeetingStage | "total", number>;
  for (const s of MEETING_STAGES) out[s] = inStage(rows, s).length;
  return out;
}

export type MeetingRow = {
  id: string;
  kind: "interview" | "call";
  stage: MeetingStage;
  internId: string;
  candidate: string;
  employerId: string;
  company: string;
  projectId: string | null;
  project: string | null;
  track: "internship" | "full_time";
  /** A campus drive call, or an interview from a drive (its offer came through a drive, or the company was in a drive of the student's college then). */
  campus: boolean;
  driveTitle: string | null;
  round: number | null;
  /** The row's own status as stored (interviews.status or the call's status). */
  status: string;
  /** Offered slots (an interview has up to three; a call has its one start time). ISO. */
  slots: string[];
  /** The time it happens: the picked slot, or the call's start. */
  startsAt: string | null;
  timezone: string | null;
  proposedBy: string | null;
  respondBy: string | null;
  meetingLink: string | null;
  employerJoinedAt: string | null;
  cancelledBy: string | null;
  cancelReason: string | null;
  notes: string | null;
  /** Withdrawn: who and why. Completed: the employer's feedback (dashboard-board-pure meetingDetail). */
  reason: string | null;
  feedback: string | null;
  proposalId: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

/* ── The list: filters, sort, and the columns the table and its CSV share ─────────────────────────────── */

export type MeetingFilters = {
  q?: string;
  /** internship | full_time */
  type?: string;
  /** campus | direct */
  source?: string;
  /** An employer id. */
  company?: string;
  stage?: string;
  /** Only meetings that need a link saved (needsMeetingLink). */
  nolink?: boolean;
};

/**
 * Booked and still to come, with no meeting link saved: an admin must add one or neither side can join. Interviews
 * only, and only once a slot is picked (the link route refuses one before that). Drive calls never qualify: a call is
 * created with its link or not at all (college/meetings.ts). SQL twin: meetingsNoLinkWhere() in meetings-load.ts.
 */
export const needsMeetingLink = (r: Pick<MeetingRow, "kind" | "stage" | "startsAt" | "meetingLink">): boolean =>
  r.kind === "interview" && r.stage === "accepted" && r.startsAt !== null && !(r.meetingLink ?? "").trim();

export const isMeetingStage = (v: string | undefined): v is MeetingStage => (MEETING_STAGES as readonly string[]).includes(v ?? "");

/** Every filter except the stage: the stage cards count these rows, and a card's list is `inStage` of them. */
export function filterMeetings(rows: MeetingRow[], f: MeetingFilters): MeetingRow[] {
  const q = (f.q ?? "").trim().toLowerCase();
  return rows.filter(
    (r) =>
      (!q || [r.candidate, r.company, r.project ?? "", r.driveTitle ?? ""].some((s) => s.toLowerCase().includes(q))) &&
      (f.type !== "internship" && f.type !== "full_time" ? true : r.track === f.type) &&
      (f.source === "campus" ? r.campus : f.source === "direct" ? !r.campus : true) &&
      (!f.company || r.employerId === f.company) &&
      (!f.nolink || needsMeetingLink(r)),
  );
}

export const MEETING_SORTS = ["candidate", "company", "scheduled", "created"] as const;
export type MeetingSort = (typeof MEETING_SORTS)[number];

export function sortMeetings(rows: MeetingRow[], key: MeetingSort, dir: "asc" | "desc"): MeetingRow[] {
  const val = (r: MeetingRow): string =>
    key === "candidate" ? r.candidate.toLowerCase() : key === "company" ? r.company.toLowerCase() : key === "scheduled" ? (r.startsAt ?? "") : (r.createdAt ?? "");
  const sign = dir === "asc" ? 1 : -1;
  // Rows with no value (no time picked) go last either way; ties keep the newest first.
  return [...rows].sort((a, b) => {
    const x = val(a);
    const y = val(b);
    if (!x !== !y) return x ? -1 : 1;
    return sign * x.localeCompare(y) || (b.createdAt ?? "").localeCompare(a.createdAt ?? "");
  });
}

export const TRACK_LABEL = { internship: "Internship", full_time: "Full-time" } as const;
export const sourceLabel = (r: Pick<MeetingRow, "campus">) => (r.campus ? "Campus drive" : "Direct");

/** The scheduled cell: the picked time, else how many slots are on offer. */
export function scheduledText(r: Pick<MeetingRow, "startsAt" | "slots" | "timezone">): string {
  if (r.startsAt) return `${shortDate(new Date(r.startsAt), { day: "numeric", month: "short" })}, ${formatIstClock(r.startsAt)}`;
  return r.slots.length ? `Slots offered: ${r.slots.length}` : "No time offered";
}

/** The table's columns, in order; the CSV uses exactly these. */
export const MEETING_COLUMNS = ["Candidate", "Employer", "Type", "Round", "Status", "Scheduled", "Created"] as const;

export function meetingCsvRow(r: MeetingRow): Record<(typeof MEETING_COLUMNS)[number], string> {
  return {
    Candidate: r.candidate,
    Employer: r.project ? `${r.company} · ${r.project}` : r.company,
    Type: `${TRACK_LABEL[r.track]} · ${sourceLabel(r)}`,
    Round: r.round == null ? "" : String(r.round),
    Status: MEETING_STAGE_LABEL[r.stage],
    Scheduled: scheduledText(r),
    Created: formatDate(r.createdAt),
  };
}

/**
 * The page's list from its URL params: the page and the CSV export both call this, so the file holds exactly the rows
 * the table pages through, the cards count exactly what their press shows, and the chip counts what `?nolink=1` shows.
 */
export function listMeetings(all: MeetingRow[], params: Record<string, string>, sort: { key: MeetingSort; dir: "asc" | "desc" }) {
  const f: MeetingFilters = { q: (params.q ?? "").trim(), type: params.type, source: params.source, company: params.company };
  const nolink = params.nolink === "1";
  const stage: MeetingStage | "" = isMeetingStage(params.stage) ? params.stage : "";
  const noLinkCount = filterMeetings(all, { ...f, nolink: true }).length;
  const base = filterMeetings(all, { ...f, nolink });
  const counts = stageCounts(base);
  const listed = sortMeetings(stage ? inStage(base, stage) : base, sort.key, sort.dir);
  return { stage, nolink, noLinkCount, counts, listed };
}

