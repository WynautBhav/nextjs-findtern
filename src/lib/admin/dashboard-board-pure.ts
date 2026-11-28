/**
 * The admin dashboard's numbers (Students | Employers | Colleges), computed from the rows `loadDashboardBoard` returns.
 * Pure, so the server, the client tabs and the tests share one definition: every count is the length of the list it
 * opens.
 */

import { isHiredProposal } from "../hire-status.ts";
import { feedbackTextOf } from "../interview-feedback.ts";
import { effectiveProposalStatus, type ExpiryInput } from "../proposal-expiry.ts";
import { proposalOutcome } from "../proposals.ts";
import type { MeetingStage } from "./meeting-stage.ts";

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
/** One stage per meeting (meeting-stage.ts): the dashboard and /admin/meetings count the same rows. */
export type MeetStage = MeetingStage;

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
  /** What the student chose on the profile (intern-account.ts getAccountType); null = never chose (older accounts). */
  accountType: "college" | "individual" | null;
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
  /** A full-time offer made after an internship with the same company (offerDetails.fullTimeOffer.baseProposalId). */
  ppo: boolean;
  roleTitle: string | null;
  createdAt: string | null;
};

export type BoardMeeting = {
  id: string; internId: string; employerId: string; employer: string; stage: MeetStage; startsAt: string | null;
  /** Withdrawn only: who withdrew it and why. Completed only: the employer's written feedback. */
  reason: string | null; feedback: string | null;
};

const BY: Record<string, string> = { employer: "the employer", intern: "the student", admin: "Findtern" };

/** What a meeting's row says beyond its stage (admin only; the feedback is the text the employer wrote, interview-feedback.ts). */
export function meetingDetail(m: { stage: MeetStage; cancelledBy: string | null; cancelReason: string | null; notes: string | null }): { reason: string | null; feedback: string | null } {
  if (m.stage === "withdrawn") {
    const by = m.cancelledBy && BY[m.cancelledBy] ? ` by ${BY[m.cancelledBy]}` : "";
    const why = (m.cancelReason ?? "").trim();
    return { reason: `Withdrawn${by}${why ? `: ${why}` : ", no reason given"}`, feedback: null };
  }
  if (m.stage === "completed") return { reason: null, feedback: feedbackTextOf(m.notes) || "No feedback written" };
  return { reason: null, feedback: null };
}

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
export function offerReply(status: string, hired: boolean): OfferReply {
  if (hired || proposalOutcome(status) === "won") return "accepted";
  if (status === "rejected") return "rejected";
  if (status === "expired") return "expired";
  if (status === "withdrawn") return "withdrawn";
  return "pending"; // sent, interview_scheduled
}

/**
 * The reply as every screen shows it: an offer the clock has expired (unanswered or unpaid past its start day) reads
 * expired even before the sweeper stores it, the same rule as the Proposal pipeline and Reports (effectiveProposalStatus).
 */
export function offerReplyOf(p: ExpiryInput & { status: string }, now: Date = new Date()): OfferReply {
  return offerReply(effectiveProposalStatus(p, now), isHiredProposal(p));
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
  const placements = offers.filter((o) => o.hired);
  const reply = (t: BoardOffer["track"], r: OfferReply) => off(offers.filter((o) => o.track === t && o.reply === r));

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
    accountCollege: stu(students.filter((s) => s.accountType === "college")),
    accountIndividual: stu(students.filter((s) => s.accountType === "individual")),
    accountUnset: stu(students.filter((s) => s.accountType === null)),

    // Every hire (a placement, so a student with an internship and then a PPO counts twice): the four parts add up.
    placeAll: off(placements),
    placeInternRunning: off(placements.filter((o) => o.track === "internship" && o.status !== "completed")),
    placeInternCompleted: off(placements.filter((o) => o.track === "internship" && o.status === "completed")),
    placeFullTime: off(placements.filter((o) => o.track === "full_time" && !o.ppo)),
    placePpo: off(placements.filter((o) => o.track === "full_time" && o.ppo)),

    offersAwaiting: off(offers.filter((o) => o.reply === "pending")),
    meetingsAwaiting: meet(meetings.filter((m) => m.stage === "sent")),
    // Meetings: the total splits into completed, upcoming (accepted, not yet held), waiting (meetingsAwaiting: no
    // reply yet), declined, expired and withdrawn.
    meetsAll: meet(meetings),
    meetsCompleted: meet(meetings.filter((m) => m.stage === "completed")),
    meetsUpcoming: meet(meetings.filter((m) => m.stage === "accepted")),
    meetsDeclined: meet(meetings.filter((m) => m.stage === "declined")),
    meetsExpired: meet(meetings.filter((m) => m.stage === "expired")),
    meetsWithdrawn: meet(meetings.filter((m) => m.stage === "withdrawn")),
    // Each offer type: its total, split by the student's reply (the five parts add up to the total).
    internshipAll: off(offers.filter((o) => o.track === "internship")),
    internshipAccepted: reply("internship", "accepted"),
    internshipRejected: reply("internship", "rejected"),
    internshipExpired: reply("internship", "expired"),
    internshipWithdrawn: reply("internship", "withdrawn"),
    internshipWaiting: reply("internship", "pending"),
    fullTimeAll: off(offers.filter((o) => o.track === "full_time")),
    fullTimeAccepted: reply("full_time", "accepted"),
    fullTimeRejected: reply("full_time", "rejected"),
    fullTimeExpired: reply("full_time", "expired"),
    fullTimeWithdrawn: reply("full_time", "withdrawn"),
    fullTimeWaiting: reply("full_time", "pending"),
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

/** Two initials from a name, letters and digits only ("Acme (Test)" → "AT"), or "·" when there are none. */
export function initials(name: string) {
  const parts = name.split(/\s+/).map((w) => w.replace(/[^\p{L}\p{N}]/gu, "")).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "·";
}

/** A stack of one block per item, at most `cap` tall: past the cap, the last block becomes "+N". */
export function stackOf(ids: string[], cap = 10) {
  if (ids.length <= cap) return { shown: ids, more: 0 };
  return { shown: ids.slice(0, cap - 1), more: ids.length - (cap - 1) };
}

export type FunnelStop = { reached: string[]; waiting: string[]; skipped: string[] };

/**
 * Milestones as a journey. Each step is the people who did that step; a stop counts everyone who did it or any later
 * step (a student can be AI-interviewed with an unfinished profile), so every stop sits inside the one before and the
 * drop between two stops is exactly the people waiting there. `skipped` is who moved on without doing this step.
 */
export function funnel(steps: string[][]): FunnelStop[] {
  const out: FunnelStop[] = [];
  let later: string[] = [];
  for (let i = steps.length - 1; i >= 0; i--) {
    const own = new Set(steps[i]);
    const reached = [...steps[i], ...later.filter((id) => !own.has(id))];
    const after = new Set(later);
    out[i] = { reached, waiting: reached.filter((id) => !after.has(id)), skipped: reached.filter((id) => !own.has(id)) };
    later = reached;
  }
  out[steps.length - 1].waiting = [];
  return out;
}
