/**
 * The admin dashboard's numbers (Students | Employers | Colleges), computed from the rows `loadDashboardBoard` returns.
 * Pure, so the server, the client tabs and the tests share one definition: every count is the length of the list it
 * opens.
 */

export type BoardView = "students" | "employers" | "colleges";
export const BOARD_VIEWS: { key: BoardView; label: string }[] = [
  { key: "students", label: "Students" },
  { key: "employers", label: "Employers" },
  { key: "colleges", label: "Colleges" },
];
/** Which detail pages this admin may open (contacts and links follow them). */
export type BoardLinks = { interns: boolean; companies: boolean; colleges: boolean; cgpa: boolean };

export type Track = "tech" | "non_tech";
export type TrackFilter = "all" | Track;
export type Guarantee = "active" | "ended" | "none";
export type OfferReply = "pending" | "accepted" | "rejected" | "expired" | "withdrawn";
export type MeetStage = "sent" | "accepted" | "completed" | "expired" | "withdrawn";

export type BoardStudent = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  college: string | null;
  collegeId: string | null;
  year: number | null;
  branch: string | null;
  createdAt: string | null;
  lastSeenAt: string | null;
  activityHidden: boolean;
  online: boolean;
  /** Known after the AI interview: a coding rating means a tech candidate. */
  track: Track | null;
  profilePct: number;
  profileComplete: boolean;
  aiStatus: string;
  pendingPayment: boolean;
  cgpaPending: boolean;
  openToWork: boolean;
  /** A current college membership (any status): the student is on a college's list. */
  collegeLinked: boolean;
  membership: string | null;
  /** Only for students who took the AI interview; null before. */
  guarantee: Guarantee | null;
  score: number | null;
};

export type BoardOffer = {
  id: string;
  internId: string;
  employerId: string;
  employer: string;
  track: "internship" | "full_time";
  status: string;
  reply: OfferReply;
  hired: boolean;
  roleTitle: string | null;
  createdAt: string | null;
};

export type BoardMeeting = { id: string; internId: string; employerId: string; employer: string; stage: MeetStage; startsAt: string | null };

export type BoardEmployer = {
  id: string;
  company: string;
  contact: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  country: string | null;
  indian: boolean;
  size: string | null;
  onboarded: boolean;
  /** Joined a college drive (past or current) at any time. */
  viaDrive: boolean;
  /** In a drive that is live right now (same rule as the employer's campus lock). */
  inDriveNow: boolean;
  fte: string;
  createdAt: string | null;
};

const TECH_KEY = "coding";

/** A coding rating means the AI interview tested coding: a tech candidate. Scored without one: non-tech. Not scored: unknown. */
export function trackOf(extraData: unknown): Track | null {
  const extra = (extraData && typeof extraData === "object" ? extraData : {}) as Record<string, unknown>;
  const ratings = (extra.ratings && typeof extra.ratings === "object" ? extra.ratings : {}) as Record<string, unknown>;
  if (typeof ratings[TECH_KEY] === "number") return "tech";
  return typeof extra.findternScore === "number" ? "non_tech" : null;
}

/** India by the country field; with no country stored, by the +91 phone code. */
export function isIndianEmployer(country: string | null | undefined, countryCode: string | null | undefined): boolean {
  const c = (country ?? "").trim().toLowerCase();
  if (c) return c === "india" || c === "in" || c === "ind";
  return (countryCode ?? "").trim() === "+91";
}

/**
 * Proposal status → the student's reply. Accepted covers every status after a yes: accepted, processing (the employer's
 * payment is under way), hired and completed (the internship ran its course). Only sent and interview_scheduled wait.
 */
const AFTER_YES = new Set(["accepted", "processing", "hired", "completed"]);
export function offerReply(status: string, hired: boolean): OfferReply {
  if (hired || AFTER_YES.has(status)) return "accepted";
  if (status === "rejected") return "rejected";
  if (status === "expired") return "expired";
  if (status === "withdrawn") return "withdrawn";
  return "pending"; // sent, interview_scheduled
}

/** The company-size choices employers pick from (schema `companySizes`), plus not given. */
export const SIZE_BUCKETS = ["1-10", "11-50", "51-200", "201-500", "501-1000", "1000+"] as const;
export const SIZE_UNKNOWN = "Not given";

const AI_APPLIED = new Set(["applied", "scheduled", "sent", "expired", "completed"]);

export type MetricList = { kind: "students" | "offers" | "meetings" | "employers"; ids: string[] };
const stu = (rows: { id: string }[]): MetricList => ({ kind: "students", ids: rows.map((r) => r.id) });
const off = (rows: { id: string }[]): MetricList => ({ kind: "offers", ids: rows.map((r) => r.id) });
const meet = (rows: { id: string }[]): MetricList => ({ kind: "meetings", ids: rows.map((r) => r.id) });
const emp = (rows: { id: string }[]): MetricList => ({ kind: "employers", ids: rows.map((r) => r.id) });

/**
 * Every Students-tab number. `filter` narrows students to tech or non-tech, and offers and meetings to those students.
 * Hired students are split by where their employer is (India or abroad).
 */
