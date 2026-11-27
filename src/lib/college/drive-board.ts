import { CALL_GRACE_MS, MEETING_MINUTES } from "./constants.ts";
import { ago } from "./labels.ts";
import { shortDateTime } from "../format.ts";

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
  /** Verified students only: lets the board's list be searched by email. */
  email?: string | null;
  /** The student's own "open to work" switch. Missing counts as on, so only an explicit false lands in "Not open to work". */
  openToWork?: boolean;
  /** When the student was last on Findtern (college presence); null = never seen. Shown on the Offline list. */
  lastSeenAt?: Date | null;
  /** False when the student hasn't finished the AI interview (employers can't see them yet); missing = not known. */
  aiDone?: boolean;
};
/** `again`: on a nudge-history row, the student still needs that nudge now (so a Nudge again button makes sense). */
export type BoardItem = DriveStudentRef & {
  detail: string;
  again?: boolean;
  /** On a list that shows the student's meets: the nudge that fits their meet now (meetNudgeKind). Absent = nothing to chase. */
  meetNudge?: MeetNudgeKind;
};

/** "meeting": a request the student has not answered. "meeting_reminder": a booked meet that has not ended. */
export type MeetNudgeKind = "meeting" | "meeting_reminder";

export type MeetingRow = {
  userId: string;
  company: string | null;
  status: string;
  createdAt: Date;
  /** When the call was set to start; a request lapses CALL_GRACE_MS after it (meetings.ts effectiveStatus). */
  startsAt?: Date;
};
/** The one place that says which nudge a student's meet calls for (the board lists and the student page agree); null when it needs none. */
export function meetNudgeKind(m: { status: string; startsAt?: Date | null }, now: number): MeetNudgeKind | null {
  const start = m.startsAt?.getTime();
  if (m.status === "requested") return start !== undefined && start + CALL_GRACE_MS < now ? null : "meeting";
  if (m.status === "accepted") return start !== undefined && start + MEETING_MINUTES * 60_000 <= now ? null : "meeting_reminder";
  return null;
}

/** pastStart: the offer's start day has begun (offer-start-sql.ts), so an unanswered one has lapsed, not waiting. */
export type OfferRow = { userId: string; company: string | null; status: string; hired: boolean; fullTime: boolean; createdAt: Date; pastStart?: boolean };
export type OfflineRow = { userId: string };
/** An employer in the drive shortlisted the student. */
export type ShortlistRow = { userId: string; company: string | null; createdAt: Date };
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
  | "meetDeclined"
  | "meetCancelled"
  | "aiPending"
  | "offersWithdrawn"
  | "offersAccepted"
  | "offersRejected"
  | "shortlisted"
  | "internships"
  | "fullTime"
  | "called"
  | "hired"
  | NudgeKey;

