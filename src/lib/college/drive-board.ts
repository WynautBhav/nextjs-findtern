import { CALL_GRACE_MS, MEETING_MINUTES } from "./constants.ts";
import { MEET_LABEL, MEET_STAGE, MEET_STAGES, meetOutcome, type MeetStage } from "./meet-outcome.ts";
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
  /** A called-off meet: why, in the words of whoever cancelled it, and who that was (bug sheet 27 Nov). Line breaks are kept. */
  reason?: string | null;
  cancelledBy?: string | null;
  /** A conducted (or missed) interview: the company's written feedback, as the student sees it. Line breaks are kept. */
  feedback?: string | null;
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

/**
 * A company's shortlist in a drive comes from two places: the drive's own list and the regular Shortlist button on the
 * candidates page (employer_cart_items). The employer's drive page counts the regular one, so the officer's figures
 * must too. One row per (company, student): the same student on both lists is one shortlist, the earliest time wins.
 */
export function mergeShortlist<T extends { userId: string; employerId: string; createdAt: Date }>(...lists: T[][]): T[] {
  const seen = new Map<string, T>();
  for (const r of lists.flat()) {
    const key = `${r.employerId}|${r.userId}`;
    const had = seen.get(key);
    if (!had || r.createdAt.getTime() < had.createdAt.getTime()) seen.set(key, r);
  }
  return [...seen.values()];
}
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
  | "offersSent"
  | "declinedAll"
  | "unanswered"
  | "meetBooked"
  | "meetCompleted"
  | "meetExpired"
  | "meetWithdrawn"
  | "offersExpired"
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
   * sent = every offer the drive's companies made = accepted + rejected + no reply yet + withdrawn (owner, 27 Nov: "offers sent should show
   * total offers"); hired = hiredInternship + hiredFullTime, and a hire is an accepted offer. The top "Got an offer" figure still leaves withdrawn offers out.
   */
  offerCounts: { total: number } & Record<OfferStage, number> & { hiredInternship: number; hiredFullTime: number };
  /** The same offers split by kind: an offer with a full-time / PPO part counts as full-time. */
  offerSplit: { internship: number; fullTime: number };
  /** Meet requests counted one by one (a student can have several): every one asked (sent), and each by its one outcome
   *  (meet-outcome.ts), so the outcomes always add up to sent. The dashboard and Master data count the same outcomes. */
  meetCounts: { total: number } & Record<MeetStage, number>;
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

/**
 * Owner, 27 Nov: offers read like meetings. Each offer is in one stage, so the stages add up to the total:
 * sent = no reply yet and its start day ahead (nudge it); accepted = the student said yes (hired ones included);
 * rejected; expired = its start day began with no reply, or accepted and never paid; withdrawn by the company.
 */
