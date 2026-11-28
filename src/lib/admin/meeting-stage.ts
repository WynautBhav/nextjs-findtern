/**
 * The one stage of an admin-side meeting: an employer interview (`interviews`, never the AI interview) or a campus drive
 * call (`college_drive_meetings`). Built on the app's own chain, never re-derived: interviewLifecycle (a picked time that
 * passed unmarked reads expired) -> interviewMeetStatus -> meetOutcome -> MEET_STAGE, exactly as the college screens:
 * a meeting nobody accepted (declined, or not answered in time) is Expired, with "Not accepted" as its sub-label.
 *
 * Both /admin/meetings and the admin dashboard read this, so their numbers are the same. Pure, so `node --test` runs it.
 */
import { interviewLifecycle } from "../interview-lifecycle.ts";
import { interviewMeetStatus, meetOutcome, MEET_STAGE, type MeetOutcome } from "../college/meet-outcome.ts";
import { formatDate, formatIstClock, shortDate } from "../format.ts";
import { HEAT_LABEL, heatSortKey, type Heat, type HeatLevel } from "./heat.ts";
import { meetingHeat } from "./meeting-heat.ts";

/** The shared MEET_STAGE keys (sent = waiting for a reply, accepted = upcoming). */
export const MEETING_STAGES = ["sent", "accepted", "completed", "expired", "withdrawn"] as const;
export type MeetingStage = (typeof MEETING_STAGES)[number];

