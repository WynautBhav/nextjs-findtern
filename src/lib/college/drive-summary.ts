/**
 * A drive's summary for the placement officer: how well it is going, where students drop out, which nudges worked,
 * how long students and employers were online, how fast students reply, who strong is being missed, and each
 * company's part. Pure: the database reads are in drive-summary-db.ts, so every rule here is unit tested.
 *
 * `open` true gives the student-level lists (names); false drops them here, so the page cannot render a name it was
 * never given. The drive page passes true for past drives too (C12 is dropped); only actions are live-only.
 */

export type SummaryStudent = {
  userId: string;
  name: string;
  branch: string | null;
  year: number | null;
  phone: string | null;
  score: number | null;
  /** Open to work now, and when it last went back on (bug sheet 26 Nov: judges the "Turn on Open to work" nudge). */
  openToWork?: boolean;
  openToWorkAt?: Date | null;
};
export type SummaryMeeting = { userId: string; employerId: string; status: string; createdAt: Date; respondedAt: Date | null };
export type SummaryOffer = { userId: string; employerId: string; status: string; hired: boolean; createdAt: Date; answeredAt: Date | null };
export type SummaryNudge = { userId: string; kind: string; createdAt: Date };
export type SummaryEmployer = { employerId: string; company: string; joinedAt: Date; shortlisted: number };

export type NudgeKind = "online" | "meeting" | "offer" | "interview" | "open_to_work";
export type NudgeRow = { userId: string; name: string; kind: NudgeKind; at: Date; worked: boolean | null; outcome: string };
export type StudentMinutes = { userId: string; name: string; minutes: number };
export type Signal = { key: string; label: string; value: string; ok: boolean; href: string };

export type DriveSummary = {
  tracked: "full" | "partial" | "none";
  /** When online time began to be recorded (for the note), or null. */
  trackingSince: Date | null;
  health: { verdict: "good" | "watch" | "poor"; line: string; signals: Signal[] };
  /** Each step's share, of the base named in `of` ("the drive", "those asked", "those offered"). */
  funnel: { key: string; label: string; value: number; share: number | null; of: string | null; notThrough: number; href: string | null }[];
  nudges: {
    byKind: { kind: NudgeKind; label: string; sent: number; worked: number; checkable: boolean }[];
    total: number;
    rows: NudgeRow[];
    /** Live only: nudged, nothing happened since, so worth a second one. */
    again: Partial<Record<NudgeKind, string[]>>;
  };
  online: {
    studentsAvg: number | null;
    studentsEver: number;
    neverOnline: StudentMinutes[];
    neverOnlineCount: number;
    most: StudentMinutes[];
    /** Every student in the drive with their minutes, most first (names shown): the past-drive card's lists and chart. */
    everyone: StudentMinutes[];
    employers: { employerId: string; company: string; minutes: number }[];
  };
  speed: {
    meetMedianMin: number | null;
    offerMedianHours: number | null;
    slowMeet: { userId: string; name: string; minutes: number }[];
  };
  missed: { count: number; rows: SummaryStudent[] };
};

const NUDGE_LABEL: Record<NudgeKind, string> = { online: "Come online", meeting: "Answer a meet request", offer: "Reply to an offer", interview: "Interview", open_to_work: "Turn on Open to work" };
/** A nudge "worked" if the thing it asked for happened within this long after it. */
export const NUDGE_WINDOW_MS = 24 * 60 * 60_000;
/** Strong enough that being left out of every meet and offer is worth a look. */
export const STRONG_SCORE = 8;

const median = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);
/** The student replied: yes or no to a call, or picked a slot (an interview that then ran or was missed). */
const answered = (status: string) => status === "accepted" || status === "declined" || status === "completed" || status === "missed";
const metStatus = (status: string) => status === "accepted" || status === "completed" || status === "missed";
const offerAnswered = (o: SummaryOffer) => o.hired || ["accepted", "rejected", "processing", "hired", "completed"].includes(o.status);

