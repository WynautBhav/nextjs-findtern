import { CALL_GRACE_MS, MEETING_MINUTES } from "./constants.ts";
import { ago } from "./labels.ts";

/**
 * One campus drive, as the placement officer runs it: what needs chasing now (critical) and what the drive has
 * produced (results). Pure, so the counts can be tested without a database (drive-board-db.ts loads the rows).
 *
 * A proposal belongs to the drive when an employer who came in through the drive's link sent it to one of the
 * drive's students on or after the drive opened. Offers and hires carry no drive id, so this is the rule.
 */

export type DriveStudentRef = {
  userId: string;
  name: string;
  rollNo: string | null;
  year: number | null;
  branch: string | null;
  phone: string | null;
  /** The student's own "open to work" switch. Missing counts as on, so only an explicit false lands in "Not open to work". */
  openToWork?: boolean;
};
/** `again`: on a nudge-history row, the student still needs that nudge now (so a Nudge again button makes sense). */
export type BoardItem = DriveStudentRef & { detail: string; again?: boolean };

export type MeetingRow = {
  userId: string;
  company: string | null;
  status: string;
  createdAt: Date;
  /** When the call was set to start; a request lapses CALL_GRACE_MS after it (meetings.ts effectiveStatus). */
  startsAt?: Date;
};
/** pastStart: the offer's start day has begun (offer-start-sql.ts), so an unanswered one has lapsed, not waiting. */
export type OfferRow = { userId: string; company: string | null; status: string; hired: boolean; fullTime: boolean; createdAt: Date; pastStart?: boolean };
export type OfflineRow = { userId: string };
/** One nudge the officer sent (college_nudges), inside the drive's window. */
export type NudgeRow = { userId: string; kind: string; createdAt: Date };

/** The nudge kinds the board tracks, and the list each one fills. "interview" nudges are not part of a drive. */
export type NudgeHistoryKind = "online" | "open_to_work" | "meeting" | "offer";
export type NudgeKey = "nudgedOnline" | "nudgedOpenToWork" | "nudgedMeet" | "nudgedOffer";
export const NUDGE_KEY: Record<NudgeHistoryKind, NudgeKey> = { online: "nudgedOnline", open_to_work: "nudgedOpenToWork", meeting: "nudgedMeet", offer: "nudgedOffer" };

export type BoardKey =
  | "meetingsWaiting"
  | "offersWaiting"
  | "offline"
  | "online"
  | "notOpen"
  | "all"
  | "offers"
  | "declinedAll"
  | "unanswered"
  | "meetings"
  | "meetCompleted"
  | "meetExpired"
  | "internships"
  | "fullTime"
  | "called"
  | "hired"
  | NudgeKey;

export type DriveBoard = {
  lists: Record<BoardKey, BoardItem[]>;
  /** Offers counted one by one (a student can hold two); the list is per student. */
  offerCount: number;
  /** The same offers split by kind: an offer with a full-time / PPO part counts as full-time. */
  offerSplit: { internship: number; fullTime: number };
  /** Meet requests counted one by one (a student can have several): sent (not cancelled), accepted, completed, expired. */
  meetCounts: { sent: number; accepted: number; completed: number; expired: number };
  /** Each offer (with what became of it) and meet request in the drive, for the past-drive charts. */
  facts: {
    offers: { userId: string; company: string | null; at: Date; outcome: "accepted" | "declined" | "open"; fullTime: boolean }[];
    meets: { userId: string; company: string | null; at: Date }[];
  };
  /** Nudges sent, counted one by one (a student can be nudged three times); the list is per student. */
  nudgeCounts: Record<NudgeKey, number>;
  /** Offline is known only while the drive is live; null otherwise. */
  offlineKnown: boolean;
};

const HIRED = new Set(["hired", "completed"]);
/** The student said yes (the employer may not have paid yet), or was hired. */
const ACCEPTED = new Set(["accepted", "processing", "hired", "completed"]);
const DECLINED = new Set(["rejected", "declined"]);
const accepted = (o: OfferRow) => o.hired || ACCEPTED.has(o.status);
const declined = (o: OfferRow) => !o.hired && DECLINED.has(o.status);
const company = (c: string | null) => c?.trim() || "An employer";