export function studentMetrics(
  data: { students: BoardStudent[]; offers: BoardOffer[]; meetings: BoardMeeting[]; employers: Pick<BoardEmployer, "id" | "indian">[] },
  filter: TrackFilter = "all",
) {
  const students = filter === "all" ? data.students : data.students.filter((s) => s.track === filter);
  const inSet = new Set(students.map((s) => s.id));
  const offers = data.offers.filter((o) => inSet.has(o.internId));
  const meetings = data.meetings.filter((m) => inSet.has(m.internId));
  const indian = new Map(data.employers.map((e) => [e.id, e.indian]));

  const hiredOffer = new Map<string, BoardOffer>();
  for (const o of offers) if (o.hired && !hiredOffer.has(o.internId)) hiredOffer.set(o.internId, o);
  const hired = students.filter((s) => hiredOffer.has(s.id));
  const hiredBy = (t: BoardOffer["track"]) => hired.filter((s) => hiredOffer.get(s.id)!.track === t);
  const withOffer = new Set(offers.map((o) => o.internId));
  const scored = students.filter((s) => s.aiStatus === "completed");

  return {
    signedUp: stu(students),
    profileComplete: stu(students.filter((s) => s.profileComplete)),
    aiApplied: stu(students.filter((s) => AI_APPLIED.has(s.aiStatus))),
    pendingPayment: stu(students.filter((s) => s.pendingPayment)),
    aiScheduled: stu(students.filter((s) => s.aiStatus === "scheduled" || s.aiStatus === "sent")),
    aiInterviewed: stu(scored),
    gotOffer: stu(students.filter((s) => withOffer.has(s.id))),
    hired: stu(hired),

    cgpaPending: stu(students.filter((s) => s.cgpaPending)),
    openToWork: stu(students.filter((s) => s.openToWork)),
    hidden: stu(students.filter((s) => !s.openToWork)),
    onlineNow: stu(students.filter((s) => s.online)),
    collegeLinked: stu(students.filter((s) => s.collegeLinked)),
    individual: stu(students.filter((s) => !s.collegeLinked)),

    offersAwaiting: off(offers.filter((o) => o.reply === "pending")),
    meetingsAwaiting: meet(meetings.filter((m) => m.stage === "sent")),
    meetsCompleted: meet(meetings.filter((m) => m.stage === "completed")),
    meetsExpired: meet(meetings.filter((m) => m.stage === "expired")),
    internshipAccepted: off(offers.filter((o) => o.track === "internship" && o.reply === "accepted")),
    internshipRejected: off(offers.filter((o) => o.track === "internship" && o.reply === "rejected")),
    fullTimeAccepted: off(offers.filter((o) => o.track === "full_time" && o.reply === "accepted")),
    fullTimeRejected: off(offers.filter((o) => o.track === "full_time" && o.reply === "rejected")),
    offersExpired: off(offers.filter((o) => o.reply === "expired")),
    hiredFullTime: stu(hiredBy("full_time")),
    hiredInternship: stu(hiredBy("internship")),

    guaranteeActive: stu(scored.filter((s) => s.guarantee === "active")),
    guaranteeEnded: stu(scored.filter((s) => s.guarantee === "ended")),
    guaranteeNone: stu(scored.filter((s) => s.guarantee === "none")),

    workIndia: stu(hired.filter((s) => indian.get(hiredOffer.get(s.id)!.employerId) !== false)),
    workAbroad: stu(hired.filter((s) => indian.get(hiredOffer.get(s.id)!.employerId) === false)),
  };
}

export type StudentMetrics = ReturnType<typeof studentMetrics>;

/** Tech / non-tech / not yet interviewed counts for the filter. */
export function trackCounts(students: Pick<BoardStudent, "track">[]) {
  let tech = 0;
  let nonTech = 0;
  for (const s of students) {
    if (s.track === "tech") tech += 1;
    else if (s.track === "non_tech") nonTech += 1;
  }
  return { all: students.length, tech, non_tech: nonTech, unknown: students.length - tech - nonTech };
}

/** Every Employers-tab number. Offer and hire totals count proposals (one employer can hire many). */
export function employerMetrics(data: { employers: BoardEmployer[]; offers: BoardOffer[] }) {
  const e = data.employers;
  const sizes = [...SIZE_BUCKETS, SIZE_UNKNOWN].map((bucket) => ({
    bucket,
    list: emp(e.filter((x) => (bucket === SIZE_UNKNOWN ? !SIZE_BUCKETS.includes(x.size as (typeof SIZE_BUCKETS)[number]) : x.size === bucket))),
  }));
  const o = data.offers;
  const sentBy = new Set(o.map((x) => x.employerId));
  const hiredBy = (t?: BoardOffer["track"]) => new Set(o.filter((x) => x.hired && (!t || x.track === t)).map((x) => x.employerId));
  const [anyHire, intHire, ftHire] = [hiredBy(), hiredBy("internship"), hiredBy("full_time")];
  return {
    signedUp: emp(e),
    onboarded: emp(e.filter((x) => x.onboarded)),
    viaDrive: emp(e.filter((x) => x.viaDrive)),
    direct: emp(e.filter((x) => !x.viaDrive)),
    indian: emp(e.filter((x) => x.indian)),
    foreign: emp(e.filter((x) => !x.indian)),
    inDriveNow: emp(e.filter((x) => x.inDriveNow)),
    fteApproved: emp(e.filter((x) => x.fte === "approved")),
    fteRequested: emp(e.filter((x) => x.fte === "applied")),
    internshipOffers: off(o.filter((x) => x.track === "internship")),
    fullTimeOffers: off(o.filter((x) => x.track === "full_time")),
    hiredInternship: off(o.filter((x) => x.track === "internship" && x.hired)),
    hiredFullTime: off(o.filter((x) => x.track === "full_time" && x.hired)),
    // The employer journey (Design 07's line): companies, not proposals.
    sentOffer: emp(e.filter((x) => sentBy.has(x.id))),
    madeHire: emp(e.filter((x) => anyHire.has(x.id))),
    hiredOnInternship: emp(e.filter((x) => intHire.has(x.id))),
    hiredOnFullTime: emp(e.filter((x) => ftHire.has(x.id))),
    sizes,
  };
}

export type EmployerMetrics = ReturnType<typeof employerMetrics>;

/** Share as a whole percent, or null when the base is zero (never a made-up 0%). */
export function pct(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 100) : null;
}