export const MEETING_STAGE_LABEL: Record<MeetingStage, string> = {
  sent: "Waiting for a reply",
  accepted: "Upcoming",
  completed: "Completed",
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

/** Why an expired meeting expired, in a few words (the sub-label under its status). */
export const EXPIRED_WHY: Partial<Record<MeetOutcome, string>> = {
  not_accepted: "Not accepted",
  missed: "Student didn't join",
  not_joined: "No record both joined",
  not_closed: "Time passed, not marked",
};

/** The meeting's stage, or null for a rescheduled invite (a newer invite replaced it and is the meeting). */
export function meetingStage(m: MeetingInput, now: number): MeetingStage | null {
  const o = meetingOutcome(m, now);
  return o === null ? null : MEET_STAGE[o];
}

/** The meeting's outcome in the shared vocabulary (meet-outcome.ts), or null for a rescheduled invite. */
export function meetingOutcome(m: MeetingInput, now: number): MeetOutcome | null {
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
  return meetOutcome({ status, startsAt, cancelledBy: m.cancelledBy }, now);
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
  /** What became of it, in the shared vocabulary (meet-outcome.ts): the expired sub-label comes from this. */
  outcome: MeetOutcome;
  internId: string;
  candidate: string;
  employerId: string;
  company: string;
  projectId: string | null;
  project: string | null;
  track: "internship" | "full_time";
  /** The project's "full-time role after the internship" answer (projects.fullTimeOffer); a note only, never the type. */
  ftAfterInternship?: boolean;
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
  /** hot | warm | calm | closed (meeting-heat.ts). */
  heat?: string;
};

/** A listed meeting with its heat (null = closed). */
export type MeetingListRow = MeetingRow & { heat: Heat | null };
export const HEAT_FILTERS = ["hot", "warm", "calm", "closed"] as const;
export const heatBucket = (h: Heat | null): HeatLevel | "closed" => (h ? h.level : "closed");

/**
 * Booked and still to come, with no meeting link saved: an admin must add one or neither side can join. Interviews
 * only, and only once a slot is picked (the link route refuses one before that). Drive calls never qualify: a call is
 * created with its link or not at all (college/meetings.ts). SQL twin: meetingsNoLinkWhere() in meetings-load.ts.
 */
export const needsMeetingLink = (r: Pick<MeetingRow, "kind" | "stage" | "startsAt" | "meetingLink">): boolean =>
  r.kind === "interview" && r.stage === "accepted" && r.startsAt !== null && !(r.meetingLink ?? "").trim();

export const isMeetingStage = (v: string | undefined): v is MeetingStage => (MEETING_STAGES as readonly string[]).includes(v ?? "");

/** Every filter except the stage: the stage cards count these rows, and a card's list is `inStage` of them. */
export function filterMeetings<T extends MeetingRow & { heat?: Heat | null }>(rows: T[], f: MeetingFilters): T[] {
  const heat = (HEAT_FILTERS as readonly string[]).includes(f.heat ?? "") ? f.heat : null;
  const q = (f.q ?? "").trim().toLowerCase();
  return rows.filter(
    (r) =>
      (!q || [r.candidate, r.company, r.project ?? "", r.driveTitle ?? ""].some((s) => s.toLowerCase().includes(q))) &&
      (f.type !== "internship" && f.type !== "full_time" ? true : r.track === f.type) &&
      (f.source === "campus" ? r.campus : f.source === "direct" ? !r.campus : true) &&
      (!f.company || r.employerId === f.company) &&
      (!f.nolink || needsMeetingLink(r)) &&
      (!heat || (r.heat !== undefined && heatBucket(r.heat) === heat)),
  );
}

export const MEETING_SORTS = ["heat", "candidate", "company", "scheduled", "created"] as const;
/** Hottest first; closed rows after the open ones, newest first. */
export const MEETING_DEFAULT_SORT = { key: "heat", dir: "desc" } as const;
export type MeetingSort = (typeof MEETING_SORTS)[number];

export function sortMeetings<T extends MeetingRow & { heat?: Heat | null }>(rows: T[], key: MeetingSort, dir: "asc" | "desc"): T[] {
  const sign = dir === "asc" ? 1 : -1;
  const newest = (a: T, b: T) => (b.createdAt ?? "").localeCompare(a.createdAt ?? "");
  if (key === "heat") {
    // Open rows by score (either direction); closed rows always after them, newest first.
    return [...rows].sort((a, b) => {
      const x = heatSortKey(a.heat ?? null);
      const y = heatSortKey(b.heat ?? null);
      if ((x < 0) !== (y < 0)) return x < 0 ? 1 : -1;
      return sign * (x - y) || newest(a, b);
    });
  }
  const val = (r: MeetingRow): string =>
    key === "candidate" ? r.candidate.toLowerCase() : key === "company" ? r.company.toLowerCase() : key === "scheduled" ? (r.startsAt ?? "") : (r.createdAt ?? "");
  // Rows with no value (no time picked) go last either way; ties keep the newest first.
  return [...rows].sort((a, b) => {
    const x = val(a);
    const y = val(b);
    if (!x !== !y) return x ? -1 : 1;
    return sign * x.localeCompare(y) || newest(a, b);
  });
}

export const TRACK_LABEL = { internship: "Internship", full_time: "Full-time" } as const;
export const sourceLabel = (r: Pick<MeetingRow, "campus">) => (r.campus ? "Campus drive" : "Direct");

/** One time, as admins read it everywhere: India time, "3 Dec, 2:53 PM IST". */
export const slotText = (iso: string): string => `${shortDate(new Date(iso), { day: "numeric", month: "short" })}, ${formatIstClock(iso)}`;

/** The scheduled time: the picked slot, else how many slots are on offer (sorting and the dashboard use this). */
export function scheduledText(r: Pick<MeetingRow, "startsAt" | "slots">): string {
  if (r.startsAt) return slotText(r.startsAt);
  return r.slots.length ? `Slots offered: ${r.slots.length}` : "No time offered";
}

/** Every offered time with the picked one marked. A drive call has one time, which is its booked time. */
export function slotList(r: Pick<MeetingRow, "slots" | "startsAt">): { at: string; picked: boolean }[] {
  return r.slots.map((at) => ({ at, picked: at === r.startsAt }));
}

export const IST_ZONE_ID = "Asia/Kolkata";
const IST_IDS = new Set(["Asia/Kolkata", "Asia/Calcutta", "IST"]);

/** The zone the meeting is set in: the interview's own; a drive call stores none and runs in India, so IST. */
export const meetingZone = (r: Pick<MeetingRow, "timezone">): string => r.timezone?.trim() || IST_ZONE_ID;

/**
 * Times stay in IST for admins. When the meeting is set in another zone, one line says so, with the booked time there:
 * "Meeting time zone: Europe/London (9:23 AM GMT there)". Null for IST meetings (and for a zone the runtime can't read).
 */
export function zoneNote(r: Pick<MeetingRow, "timezone" | "startsAt">): string | null {
  const zone = meetingZone(r);
  if (IST_IDS.has(zone)) return null;
  try {
    return `Meeting time zone: ${zone}${r.startsAt ? ` (${formatIstClock(r.startsAt, zone)} there)` : ""}`;
  } catch {
    return `Meeting time zone: ${zone}`;
  }
}

/** The status line: the stage, and for an expired meeting why ("Expired · Not accepted"). */
export const statusText = (r: Pick<MeetingRow, "stage" | "outcome">): string =>
  r.stage === "expired" && EXPIRED_WHY[r.outcome] ? `${MEETING_STAGE_LABEL.expired} · ${EXPIRED_WHY[r.outcome]}` : MEETING_STAGE_LABEL[r.stage];

/**
 * "Feedback or reason": completed -> the employer's feedback (meetingDetail: "No feedback written" when none); withdrawn
 * -> who called it off and why (meetingDetail); expired -> the reason someone gave, if any. Null otherwise (shown "–").
 */
export function feedbackOrReason(r: Pick<MeetingRow, "stage" | "feedback" | "reason" | "cancelReason">): string | null {
  if (r.stage === "completed") return r.feedback;
  if (r.stage === "withdrawn") return r.reason;
  if (r.stage === "expired") return r.cancelReason?.trim() || null;
  return null;
}

/** The slots cell as text (CSV): each time, the picked one marked, and the zone line. */
/** No slot picked: "Not picked yet" while the meeting is open, "Not picked" once it is closed. */
export const notPickedText = (r: Pick<MeetingRow, "stage">): string => (r.stage === "sent" || r.stage === "accepted" ? "Not picked yet" : "Not picked");

export function slotsCsv(r: Pick<MeetingRow, "slots" | "startsAt" | "timezone" | "stage">): string {
  const list = slotList(r);
  if (!list.length) return "No time offered";
  const times = list.map((s) => `${slotText(s.at)}${s.picked ? " (picked)" : ""}`).join("; ");
  const zone = zoneNote(r);
  return [times, r.startsAt ? null : notPickedText(r), zone].filter(Boolean).join(" · ");
}

export const MEETING_COLUMNS = ["Candidate", "Employer", "Type", "Round", "Status", "Heat", "Slots", "Feedback or reason", "Created"] as const;

/** The heat cell as text: "Hot 82: No meeting link · Starts in 5 h", or "Closed". */
export const heatText = (h: Heat | null): string => (h ? `${HEAT_LABEL[h.level]} ${h.score}: ${h.why}` : "Closed");

export function meetingCsvRow(r: MeetingListRow): Record<(typeof MEETING_COLUMNS)[number], string> {
  return {
    Candidate: r.candidate,
    Employer: r.project ? `${r.company} · ${r.project}` : r.company,
    Type: `${TRACK_LABEL[r.track]} · ${sourceLabel(r)}`,
    Round: r.round == null ? "" : String(r.round),
    Status: statusText(r),
    Heat: heatText(r.heat),
    Slots: slotsCsv(r),
    "Feedback or reason": feedbackOrReason(r) ?? "",
    Created: formatDate(r.createdAt),
  };
}

/**
 * The page's list from its URL params: the page and the CSV export both call this, so the file holds exactly the rows
 * the table pages through, the cards count exactly what their press shows, and the chip counts what `?nolink=1` shows.
 */
export function listMeetings(all: MeetingRow[], params: Record<string, string>, sort: { key: MeetingSort; dir: "asc" | "desc" }, now: number = Date.now()) {
  const f: MeetingFilters = { q: (params.q ?? "").trim(), type: params.type, source: params.source, company: params.company, heat: params.heat };
  const nolink = params.nolink === "1";
  const stage: MeetingStage | "" = isMeetingStage(params.stage) ? params.stage : "";
  const rows: MeetingListRow[] = all.map((r) => ({ ...r, heat: meetingHeat(r, now) }));
  const noLinkCount = filterMeetings(rows, { ...f, nolink: true }).length;
  const base = filterMeetings(rows, { ...f, nolink });
  const counts = stageCounts(base);
  const listed = sortMeetings(stage ? inStage(base, stage) : base, sort.key, sort.dir);
  return { stage, nolink, noLinkCount, counts, listed };
}