export type DriveBoard = {
  lists: Record<BoardKey, BoardItem[]>;
  /** Offers counted one by one (a student can hold two); the list is per student. */
  offerCount: number;
  /**
   * The live Offers row, one source: every figure counts offer rows of the drive's students, one by one.
   * sent = accepted + rejected + no reply yet; withdrawn offers are not sent (as above); hired = hiredInternship + hiredFullTime, and a hire is an accepted offer.
   */
  offerCounts: { sent: number; accepted: number; rejected: number; withdrawn: number; hiredInternship: number; hiredFullTime: number };
  /** The same offers split by kind: an offer with a full-time / PPO part counts as full-time. */
  offerSplit: { internship: number; fullTime: number };
  /** Meet requests counted one by one (a student can have several): sent (not cancelled), accepted, completed, expired,
   *  declined by the student, cancelled, and still waiting on the student (bug sheet 26 Nov: every status shows). */
  meetCounts: { sent: number; accepted: number; completed: number; expired: number; declined: number; cancelled: number; waiting: number };
  /** Offers the company withdrew: listed on their own, never counted as offers. */
  withdrawnCount: number;
  /** Students shortlisted by at least one company in the drive. */
  shortlistCount: number;
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
const isHired = (o: OfferRow) => o.hired || HIRED.has(o.status);
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
  /** Shortlists made by the drive's companies. Optional: none. */
  shortlist?: ShortlistRow[];
  now: number;
}): DriveBoard {
  const students = new Map(input.students.map((s) => [s.userId, s]));
  const { now } = input;
  // A withdrawn offer is not an offer: it has its own list and touches no other figure.
  const withdrawn = input.offers.filter((o) => o.status === "withdrawn");
  input = { ...input, offers: input.offers.filter((o) => o.status !== "withdrawn") };
  const declinedMeets = input.meetings.filter((m) => m.status === "declined" || m.status === "rejected");
  const cancelledMeets = input.meetings.filter((m) => m.status === "cancelled");
  const shortlist = (input.shortlist ?? []).filter((r) => students.has(r.userId));
  // Only requests the student can still accept: a lapsed one is expired for the student and the employer alike.
  const waiting = input.meetings.filter((m) => m.status === "requested" && (!m.startsAt || m.startsAt.getTime() + CALL_GRACE_MS >= now));
  // Accepted: the student said yes (a drive call), or picked a slot (an interview), whatever happened after.
  const held = input.meetings.filter((m) => m.status === "accepted" || m.status === "completed" || m.status === "missed");
  // Completed: an interview marked completed, or an accepted drive call whose slot is over (calls record no outcome).
  const done = held.filter((m) => m.status === "completed" || (m.status === "accepted" && m.startsAt && m.startsAt.getTime() + MEETING_MINUTES * 60_000 <= now));
  // Expired: marked so, or never answered by start + grace (meetings.ts effectiveStatus).
  const lapsed = input.meetings.filter((m) => m.status === "expired" || (m.status === "requested" && m.startsAt && m.startsAt.getTime() + CALL_GRACE_MS < now));
  const sentMeets = input.meetings.filter((m) => m.status !== "cancelled");
  // Bug 26 Nov: "What happened" names each meet's outcome, Completed and Withdrawn included, newest first.
  const doneSet = new Set(done);
  const lapsedSet = new Set(lapsed);
  const meetLabel = (m: MeetingRow) =>
    m.status === "cancelled" ? "Withdrawn"
    : doneSet.has(m) ? "Completed"
    : m.status === "missed" ? "Missed"
    : held.includes(m) ? "Accepted"
    : lapsedSet.has(m) ? "Expired"
    : m.status === "declined" || m.status === "rejected" ? "Not accepted"
    : "Waiting for reply";
  const outcomes = (rs: MeetingRow[]) => rs.map((m) => `${company(m.company)}: ${meetLabel(m)}`).join(" · ");
  const everyMeet = new Map<string, MeetingRow[]>();
  for (const m of [...input.meetings].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())) everyMeet.set(m.userId, [...(everyMeet.get(m.userId) ?? []), m]);
  const inDriveCount = (rs: MeetingRow[]) => rs.filter((m) => students.has(m.userId)).length;
  // Waiting on the student: sent, not hired, start day not begun (college count-rules offerWaitingSql). Past it the
  // offer lapsed ("deadline missed" in master data, "no response" for the student, "expired" for the employer).
  const open = input.offers.filter((o) => o.status === "sent" && !o.hired && !o.pastStart);
  const hired = input.offers.filter(isHired);
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
  const nudges = input.nudges ?? [];
  // " · Nudged 3 times · last 2 h ago" for one student and kind: what the officer already sent, on the row that offers the nudge.
  const sent = new Map<string, { n: number; last: number }>();
  for (const x of nudges) {
    const k = `${x.userId}:${x.kind}`;
    const was = sent.get(k);
    sent.set(k, { n: (was?.n ?? 0) + 1, last: Math.max(was?.last ?? 0, x.createdAt.getTime()) });
  }
  const nudgedNote = (userId: string, kind: string) => {
    const v = sent.get(`${userId}:${kind}`);
    return v ? ` · Nudged ${v.n === 1 ? "1 time" : `${v.n} times`} · last ${ago(new Date(v.last).toISOString(), now)}` : "";
  };
  const withNote = (items: BoardItem[], kind: string) => items.map((s) => ({ ...s, detail: s.detail + nudgedNote(s.userId, kind) }));
  // Per student, the nudge their meets call for: an unanswered request outranks a booked meet.
  const meetNudgeOf = new Map<string, MeetNudgeKind>();
  for (const m of input.meetings) {
    const k = meetNudgeKind(m, now);
    if (k && (k === "meeting" || !meetNudgeOf.has(m.userId))) meetNudgeOf.set(m.userId, k);
  }
  const withMeetNudge = (items: BoardItem[]) =>
    items.map((s) => {
      const k = meetNudgeOf.get(s.userId);
      return k ? { ...s, meetNudge: k, detail: s.detail + nudgedNote(s.userId, k) } : s;
    });
  const offlineIds = new Set((input.offline ?? []).filter((o) => students.has(o.userId)).map((o) => o.userId));
  const waitingMeet = withNote(perStudent(waiting, students, (rs) => `${names(rs)} asked for a meet · ${ago(rs[0].createdAt.toISOString(), now)}`), "meeting");
  const waitingOffer = withNote(perStudent(open, students, (rs) => `Offer from ${names(rs)} · sent ${ago(rs[0].createdAt.toISOString(), now)}`), "offer");
  const notOpen = withNote(input.students.filter((s) => s.openToWork === false).map((s) => ({ ...s, detail: "Open to work is off" })), "open_to_work");
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
    offerCounts: {
      sent: inDrive.length,
      accepted: inDrive.filter(accepted).length,
      rejected: inDrive.filter(declined).length,
      withdrawn: withdrawn.filter((o) => students.has(o.userId)).length,
      hiredInternship: inDrive.filter((o) => isHired(o) && !o.fullTime).length,
      hiredFullTime: inDrive.filter((o) => isHired(o) && o.fullTime).length,
    },
    facts: {
      offers: inDrive.map((o) => ({ userId: o.userId, company: o.company, at: o.createdAt, outcome: accepted(o) ? "accepted" : declined(o) ? "declined" : "open", fullTime: o.fullTime })),
      meets: sentMeets.filter((m) => students.has(m.userId)).map((m) => ({ userId: m.userId, company: m.company, at: m.createdAt })),
    },
    meetCounts: {
      sent: inDriveCount(sentMeets),
      accepted: inDriveCount(held),
      completed: inDriveCount(done),
      expired: inDriveCount(lapsed),
      declined: inDriveCount(declinedMeets),
      cancelled: inDriveCount(cancelledMeets),
      waiting: inDriveCount(waiting),
    },
    withdrawnCount: withdrawn.filter((o) => students.has(o.userId)).length,
    shortlistCount: new Set(shortlist.map((r) => r.userId)).size,
    offerSplit: { internship: inDrive.filter((o) => !o.fullTime).length, fullTime: inDrive.filter((o) => o.fullTime).length },
    nudgeCounts: { nudgedOnline: nudgeTotal("online"), nudgedOpenToWork: nudgeTotal("open_to_work"), nudgedMeet: nudgeTotal("meeting"), nudgedOffer: nudgeTotal("offer") },
    offlineKnown: input.offline !== null,
    lists: {
      meetingsWaiting: waitingMeet,
      offersWaiting: waitingOffer,
      offline: withNote([...offlineIds].map((id) => {
        const s = students.get(id)!;
        return { ...s, detail: s.lastSeenAt ? `Last seen ${shortDateTime(s.lastSeenAt, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}` : "Not seen yet" };
      }), "online"),
      // 26 Nov PDF: students the TPO can nudge to finish the AI interview while the drive runs.
      aiPending: input.students.filter((s) => s.aiDone === false).map((s) => ({ ...s, detail: "AI interview not done" })),
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
      meetings: withMeetNudge(perStudent(held, students, outcomes)),
      meetCompleted: perStudent(done, students, outcomes),
      meetExpired: perStudent(lapsed, students, (rs) => `${rs.length === 1 ? "1 meet expired" : `${rs.length} meets expired`} · ${names(rs)}`),
      meetDeclined: perStudent(declinedMeets, students, (rs) => `Declined ${rs.length === 1 ? "a meet" : `${rs.length} meets`} with ${names(rs)}`),
      meetCancelled: perStudent(cancelledMeets, students, outcomes),
      offersAccepted: perStudent(inDrive.filter(accepted), students, (rs) => `${offerKinds(rs)} accepted · ${names(rs)}`),
      offersRejected: perStudent(inDrive.filter(declined), students, (rs) => `${offerKinds(rs)} rejected · ${names(rs)}`),
      offersWithdrawn: perStudent(withdrawn, students, (rs) => `${names(rs)} withdrew ${rs.length === 1 ? (rs[0].fullTime ? "a full-time offer" : "an internship offer") : `${rs.length} offers`}`),
      shortlisted: perStudent(shortlist, students, (rs) => `Shortlisted by ${names(rs)}`),
      internships: perStudent(hired.filter((o) => !o.fullTime), students, (rs) => `Internship with ${names(rs)}`),
      fullTime: perStudent(hired.filter((o) => o.fullTime), students, (rs) => `Full-time with ${names(rs)}`),
      // The pipeline's stages: any call request at all, and any hire (one row per student).
      // A request the company cancelled no longer counts, as a withdrawn offer does not count as an offer (master data agrees).
      called: withMeetNudge(perStudent(sentMeets, students, (rs) => outcomes(everyMeet.get(rs[0].userId) ?? rs))),
      hired: hiredItems,
    },
  };
}

export type Invite = { company: string; email: string };
export type CameEmployer = { employerId: string; company: string | null; contact: string | null; email: string | null; phone: string | null; joinedAt: Date; shortlisted?: number; calls?: number; /** Left the drive before it ended (college_drive_employers.status "exited"). */ exited?: boolean };

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