/** Group rows per student, newest first, and describe them in one line. */
function perStudent<T extends { userId: string; createdAt: Date }>(rows: T[], students: Map<string, DriveStudentRef>, line: (rs: T[]) => string): BoardItem[] {
  const by = new Map<string, T[]>();
  for (const r of rows) if (students.has(r.userId)) by.set(r.userId, [...(by.get(r.userId) ?? []), r]);
  return [...by.entries()]
    .map(([id, rs]) => ({ rs: rs.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()), s: students.get(id)! }))
    .sort((a, b) => b.rs[0].createdAt.getTime() - a.rs[0].createdAt.getTime())
    .map(({ rs, s }) => ({ ...s, detail: line(rs) }));
}

/** "1 full-time offer", "2 internship offers", "1 full-time and 1 internship offer". */
const offerKinds = (rs: OfferRow[]) => {
  const ft = rs.filter((r) => r.fullTime).length;
  const it = rs.length - ft;
  if (ft && it) return `${ft} full-time and ${it} internship ${it === 1 ? "offer" : "offers"}`;
  return `${rs.length} ${ft ? "full-time" : "internship"} ${rs.length === 1 ? "offer" : "offers"}`;
};
const names = (rs: { company: string | null }[]) => [...new Set(rs.map((r) => company(r.company)))].join(", ");

/** "Nudged 3 times · last 2 h ago", one line per student, most-nudged first. */
function nudgeHistory(rows: NudgeRow[], kind: NudgeHistoryKind, students: Map<string, DriveStudentRef>, stillNeeds: Set<string>, now: number): BoardItem[] {
  const by = new Map<string, Date[]>();
  for (const r of rows) if (r.kind === kind && students.has(r.userId)) by.set(r.userId, [...(by.get(r.userId) ?? []), r.createdAt]);
  return [...by.entries()]
    .map(([id, times]) => ({ id, n: times.length, last: new Date(Math.max(...times.map((t) => t.getTime()))) }))
    .sort((a, b) => b.n - a.n || b.last.getTime() - a.last.getTime())
    .map(({ id, n, last }) => ({
      ...students.get(id)!,
      detail: `Nudged ${n === 1 ? "1 time" : `${n} times`} · last ${ago(last.toISOString(), now)}`,
      again: stillNeeds.has(id),
    }));
}

