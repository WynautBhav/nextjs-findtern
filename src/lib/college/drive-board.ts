import { CALL_GRACE_MS } from "./constants.ts";

/**
 * One campus drive, as the placement officer runs it: what needs chasing now (critical) and what the drive has
 * produced (results). Pure, so the counts can be tested without a database (drive-board-db.ts loads the rows).
 *
 * A proposal belongs to the drive when an employer who came in through the drive's link sent it to one of the
 * drive's students on or after the drive opened. Offers and hires carry no drive id, so this is the rule.
 */

export type DriveStudentRef = { userId: string; name: string; rollNo: string | null; year: number | null; branch: string | null; phone: string | null };
export type BoardItem = DriveStudentRef & { detail: string };

export type MeetingRow = {
  userId: string;
  company: string | null;
  status: string;
  createdAt: Date;
  /** When the call was set to start; a request lapses CALL_GRACE_MS after it (meetings.ts effectiveStatus). */
  startsAt?: Date;
};
export type OfferRow = { userId: string; company: string | null; status: string; hired: boolean; fullTime: boolean; createdAt: Date };
export type OfflineRow = { userId: string };

export type BoardKey = "meetingsWaiting" | "offersWaiting" | "offline" | "offers" | "meetings" | "internships" | "fullTime" | "called" | "hired";

export type DriveBoard = {
  lists: Record<BoardKey, BoardItem[]>;
  /** Offers counted one by one (a student can hold two); the list is per student. */
  offerCount: number;
  /** Offline is known only while the drive is live; null otherwise. */
  offlineKnown: boolean;
};

const HIRED = new Set(["hired", "completed"]);
const company = (c: string | null) => c?.trim() || "An employer";

function ago(from: Date, now: number): string {
  const m = Math.max(0, Math.round((now - from.getTime()) / 60_000));
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
}

/** Group rows per student, newest first, and describe them in one line. */
function perStudent<T extends { userId: string; createdAt: Date }>(rows: T[], students: Map<string, DriveStudentRef>, line: (rs: T[]) => string): BoardItem[] {
  const by = new Map<string, T[]>();
  for (const r of rows) if (students.has(r.userId)) by.set(r.userId, [...(by.get(r.userId) ?? []), r]);
  return [...by.entries()]
    .map(([id, rs]) => ({ rs: rs.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()), s: students.get(id)! }))
    .sort((a, b) => b.rs[0].createdAt.getTime() - a.rs[0].createdAt.getTime())
    .map(({ rs, s }) => ({ ...s, detail: line(rs) }));
}

const names = (rs: { company: string | null }[]) => [...new Set(rs.map((r) => company(r.company)))].join(", ");

export function buildDriveBoard(input: {
  students: DriveStudentRef[];
  meetings: MeetingRow[];
  offers: OfferRow[];
  /** Students offline right now, or null when the drive is not live. */
  offline: OfflineRow[] | null;
  now: number;
}): DriveBoard {
  const students = new Map(input.students.map((s) => [s.userId, s]));
  const { now } = input;
  // Only requests the student can still accept: a lapsed one is expired for the student and the employer alike.
  const waiting = input.meetings.filter((m) => m.status === "requested" && (!m.startsAt || m.startsAt.getTime() + CALL_GRACE_MS >= now));
  const held = input.meetings.filter((m) => m.status === "accepted");
  const open = input.offers.filter((o) => o.status === "sent");
  const hired = input.offers.filter((o) => o.hired || HIRED.has(o.status));
  const inDrive = input.offers.filter((o) => students.has(o.userId));
  const hiredItems = perStudent(hired, students, (rs) => `${rs.some((r) => r.fullTime) ? "Full-time" : "Internship"} with ${names(rs)}`);
  return {
    offerCount: inDrive.length,
    offlineKnown: input.offline !== null,
    lists: {
      meetingsWaiting: perStudent(waiting, students, (rs) => `${names(rs)} asked for a call · ${ago(rs[0].createdAt, now)}`),
      offersWaiting: perStudent(open, students, (rs) => `Offer from ${names(rs)} · sent ${ago(rs[0].createdAt, now)}`),
      offline: (input.offline ?? []).filter((o) => students.has(o.userId)).map((o) => ({ ...students.get(o.userId)!, detail: "Not on Findtern right now" })),
      offers: perStudent(inDrive, students, (rs) => `${rs.length === 1 ? "1 offer" : `${rs.length} offers`} · ${names(rs)}`),
      meetings: perStudent(held, students, (rs) => `${rs.length === 1 ? "Call" : `${rs.length} calls`} with ${names(rs)}`),
      internships: perStudent(hired.filter((o) => !o.fullTime), students, (rs) => `Internship with ${names(rs)}`),
      fullTime: perStudent(hired.filter((o) => o.fullTime), students, (rs) => `Full-time with ${names(rs)}`),
      // The pipeline's stages: any call request at all, and any hire (one row per student).
      called: perStudent(input.meetings, students, (rs) => `${rs.length === 1 ? "1 call request" : `${rs.length} call requests`} · ${names(rs)}`),
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