export function buildDriveSummary(input: {
  open: boolean;
  driveHref: string;
  window: { start: Date; end: Date };
  /** First minute online time was recorded at all; null = nothing recorded yet. */
  trackingSince: Date | null;
  students: SummaryStudent[];
  meetings: SummaryMeeting[];
  offers: SummaryOffer[];
  nudges: SummaryNudge[];
  /** Online minutes inside the drive window, per user (students and employers). Absent = 0. */
  minutes: Map<string, number>;
  /** Per student: minute stamps (ms) online inside the window, for checking "come online" nudges. */
  onlineAt: (userId: string, from: Date, to: Date) => boolean;
  employers: SummaryEmployer[];
  invitedCount: number;
  /** Invited companies that actually came in (matched by email or name, drive-board.ts matchInvites); not everyone who joined. */
  invitedCame?: number;
}): DriveSummary {
  const { open, students, meetings, offers, nudges, employers, window: win } = input;
  const byStudent = new Map(students.map((s) => [s.userId, s]));
  const nameOf = new Map(students.map((s) => [s.userId, s.name || "Student"]));
  const inDrive = new Set(students.map((s) => s.userId));
  const href = (show: string) => `${input.driveHref}?show=${show}#board`;

  // Recorded only from the first heartbeat ever stored: a drive that ended before then has no online time at all.
  const tracked: DriveSummary["tracked"] = !input.trackingSince || input.trackingSince > win.end ? "none" : input.trackingSince <= win.start ? "full" : "partial";

  // Funnel: unique students at each step.
  const called = new Set(meetings.map((m) => m.userId));
  const met = new Set(meetings.filter((m) => metStatus(m.status)).map((m) => m.userId));
  const offered = new Set(offers.map((o) => o.userId));
  const hired = new Set(offers.filter((o) => o.hired).map((o) => o.userId));
  // Offers need not follow a meet, so each step is measured against the base it really is a part of.
  const total = students.length;
  const step = (key: string, label: string, value: number, base: number | null, of: string | null, show: string | null) => ({
    key,
    label,
    value,
    share: base === null ? null : pct(value, base),
    of,
    notThrough: base === null ? 0 : Math.max(0, base - value),
    href: open && show ? href(show) : null,
  });
  const funnel = [
    step("all", "In the drive", total, null, null, null),
    step("called", "Asked to meet", called.size, total, "of the drive", "called"),
    step("met", "Met an employer", met.size, called.size, "of those asked", "meetings"),
    step("offers", "Got an offer", offered.size, total, "of the drive", "offers"),
    step("hired", "Hired", hired.size, offered.size, "of those offered", "hired"),
  ];

  // Nudges, and whether each one worked.
  const outcomeOf = (n: SummaryNudge): { worked: boolean | null; outcome: string } => {
    const until = new Date(n.createdAt.getTime() + NUDGE_WINDOW_MS);
    const after = (d: Date | null) => d !== null && d > n.createdAt && d <= until;
    if (n.kind === "online") {
      if (tracked === "none") return { worked: null, outcome: "Online time not recorded yet" };
      if (input.trackingSince && n.createdAt < input.trackingSince) return { worked: null, outcome: "Sent before online time was recorded" };
      return input.onlineAt(n.userId, n.createdAt, until) ? { worked: true, outcome: "Came online" } : { worked: false, outcome: "Not online since" };
    }
    if (n.kind === "meeting") {
      const m = meetings.find((x) => x.userId === n.userId && answered(x.status) && after(x.respondedAt));
      return m ? { worked: true, outcome: m.status === "accepted" ? "Accepted the meet" : "Declined the meet" } : { worked: false, outcome: "No reply yet" };
    }
    if (n.kind === "offer") {
      const o = offers.find((x) => x.userId === n.userId && offerAnswered(x) && after(x.answeredAt));
      return o ? { worked: true, outcome: o.status === "rejected" ? "Declined the offer" : "Accepted the offer" } : { worked: false, outcome: "No reply yet" };
    }
    if (n.kind === "open_to_work") {
      const st = byStudent.get(n.userId);
      if (st?.openToWorkAt && after(st.openToWorkAt)) return { worked: true, outcome: "Turned on Open to work" };
      if (st?.openToWork === false) return { worked: false, outcome: "Open to work still off" };
      // On now with no switch-on time inside the day: recorded only from 26 Nov, so it may have been turned on earlier.
      return st?.openToWorkAt ? { worked: false, outcome: "Turned on later" } : { worked: null, outcome: "On now (switch time not recorded)" };
    }
    return { worked: null, outcome: "Not tracked" };
  };
  const inWindow = nudges.filter((n) => inDrive.has(n.userId) && n.createdAt >= win.start && n.createdAt <= win.end);
  const rows: NudgeRow[] = inWindow
    .map((n) => ({ userId: n.userId, name: nameOf.get(n.userId) ?? "Student", kind: n.kind as NudgeKind, at: n.createdAt, ...outcomeOf(n) }))
    .sort((a, b) => b.at.getTime() - a.at.getTime());
  const kinds: NudgeKind[] = ["online", "open_to_work", "meeting", "offer", "interview"];
  const byKind = kinds
    .map((kind) => {
      const k = rows.filter((r) => r.kind === kind);
      return { kind, label: NUDGE_LABEL[kind], sent: k.length, worked: k.filter((r) => r.worked).length, checkable: k.some((r) => r.worked !== null) };
    })
    .filter((k) => k.sent > 0);
  // The latest nudge per student and kind decides "nudge again".
  const again: Partial<Record<NudgeKind, string[]>> = {};
  if (open) {
    const seen = new Set<string>();
    for (const r of rows) {
      const key = `${r.kind}:${r.userId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (r.worked === false && r.kind !== "interview") (again[r.kind] ??= []).push(r.userId);
    }
  }

  // Online time.
  const minutesOf = (id: string) => input.minutes.get(id) ?? 0;
  const studentMinutes = students.map((s) => ({ userId: s.userId, name: s.name || "Student", minutes: minutesOf(s.userId) }));
  const never = studentMinutes.filter((s) => s.minutes === 0);
  const online = {
    // Per student who came online (bug sheet 26 Nov): over everyone, a drive where most never came read "0 min".
    studentsAvg: tracked === "none" || students.length === never.length ? null : Math.round(studentMinutes.reduce((a, s) => a + s.minutes, 0) / (students.length - never.length)),
    studentsEver: students.length - never.length,
    neverOnline: open ? never.slice(0, 50) : [],
    neverOnlineCount: never.length,
    most: open ? [...studentMinutes].filter((s) => s.minutes > 0).sort((a, b) => b.minutes - a.minutes).slice(0, 5) : [],
    everyone: open && tracked !== "none" ? [...studentMinutes].sort((a, b) => b.minutes - a.minutes) : [],
    employers: employers.map((e) => ({ employerId: e.employerId, company: e.company, minutes: minutesOf(e.employerId) })),
  };

  // Reply speed.
  const meetReplies = meetings.filter((m) => answered(m.status) && m.respondedAt).map((m) => ({ userId: m.userId, minutes: Math.max(0, (m.respondedAt!.getTime() - m.createdAt.getTime()) / 60_000) }));
  const offerReplies = offers.filter((o) => offerAnswered(o) && o.answeredAt).map((o) => Math.max(0, (o.answeredAt!.getTime() - o.createdAt.getTime()) / 3_600_000));
  const meetMedian = median(meetReplies.map((r) => r.minutes));
  const offerMedian = median(offerReplies);
  const speed = {
    meetMedianMin: meetMedian === null ? null : Math.round(meetMedian),
    offerMedianHours: offerMedian === null ? null : Math.round(offerMedian * 10) / 10,
    slowMeet: open ? [...meetReplies].sort((a, b) => b.minutes - a.minutes).slice(0, 5).map((r) => ({ userId: r.userId, name: nameOf.get(r.userId) ?? "Student", minutes: Math.round(r.minutes) })) : [],
  };

  // Strong students nobody has reached.
  const missedAll = students.filter((s) => s.score !== null && s.score >= STRONG_SCORE && !called.has(s.userId) && !offered.has(s.userId)).sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  // Health: a handful of signals, each with a plain threshold, each a link to where it can be fixed.
  const meetAsked = meetings.length;
  const meetAnswered = meetings.filter((m) => answered(m.status)).length;
  const offerAnsweredN = offers.filter(offerAnswered).length;
  const signals: Signal[] = [];
  if (meetAsked) signals.push({ key: "meet-replies", label: "Meet requests answered", value: `${pct(meetAnswered, meetAsked)}%`, ok: pct(meetAnswered, meetAsked) >= 70, href: href("meetingsWaiting") });
  if (offers.length) signals.push({ key: "offer-replies", label: "Offers answered", value: `${pct(offerAnsweredN, offers.length)}%`, ok: pct(offerAnsweredN, offers.length) >= 60, href: href("offersWaiting") });
  if (students.length) signals.push({ key: "reach", label: "Students asked to meet", value: `${pct(called.size, students.length)}%`, ok: pct(called.size, students.length) >= 25, href: href("called") });
  if (input.invitedCount) {
    // A walk-in company is not an invited one coming: count only invites that matched a company in the drive (bug 26 Nov).
    const cameInvited = Math.min(input.invitedCame ?? 0, input.invitedCount);
    signals.push({ key: "employers", label: "Invited companies came", value: `${cameInvited} of ${input.invitedCount}`, ok: pct(cameInvited, input.invitedCount) >= 60, href: `${input.driveHref}#${cameInvited < input.invitedCount ? "employers-missing" : "employers"}` });
  } else {
    signals.push({ key: "employers", label: "Companies in the drive", value: String(employers.length), ok: employers.length >= 3, href: `${input.driveHref}#employers` });
  }
  // Graded only when the whole drive was recorded: a part-recorded drive would look emptier than it was.
  if (tracked === "full" && students.length) signals.push({ key: "online", label: "Students online at least once", value: `${pct(online.studentsEver, students.length)}%`, ok: pct(online.studentsEver, students.length) >= 50, href: href("offline") });
  const bad = signals.filter((s) => !s.ok);
  const verdict: DriveSummary["health"]["verdict"] = bad.length === 0 ? "good" : bad.length <= 2 ? "watch" : "poor";
  const line = verdict === "good" ? "Every signal is where it should be." : `Below target: ${bad.map((b) => `${b.label.toLowerCase()} ${b.value}`).join(", ")}.`;

  return {
    tracked,
    trackingSince: input.trackingSince,
    health: { verdict, line, signals },
    funnel,
    nudges: { byKind, total: rows.length, rows: open ? rows.slice(0, 40) : [], again },
    online,
    speed,
    missed: { count: missedAll.length, rows: open ? missedAll.slice(0, 20) : [] },
  };
}