export function buildDriveBoard(input: {
  students: DriveStudentRef[];
  meetings: MeetingRow[];
  offers: OfferRow[];
  /** Students offline right now, or null when the drive is not live. */
  offline: OfflineRow[] | null;
  /** Nudges sent to the drive's students inside the drive's window. Optional: none. */
  nudges?: NudgeRow[];
  now: number;
}): DriveBoard {
  const students = new Map(input.students.map((s) => [s.userId, s]));
  const { now } = input;
  // Only requests the student can still accept: a lapsed one is expired for the student and the employer alike.
  const waiting = input.meetings.filter((m) => m.status === "requested" && (!m.startsAt || m.startsAt.getTime() + CALL_GRACE_MS >= now));
  // Accepted: the student said yes (a drive call), or picked a slot (an interview), whatever happened after.
  const held = input.meetings.filter((m) => m.status === "accepted" || m.status === "completed" || m.status === "missed");
  // Completed: an interview marked completed, or an accepted drive call whose slot is over (calls record no outcome).
  const done = held.filter((m) => m.status === "completed" || (m.status === "accepted" && m.startsAt && m.startsAt.getTime() + MEETING_MINUTES * 60_000 <= now));
  // Expired: marked so, or never answered by start + grace (meetings.ts effectiveStatus).
  const lapsed = input.meetings.filter((m) => m.status === "expired" || (m.status === "requested" && m.startsAt && m.startsAt.getTime() + CALL_GRACE_MS < now));
  const sentMeets = input.meetings.filter((m) => m.status !== "cancelled");
  const inDriveCount = (rs: MeetingRow[]) => rs.filter((m) => students.has(m.userId)).length;
  // Waiting on the student: sent, not hired, start day not begun (college count-rules offerWaitingSql). Past it the
  // offer lapsed ("deadline missed" in master data, "no response" for the student, "expired" for the employer).
  const open = input.offers.filter((o) => o.status === "sent" && !o.hired && !o.pastStart);
  const hired = input.offers.filter((o) => o.hired || HIRED.has(o.status));
  const inDrive = input.offers.filter((o) => students.has(o.userId));
  const hiredItems = perStudent(hired, students, (rs) => `${rs.some((r) => r.fullTime) ? "Full-time" : "Internship"} with ${names(rs)}`);

  // Past-drive answers, per student, from every offer they hold: none accepted but one declined; none answered at all
  // (still sent, or lapsed). A student who accepted one offer and left another open is in neither.
  const offersBy = new Map<string, OfferRow[]>();
  for (const o of inDrive) offersBy.set(o.userId, [...(offersBy.get(o.userId) ?? []), o]);
  const withOffers = (keep: (rs: OfferRow[]) => boolean) => [...offersBy.values()].filter(keep).flat();
  const declinedAll = withOffers((rs) => !rs.some(accepted) && rs.some(declined));
  const unanswered = withOffers((rs) => !rs.some(accepted) && !rs.some(declined));

  // Offline is known only while the drive is live; online is the rest of the drive's students.
  const offlineIds = new Set((input.offline ?? []).filter((o) => students.has(o.userId)).map((o) => o.userId));
  const waitingMeet = perStudent(waiting, students, (rs) => `${names(rs)} asked for a meet · ${ago(rs[0].createdAt.toISOString(), now)}`);
  const waitingOffer = perStudent(open, students, (rs) => `Offer from ${names(rs)} · sent ${ago(rs[0].createdAt.toISOString(), now)}`);
  const notOpen = input.students.filter((s) => s.openToWork === false).map((s) => ({ ...s, detail: "Open to work is off" }));
  const nudges = input.nudges ?? [];
  const needs: Record<NudgeHistoryKind, Set<string>> = {
    online: offlineIds,
    open_to_work: new Set(notOpen.map((s) => s.userId)),
    meeting: new Set(waitingMeet.map((s) => s.userId)),
    offer: new Set(waitingOffer.map((s) => s.userId)),
  };
  const nudged = (kind: NudgeHistoryKind) => nudgeHistory(nudges, kind, students, needs[kind], now);
  const nudgeTotal = (kind: NudgeHistoryKind) => nudges.filter((n) => n.kind === kind && students.has(n.userId)).length;
  return {
    offerCount: inDrive.length,
    facts: {
      offers: inDrive.map((o) => ({ userId: o.userId, company: o.company, at: o.createdAt, outcome: accepted(o) ? "accepted" : declined(o) ? "declined" : "open", fullTime: o.fullTime })),
      meets: sentMeets.filter((m) => students.has(m.userId)).map((m) => ({ userId: m.userId, company: m.company, at: m.createdAt })),
    },
    meetCounts: { sent: inDriveCount(sentMeets), accepted: inDriveCount(held), completed: inDriveCount(done), expired: inDriveCount(lapsed) },
    offerSplit: { internship: inDrive.filter((o) => !o.fullTime).length, fullTime: inDrive.filter((o) => o.fullTime).length },
    nudgeCounts: { nudgedOnline: nudgeTotal("online"), nudgedOpenToWork: nudgeTotal("open_to_work"), nudgedMeet: nudgeTotal("meeting"), nudgedOffer: nudgeTotal("offer") },
    offlineKnown: input.offline !== null,
    lists: {
      meetingsWaiting: waitingMeet,
      offersWaiting: waitingOffer,
      offline: [...offlineIds].map((id) => ({ ...students.get(id)!, detail: "Not on Findtern right now" })),
      online: input.offline === null ? [] : input.students.filter((s) => !offlineIds.has(s.userId)).map((s) => ({ ...s, detail: "On Findtern now" })),
      notOpen,
      all: input.students.map((s) => ({ ...s, detail: "" })),
      declinedAll: perStudent(declinedAll, students, (rs) => `Declined ${names(rs.filter(declined))}${rs.some((r) => !declined(r)) ? ` · no reply to ${names(rs.filter((r) => !declined(r)))}` : ""}`),
      unanswered: perStudent(unanswered, students, (rs) => `${rs.length === 1 ? "No reply to" : `No reply to ${rs.length} offers:`} ${names(rs)}`),
      nudgedOnline: nudged("online"),
      nudgedOpenToWork: nudged("open_to_work"),
      nudgedMeet: nudged("meeting"),
      nudgedOffer: nudged("offer"),
      offers: perStudent(inDrive, students, (rs) => `${offerKinds(rs)} · ${names(rs)}`),
      meetings: perStudent(held, students, (rs) => `${rs.length === 1 ? "Meet" : `${rs.length} meets`} with ${names(rs)}`),
      meetCompleted: perStudent(done, students, (rs) => `${rs.length === 1 ? "Meet" : `${rs.length} meets`} with ${names(rs)}`),
      meetExpired: perStudent(lapsed, students, (rs) => `${rs.length === 1 ? "1 meet expired" : `${rs.length} meets expired`} · ${names(rs)}`),
      internships: perStudent(hired.filter((o) => !o.fullTime), students, (rs) => `Internship with ${names(rs)}`),
      fullTime: perStudent(hired.filter((o) => o.fullTime), students, (rs) => `Full-time with ${names(rs)}`),
      // The pipeline's stages: any call request at all, and any hire (one row per student).
      // A request the company cancelled no longer counts, as a withdrawn offer does not count as an offer (master data agrees).
      called: perStudent(sentMeets, students, (rs) => `${rs.length === 1 ? "1 meet request" : `${rs.length} meet requests`} · ${names(rs)}`),
      hired: hiredItems,
    },
  };
}