export const OFFER_STAGES = ["sent", "accepted", "rejected", "expired", "withdrawn"] as const;
export type OfferStage = (typeof OFFER_STAGES)[number];
export function offerStage(o: OfferRow): OfferStage {
  if (o.status === "withdrawn") return "withdrawn";
  if (isHired(o)) return "accepted";
  if (declined(o)) return "rejected";
  if (o.status === "expired" || (o.pastStart && o.status !== "processing")) return "expired";
  if (accepted(o)) return "accepted";
  return "sent";
}
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
  const shortlist = (input.shortlist ?? []).filter((r) => students.has(r.userId));
  // Every meet has exactly one outcome (meet-outcome.ts); the tiles, lists and the other screens all read it.
  const outcomeOf = new Map(input.meetings.map((m) => [m, meetOutcome(m, now)]));
  const byStage = Object.fromEntries(MEET_STAGES.map((st) => [st, input.meetings.filter((m) => MEET_STAGE[outcomeOf.get(m)!] === st)])) as Record<MeetStage, MeetingRow[]>;
  const waiting = byStage.sent;
  const sentMeets = input.meetings;
  // "What happened" names each meet's outcome, newest first; a conducted interview carries the company's feedback,
  // a called-off one its reason (bug sheets 26 and 27 Nov).
  const meetLabel = (m: MeetingRow) => MEET_LABEL[outcomeOf.get(m) ?? "waiting"];
  const extra = (m: MeetingRow) =>
    m.feedback && (outcomeOf.get(m) === "conducted" || outcomeOf.get(m) === "missed") ? `\nFeedback: ${m.feedback}`
    : m.reason ? `\n${m.cancelledBy === "intern" ? "Student's reason" : "Reason"}: ${m.reason}`
    : "";
  const outcomes = (rs: MeetingRow[]) => (rs.some((m) => extra(m)) ? rs.map((m) => `${company(m.company)}: ${meetLabel(m)}${extra(m)}`).join("\n") : rs.map((m) => `${company(m.company)}: ${meetLabel(m)}`).join(" · "));
  const everyMeet = new Map<string, MeetingRow[]>();
  for (const m of [...input.meetings].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())) everyMeet.set(m.userId, [...(everyMeet.get(m.userId) ?? []), m]);
  const inDriveCount = (rs: MeetingRow[]) => rs.filter((m) => students.has(m.userId)).length;
  // Waiting on the student: sent, not hired, start day not begun (college count-rules offerWaitingSql). Past it the
  // offer lapsed ("deadline missed" in master data, "no response" for the student, "expired" for the employer).
  const open = input.offers.filter((o) => offerStage(o) === "sent");
  const hired = input.offers.filter(isHired);
  const inDrive = input.offers.filter((o) => students.has(o.userId));
  const withdrawnInDrive = withdrawn.filter((o) => students.has(o.userId));
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
      total: inDrive.length + withdrawnInDrive.length,
      ...(Object.fromEntries(OFFER_STAGES.map((st) => [st, [...inDrive, ...withdrawnInDrive].filter((o) => offerStage(o) === st).length])) as Record<OfferStage, number>),
      hiredInternship: inDrive.filter((o) => isHired(o) && !o.fullTime).length,
      hiredFullTime: inDrive.filter((o) => isHired(o) && o.fullTime).length,
    },
    facts: {
      offers: inDrive.map((o) => ({ userId: o.userId, company: o.company, at: o.createdAt, outcome: accepted(o) ? "accepted" : declined(o) ? "declined" : "open", fullTime: o.fullTime })),
      meets: sentMeets.filter((m) => students.has(m.userId)).map((m) => ({ userId: m.userId, company: m.company, at: m.createdAt })),
    },
    meetCounts: { total: inDriveCount(sentMeets), ...(Object.fromEntries(MEET_STAGES.map((st) => [st, inDriveCount(byStage[st])])) as Record<MeetStage, number>) },
    withdrawnCount: withdrawnInDrive.length,
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
      // The "Total offers" tile: the same students and offers its figure counts, withdrawn ones included.
      offersSent: perStudent([...inDrive, ...withdrawnInDrive], students, (rs) => {
        const taken = rs.filter((r) => r.status === "withdrawn").length;
        return `${offerKinds(rs)} · ${names(rs)}${taken ? ` · ${taken} withdrawn` : ""}`;
      }),
      meetBooked: withMeetNudge(perStudent(byStage.accepted, students, outcomes)),
      meetCompleted: perStudent(byStage.completed, students, outcomes),
      meetExpired: perStudent(byStage.expired, students, outcomes),
      meetWithdrawn: perStudent(byStage.withdrawn, students, outcomes),
      offersAccepted: perStudent(inDrive.filter((o) => offerStage(o) === "accepted"), students, (rs) => `${offerKinds(rs)} accepted · ${names(rs)}`),
      offersRejected: perStudent(inDrive.filter((o) => offerStage(o) === "rejected"), students, (rs) => `${offerKinds(rs)} rejected · ${names(rs)}`),
      offersExpired: perStudent(inDrive.filter((o) => offerStage(o) === "expired"), students, (rs) => `${offerKinds(rs)} expired (no reply or not paid before the start day) · ${names(rs)}`),
      offersWithdrawn: perStudent(withdrawn, students, (rs) => `${names(rs)} withdrew ${rs.length === 1 ? (rs[0].fullTime ? "a full-time offer" : "an internship offer") : `${rs.length} offers`}`),
      shortlisted: perStudent(shortlist, students, (rs) => `Shortlisted by ${names(rs)}`),
      internships: perStudent(hired.filter((o) => !o.fullTime), students, (rs) => `Internship with ${names(rs)}`),
      fullTime: perStudent(hired.filter((o) => o.fullTime), students, (rs) => `Full-time with ${names(rs)}`),
      // The pipeline's stages: any meet request at all (withdrawn ones too, as offers sent count withdrawn offers), and any hire.
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
export function closedDriveFinding(lists: { offers: unknown[]; meetCompleted: unknown[]; hired: unknown[] }): string {
  const n = (c: number, one: string, many: string) => `${c.toLocaleString("en-IN")} ${c === 1 ? one : many}`;
  return `${n(lists.offers.length, "student got an offer", "students got an offer")}, ${n(lists.meetCompleted.length, "student had a meet", "students had a meet")} and ${n(lists.hired.length, "student was hired", "students were hired")} in this drive.`;
}