export type Invite = { company: string; email: string };
export type CameEmployer = { employerId: string; company: string | null; contact: string | null; email: string | null; phone: string | null; joinedAt: Date; shortlisted?: number; calls?: number };

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase().replace(/\s+/g, " ").replace(/\b(pvt|private|ltd|limited|llp|inc)\b\.?/g, "").trim();

/**
 * Who the officer invited against who came in through the link. An invite counts as arrived when a company that
 * came has the invited email or the same company name. Companies that came without an invite are listed too.
 */
export function matchInvites(invited: Invite[], came: CameEmployer[]): { arrived: Invite[]; missing: Invite[]; walkIns: number } {
  const matches = (i: Invite, c: CameEmployer) => (c.email ?? "").trim().toLowerCase() === i.email.toLowerCase() || (norm(c.company) !== "" && norm(c.company) === norm(i.company));
  const arrived: Invite[] = [];
  const missing: Invite[] = [];
  for (const i of invited) (came.some((c) => matches(i, c)) ? arrived : missing).push(i);
  // Companies no invite points to, counted once each however many invites matched the others.
  const walkIns = came.filter((c) => !invited.some((i) => matches(i, c))).length;
  return { arrived, missing, walkIns };
}

/**
 * The report sentence on a closed drive. Students, not offers: the pipeline counts students, and a student with two offers, or an
 * internship plus a full-time offer, is one student.
 */
export function closedDriveFinding(lists: { offers: unknown[]; meetings: unknown[]; hired: unknown[] }): string {
  const n = (c: number, one: string, many: string) => `${c.toLocaleString("en-IN")} ${c === 1 ? one : many}`;
  return `${n(lists.offers.length, "student got an offer", "students got an offer")}, ${n(lists.meetings.length, "student had a meet", "students had a meet")} and ${n(lists.hired.length, "student was hired", "students were hired")} in this drive.`;
}
