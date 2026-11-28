/**
 * Admin Master data (/admin/master-data): one row per student, employer and college, with the follow-up log, nudge
 * counts and a heat score. Pure (relative imports only), so the page, the table, the CSV and the tests share one
 * definition: every KPI is `countWhere(rows, filters)`, the same predicate the table filters with.
 *
 * HEAT (score 0-100, highest first by default) = IMPORTANCE + AGING + FOLLOW-UP, clamped to 0-100.
 *
 *  Importance is the first rung that matches (what is at stake, money or a placement):
 *    Student  70 accepted an offer, not paid yet · 60 offer waiting for their reply · 50 interview booked
 *             45 meeting request not answered · 35 hired · 35 AI interview under way (applied/scheduled/sent)
 *             32 interviewed, no offer yet · 30 complete profile, not interviewed · 10 signed up only
 *    Employer  5 frozen or switched off (nothing to chase) · 70 accepted offers not paid · 55 offers waiting for a reply
 *             45 interview booked · 40 open project, no offers sent · 30 has hired · 20 set up, no open project
 *             10 signed up only
 *    College  60 half or more of the bought seats unused · 50 half or more of 5+ students not interviewed
 *             45 drive running now · 40 partner with no seats bought · 25 students placed · 20 students joined
 *             10 no students yet
 *  Aging: days since the last movement (last seen, last offer or meeting, signup; a college's last TPO activity), capped
 *    at 30, scaled by the stake: round(min(30, days) * importance / 70). Nothing known = 30 days. A signup-only student
 *    idle a month gains 4; an unpaid accepted offer idle 10 days gains 10.
 *  Calls (Call 1 / Call 2, the manual follow-up ticks): a call is contact, so aging counts from the later of the last
 *    movement and the latest done call; and each done call takes 5 off (Call 1 −5, Call 2 −5 more). The automatic
 *    Nudge mark does not change heat (an unanswered nudge is not contact).
 *  Level: hot >= 70, warm >= 40, calm below. The table shows it as a 3-step mark with its word, never colour alone.
 */

import { csvCell, istStamp } from "../college/master-row.ts";
import { aiStatusLabel } from "./intern-columns.ts";
import { followUpText, latestCall, type FollowUp, type FollowUpTarget } from "./follow-ups.ts";

const DAY = 86_400_000;

// ── Heat ─────────────────────────────────────────────────────────────────

export type HeatLevel = "hot" | "warm" | "calm";
export type Heat = { score: number; level: HeatLevel; why: string };
export const HOT_AT = 70;
export const WARM_AT = 40;
export const HEAT_LABEL: Record<HeatLevel, string> = { hot: "Hot", warm: "Warm", calm: "Calm" };

export const levelOf = (score: number): HeatLevel => (score >= HOT_AT ? "hot" : score >= WARM_AT ? "warm" : "calm");

function finish(importance: number, reason: string, lastMoveAt: string | null, fu: FollowUp, now: number): Heat {
  const call = latestCall(fu);
  const from = [lastMoveAt, call?.at ?? null].filter((x): x is string => !!x).sort().pop() ?? null;
  const t = from ? Date.parse(from) : NaN;
  const days = Number.isNaN(t) ? 30 : Math.max(0, Math.floor((now - t) / DAY));
  let score = importance + Math.round((Math.min(30, days) * importance) / 70);
  const bits = [reason];
  if (importance > 5 && days >= 2) bits.push(Number.isNaN(t) ? "no activity seen" : `quiet ${days} days`);
  const calls = (fu.call1 ? 1 : 0) + (fu.call2 ? 1 : 0);
  if (calls) { score -= 5 * calls; bits.push(calls === 2 ? "called twice" : "called once"); }
  score = Math.max(0, Math.min(100, score));
  return { score, level: levelOf(score), why: bits.join(" · ") };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export type StudentHeatInput = {
  unpaid: number; offersPending: number; meetingsUpcoming: number; meetingsWaiting: number;
  hired: boolean; aiStatus: string; profileComplete: boolean; lastMoveAt: string | null; followUp: FollowUp;
};
export function studentHeat(s: StudentHeatInput, now: number): Heat {
  const [imp, why]: [number, string] =
    s.unpaid > 0 ? [70, "Accepted an offer, not paid yet"]
    : s.offersPending > 0 ? [60, "Offer waiting for their reply"]
    : s.meetingsUpcoming > 0 ? [50, "Interview booked"]
    : s.meetingsWaiting > 0 ? [45, "Meeting request not answered"]
    : s.hired ? [35, "Hired"]
    : ["applied", "scheduled", "sent"].includes(s.aiStatus) ? [35, "AI interview under way"]
    : s.aiStatus === "completed" ? [32, "Interviewed, no offer yet"]
    : s.profileComplete ? [30, "Complete profile, not interviewed"]
    : [10, "Signed up only"];
  return finish(imp, why, s.lastMoveAt, s.followUp, now);
}

export type EmployerHeatInput = {
  active: boolean; frozen: boolean; unpaid: number; offersPending: number; meetingsUpcoming: number;
  openProjects: number; offersSent: number; hires: number; onboarded: boolean; lastMoveAt: string | null; followUp: FollowUp;
};
export function employerHeat(e: EmployerHeatInput, now: number): Heat {
  const [imp, why]: [number, string] =
    e.frozen ? [5, "Account frozen"]
    : !e.active ? [5, "Account switched off"]
    : e.unpaid > 0 ? [70, `${plural(e.unpaid, "accepted offer")} waiting on payment`]
    : e.offersPending > 0 ? [55, `${plural(e.offersPending, "offer")} waiting for a reply`]
    : e.meetingsUpcoming > 0 ? [45, "Interview booked"]
    : e.openProjects > 0 && e.offersSent === 0 ? [40, "Open project, no offers sent"]
    : e.hires > 0 ? [30, "Has hired"]
    : e.onboarded ? [20, "Set up, no open project"]
    : [10, "Signed up only"];
  return finish(imp, why, e.lastMoveAt, e.followUp, now);
}

export type CollegeHeatInput = {
  seatsBought: number; seatsUsed: number; students: number; notInterviewed: number; liveDrive: boolean; partner: boolean;
  placed: number; lastMoveAt: string | null; followUp: FollowUp;
};
export function collegeHeat(c: CollegeHeatInput, now: number): Heat {
  const unused = Math.max(0, c.seatsBought - c.seatsUsed);
  const [imp, why]: [number, string] =
    c.seatsBought > 0 && unused * 2 >= c.seatsBought ? [60, `${unused} of ${c.seatsBought} seats unused`]
    : c.students >= 5 && c.notInterviewed * 2 >= c.students ? [50, `${c.notInterviewed} of ${c.students} students not interviewed`]
    : c.liveDrive ? [45, "Drive running now"]
    : c.partner && c.seatsBought === 0 ? [40, "Partner, no seats bought"]
    : c.placed > 0 ? [25, `${plural(c.placed, "student")} placed`]
    : c.students > 0 ? [20, "Students joined"]
    : [10, "No students yet"];
  return finish(imp, why, c.lastMoveAt, c.followUp, now);
}

// ── Nudges ───────────────────────────────────────────────────────────────

/** TPO = college_nudges rows (a placement officer's chase); Findtern = notifications of type 'nudge' sent from the admin. */
/** `lastFindtern` is the last admin nudge: the one source of the automatic Nudge follow-up mark. */
export type NudgeTally = { tpo: number; findtern: number; last: string | null; lastFindtern: string | null };
export const NO_NUDGES: NudgeTally = { tpo: 0, findtern: 0, last: null, lastFindtern: null };
export type NudgeSourceRow = { targetId: string; source: "tpo" | "findtern"; n: number; last: Date | string | null };

/** One tally per target from the grouped SQL rows (master-data.ts loadNudgeRows). */
export function nudgeTallies(rows: NudgeSourceRow[]): Map<string, NudgeTally> {
  const out = new Map<string, NudgeTally>();
  for (const r of rows) {
    const cur = out.get(r.targetId) ?? { ...NO_NUDGES };
    cur[r.source] += Number(r.n) || 0;
    const last = r.last ? new Date(r.last).toISOString() : null;
    if (last && (!cur.last || last > cur.last)) cur.last = last;
    if (r.source === "findtern" && last && (!cur.lastFindtern || last > cur.lastFindtern)) cur.lastFindtern = last;
    out.set(r.targetId, cur);
  }
  return out;
}
export const nudgeTotal = (n: NudgeTally) => n.tpo + n.findtern;
/** "TPO 3 · Findtern 1"; "None" with none. */
export function nudgeBreakdown(n: NudgeTally): string {
  if (!nudgeTotal(n)) return "None";
  return [n.tpo ? `TPO ${n.tpo}` : "", n.findtern ? `Findtern ${n.findtern}` : ""].filter(Boolean).join(" · ");
}

// ── Rows ─────────────────────────────────────────────────────────────────

/**
 * Offers by the Proposal pipeline's buckets (proposal-pipeline.ts proposalPipelineStatus) and, for Accepted, its pay split
 * (acceptedPayOf: unpaid = waiting on payment, the sidebar badge's set; processing = payment under way, not unpaid). The
 * buckets add up to `sent`; accepted = unpaid + processing.
 */
export type OfferTally = { sent: number; pending: number; accepted: number; unpaid: number; processing: number; hired: number; rejected: number; withdrawn: number; expired: number };
/** Meetings by the Meeting pipeline's stages (meeting-stage.ts meetingStage): sent = waiting for a reply, accepted = upcoming. */
export type MeetTally = { total: number; sent: number; accepted: number; completed: number; declined: number; expired: number; withdrawn: number };
export const NO_OFFERS: OfferTally = { sent: 0, pending: 0, accepted: 0, unpaid: 0, processing: 0, hired: 0, rejected: 0, withdrawn: 0, expired: 0 };
export const NO_MEETS: MeetTally = { total: 0, sent: 0, accepted: 0, completed: 0, declined: 0, expired: 0, withdrawn: 0 };

export type OfferBucketIn = { bucket: "pending" | "accepted" | "hired" | "rejected" | "withdrawn" | "expired"; pay: "unpaid" | "processing" | null };
export function offerTally(offers: OfferBucketIn[]): OfferTally {
  const t = { ...NO_OFFERS };
  for (const o of offers) {
    t.sent += 1;
    t[o.bucket] += 1;
    if (o.pay) t[o.pay] += 1;
  }
  return t;
}
export function meetTally(stages: string[]): MeetTally {
  const t = { ...NO_MEETS };
  for (const s of stages) {
    t.total += 1;
    if (s === "sent" || s === "accepted" || s === "completed" || s === "declined" || s === "expired" || s === "withdrawn") t[s] += 1;
  }
  return t;
}

export type Stage = "signup" | "profile" | "interviewed" | "offer" | "hired";
export const STAGE_LABEL: Record<Stage, string> = { signup: "Signed up", profile: "Profile complete", interviewed: "AI interviewed", offer: "Has an offer", hired: "Hired" };
/** The furthest step a student reached, the dashboard funnel's order. */
export function stageOf(s: { hired: boolean; offers: number; aiStatus: string; profileComplete: boolean }): Stage {
  return s.hired ? "hired" : s.offers > 0 ? "offer" : s.aiStatus === "completed" ? "interviewed" : s.profileComplete ? "profile" : "signup";
}

export type HiredKinds = { internship: boolean; fullTime: boolean; ppo: boolean };

export type StudentRow = {
  id: string; name: string; email: string | null; phone: string | null;
  college: string | null; city: string | null;
  accountType: "college" | "individual" | null; profileComplete: boolean; profilePct: number;
  aiStatus: string; score: number | null; track: "tech" | "non_tech" | null; openToWork: boolean;
  offers: OfferTally; meetings: MeetTally; hired: HiredKinds;
  lastSeenAt: string | null; activityHidden: boolean; online: boolean; createdAt: string | null;
  stage: Stage; nudges: NudgeTally; followUp: FollowUp; heat: Heat;
};

export type EmployerRow = {
  id: string; company: string; contact: string | null; email: string | null; phone: string | null; city: string | null;
  emailVerified: boolean; fte: string; active: boolean; frozen: boolean; strikes: number;
  pro: string; viaDrive: boolean; inDriveNow: boolean;
  projectsTotal: number; projectsOpen: number; offers: OfferTally; meetings: MeetTally;
  /** Presence as the dashboard reads it (user_presence, hidden when show_activity is off). */
  lastActiveAt: string | null; activityHidden: boolean; createdAt: string | null; nudges: NudgeTally; followUp: FollowUp; heat: Heat;
};

export type CollegeRow = {
  id: string; name: string; city: string | null; partner: boolean;
  tpoName: string | null; tpoEmail: string | null; tpoCount: number;
  students: number; seatsBought: number; seatsUsed: number; drives: number; liveDrive: boolean;
  placed: number; offers: number; notInterviewed: number; lastTpoAt: string | null;
  nudgesSent: number; lastNudgeAt: string | null; followUp: FollowUp; heat: Heat;
};

export type AnyRow = StudentRow | EmployerRow | CollegeRow;

// ── Filters ──────────────────────────────────────────────────────────────

export type Option = { value: string; label: string };
export type FilterDef<R> = { key: string; label: string; options: (rows: R[]) => Option[]; test: (r: R, v: string) => boolean };
export type Filters = Record<string, string>;

const opts = (pairs: [string, string][]): (() => Option[]) => () => pairs.map(([value, label]) => ({ value, label }));
const distinct = (vals: (string | null)[], none: string): Option[] => {
  const set = [...new Set(vals.map((v) => v ?? ""))].sort((a, b) => (a === "" ? 1 : b === "" ? -1 : a.localeCompare(b)));
  return set.map((v) => ({ value: v || "__none", label: v || none }));
};
const eqOrNone = (val: string | null, v: string) => (v === "__none" ? !val : val === v);
const yesNo = (b: boolean, v: string) => (v === "yes" ? b : !b);
const FU_OPTIONS: Option[] = [
  { value: "nothing", label: "Nothing yet" },
  { value: "not-nudged", label: "Not nudged" },
  { value: "nudged", label: "Nudged" },
  { value: "not-called", label: "Not called yet" },
  { value: "call1", label: "Call 1 done" },
  { value: "call2", label: "Call 2 done" },
];
/** The Follow-up filter. "Nothing yet" = no admin nudge and no call; "Not called yet" = no Call 1. */
export function followUpMatches(f: FollowUp, v: string): boolean {
  switch (v) {
    case "nothing": return !f.nudge && !f.call1 && !f.call2;
    case "not-nudged": return !f.nudge;
    case "nudged": return f.nudge !== null;
    case "not-called": return !f.call1;
    case "call1": return f.call1 !== null;
    case "call2": return f.call2 !== null;
    default: return true;
  }
}
const HEAT_FILTER: FilterDef<{ heat: Heat }> = { key: "heat", label: "Heat", options: opts([["hot", "Hot"], ["warm", "Warm"], ["calm", "Calm"]]), test: (r, v) => r.heat.level === v };
const FU_FILTER: FilterDef<{ followUp: FollowUp }> = { key: "followUp", label: "Follow-up", options: () => FU_OPTIONS, test: (r, v) => followUpMatches(r.followUp, v) };

export const anyHired = (h: HiredKinds) => h.internship || h.fullTime || h.ppo;

export const STUDENT_FILTERS: FilterDef<StudentRow>[] = [
  HEAT_FILTER as FilterDef<StudentRow>,
  FU_FILTER as FilterDef<StudentRow>,
  { key: "stage", label: "Stage", options: opts(Object.entries(STAGE_LABEL)), test: (r, v) => r.stage === v },
  { key: "accountType", label: "Account type", options: opts([["college", "College"], ["individual", "Individual"], ["unset", "Not chosen"]]), test: (r, v) => (v === "unset" ? r.accountType === null : r.accountType === v) },
  { key: "college", label: "College", options: (rows) => distinct(rows.map((r) => r.college), "No college"), test: (r, v) => eqOrNone(r.college, v) },
  { key: "profile", label: "Profile", options: opts([["complete", "Profile complete"], ["incomplete", "Profile incomplete"]]), test: (r, v) => yesNo(r.profileComplete, v === "complete" ? "yes" : "no") },
  { key: "ai", label: "AI interview", options: opts(["not_applied", "applied", "scheduled", "sent", "expired", "completed"].map((s) => [s, `AI interview: ${aiStatusLabel(s).toLowerCase()}`])), test: (r, v) => r.aiStatus === v },
  { key: "track", label: "Tech or non-tech", options: opts([["tech", "Tech"], ["non_tech", "Non-tech"], ["unknown", "Not interviewed"]]), test: (r, v) => (v === "unknown" ? r.track === null : r.track === v) },
  { key: "openToWork", label: "Open to work", options: opts([["yes", "Open to work"], ["no", "Not open to work"]]), test: (r, v) => yesNo(r.openToWork, v) },
  { key: "offers", label: "Offers", options: opts([["any", "Has an offer"], ["waiting", "Offer waiting for reply"], ["unpaid", "Accepted, waiting on payment"], ["none", "No offers"]]), test: (r, v) => (v === "any" ? r.offers.sent > 0 : v === "waiting" ? r.offers.pending > 0 : v === "unpaid" ? r.offers.unpaid > 0 : r.offers.sent === 0) },
  { key: "meetings", label: "Meetings", options: opts([["booked", "Interview booked"], ["waiting", "Meeting not answered"], ["done", "Had a meeting"], ["none", "No meetings"]]), test: (r, v) => (v === "booked" ? r.meetings.accepted > 0 : v === "waiting" ? r.meetings.sent > 0 : v === "done" ? r.meetings.completed > 0 : r.meetings.total === 0) },
  { key: "hired", label: "Hired", options: opts([["any", "Hired"], ["internship", "Hired: internship"], ["full_time", "Hired: full-time"], ["ppo", "Hired: PPO"], ["none", "Not hired"]]), test: (r, v) => (v === "any" ? anyHired(r.hired) : v === "none" ? !anyHired(r.hired) : v === "internship" ? r.hired.internship : v === "full_time" ? r.hired.fullTime : r.hired.ppo) },
  { key: "city", label: "City", options: (rows) => distinct(rows.map((r) => r.city), "City not given"), test: (r, v) => eqOrNone(r.city, v) },
];

export const PRO_LABEL: Record<string, string> = { active: "Active", expiring: "Expiring", expired: "Expired", revoked: "Revoked", none: "None" };
export const FTE_LABEL: Record<string, string> = { none: "Not applied", applied: "Applied", approved: "Approved" };

export const EMPLOYER_FILTERS: FilterDef<EmployerRow>[] = [
  HEAT_FILTER as FilterDef<EmployerRow>,
  FU_FILTER as FilterDef<EmployerRow>,
  { key: "standing", label: "Standing", options: opts([["active", "Active"], ["frozen", "Frozen"], ["off", "Switched off"], ["strikes", "Has strikes"]]), test: (r, v) => (v === "active" ? r.active && !r.frozen : v === "frozen" ? r.frozen : v === "off" ? !r.active : r.strikes > 0) },
  { key: "pro", label: "Findtern Pro", options: opts(Object.entries(PRO_LABEL).map(([k, l]) => [k, `Pro: ${l.toLowerCase()}`])), test: (r, v) => r.pro === v },
  { key: "fte", label: "International FTE", options: opts(Object.entries(FTE_LABEL).map(([k, l]) => [k, `FTE: ${l.toLowerCase()}`])), test: (r, v) => r.fte === v },
  { key: "drive", label: "Via drive", options: opts([["yes", "Joined a drive"], ["now", "In a drive now"], ["no", "Never in a drive"]]), test: (r, v) => (v === "now" ? r.inDriveNow : yesNo(r.viaDrive, v)) },
  { key: "projects", label: "Projects", options: opts([["open", "Has an open project"], ["open-no-offer", "Open project, no offers"], ["none", "No projects"]]), test: (r, v) => (v === "open" ? r.projectsOpen > 0 : v === "none" ? r.projectsTotal === 0 : r.projectsOpen > 0 && r.offers.sent === 0) },
  { key: "offers", label: "Offers", options: opts([["waiting", "Offers waiting for a reply"], ["unpaid", "Accepted, waiting on payment"], ["hired", "Has hired"], ["none", "No offers sent"]]), test: (r, v) => (v === "waiting" ? r.offers.pending > 0 : v === "unpaid" ? r.offers.unpaid > 0 : v === "hired" ? r.offers.hired > 0 : r.offers.sent === 0) },
  { key: "verified", label: "Email verified", options: opts([["yes", "Email verified"], ["no", "Email not verified"]]), test: (r, v) => yesNo(r.emailVerified, v) },
];

export const COLLEGE_FILTERS: FilterDef<CollegeRow>[] = [
  HEAT_FILTER as FilterDef<CollegeRow>,
  FU_FILTER as FilterDef<CollegeRow>,
  { key: "partner", label: "Partner", options: opts([["yes", "Partner"], ["no", "Not a partner"]]), test: (r, v) => yesNo(r.partner, v) },
  { key: "seats", label: "Seats", options: opts([["bought", "Seats bought"], ["unused", "Half or more unused"], ["none", "No seats bought"]]), test: (r, v) => (v === "bought" ? r.seatsBought > 0 : v === "none" ? r.seatsBought === 0 : r.seatsBought > 0 && (r.seatsBought - r.seatsUsed) * 2 >= r.seatsBought) },
  { key: "drive", label: "Drives", options: opts([["live", "Drive running now"], ["any", "Has run a drive"], ["none", "No drives"]]), test: (r, v) => (v === "live" ? r.liveDrive : v === "any" ? r.drives > 0 : r.drives === 0) },
  { key: "tpo", label: "TPO login", options: opts([["yes", "Has a TPO login"], ["no", "No TPO login"]]), test: (r, v) => yesNo(r.tpoCount > 0, v) },
];

/** Every word must appear in the row's search text. */
export function matchesSearch(hay: (string | null)[], q: string): boolean {
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const text = hay.filter(Boolean).join(" ").toLowerCase();
  return words.every((w) => text.includes(w));
}
export const searchText = {
  students: (r: StudentRow) => [r.name, r.email, r.phone, r.college, r.city],
  employers: (r: EmployerRow) => [r.company, r.contact, r.email, r.phone, r.city],
  colleges: (r: CollegeRow) => [r.name, r.city, r.tpoName, r.tpoEmail],
};

/** The one filter rule: the table's rows and every KPI count go through it. Unknown keys and blank values filter nothing. */
export function applyFilters<R>(rows: R[], defs: FilterDef<R>[], f: Filters, q = "", hay?: (r: R) => (string | null)[]): R[] {
  const active = defs.filter((d) => f[d.key]);
  return rows.filter((r) => active.every((d) => d.test(r, f[d.key])) && (!q.trim() || !hay || matchesSearch(hay(r), q)));
}
export const countWhere = <R,>(rows: R[], defs: FilterDef<R>[], f: Filters) => applyFilters(rows, defs, f).length;

/** The KPI cards: each one a filter set, counted with applyFilters. */
export type Kpi = { key: string; label: string; hint: string; filters: Filters; tone?: "warning" };
export const KPIS: Kpi[] = [
  { key: "all", label: "Total", hint: "Every record on this tab", filters: {} },
  { key: "hot", label: "Hot now", hint: "Most at stake, quiet longest", filters: { heat: "hot" }, tone: "warning" },
  { key: "hot-open", label: "Hot, not followed up", hint: "No admin nudge and no call", filters: { heat: "hot", followUp: "nothing" }, tone: "warning" },
  { key: "hot-uncalled", label: "Hot, not called", hint: "Hot with no Call 1 yet", filters: { heat: "hot", followUp: "not-called" } },
];

// ── Columns ──────────────────────────────────────────────────────────────

export type ColKind = "text" | "number" | "date" | "special";
export type ColumnDef<R> = {
  key: string; label: string; group: string; kind: ColKind;
  /** The cell as plain text: the table's title and the CSV cell. Missing is "". */
  text: (r: R) => string;
  sort: (r: R) => string | number | null;
};

const dateText = (iso: string | null) => (iso ? istStamp(iso) : "");
const dateSort = (iso: string | null) => (iso ? Date.parse(iso) : null);
const yes = (b: boolean) => (b ? "Yes" : "No");
const lc = (s: string | null) => (s ? s.toLowerCase() : null);
const num = <R,>(key: string, label: string, group: string, get: (r: R) => number): ColumnDef<R> => ({ key, label, group, kind: "number", text: (r) => String(get(r)), sort: get });
const txt = <R,>(key: string, label: string, group: string, get: (r: R) => string | null): ColumnDef<R> => ({ key, label, group, kind: "text", text: (r) => get(r) ?? "", sort: (r) => lc(get(r)) });
const date = <R,>(key: string, label: string, group: string, get: (r: R) => string | null): ColumnDef<R> => ({ key, label, group, kind: "date", text: (r) => dateText(get(r)), sort: (r) => dateSort(get(r)) });

export function offerText(o: OfferTally): string {
  if (!o.sent) return "";
  return [`${o.sent} sent`, o.pending && `${o.pending} pending`, o.unpaid && `${o.unpaid} waiting on payment`, o.processing && `${o.processing} payment under way`, o.hired && `${o.hired} hired`, o.rejected && `${o.rejected} rejected`, o.expired && `${o.expired} expired`, o.withdrawn && `${o.withdrawn} withdrawn`].filter(Boolean).join(" · ");
}
export function meetText(m: MeetTally): string {
  if (!m.total) return "";
  return [`${m.total} total`, m.sent && `${m.sent} waiting`, m.accepted && `${m.accepted} upcoming`, m.completed && `${m.completed} completed`, m.declined && `${m.declined} declined`, m.expired && `${m.expired} expired`, m.withdrawn && `${m.withdrawn} withdrawn`].filter(Boolean).join(" · ");
}
export function hiredText(h: HiredKinds): string {
  return [h.internship && "Internship", h.fullTime && "Full-time", h.ppo && "PPO"].filter(Boolean).join(" · ");
}
const ACCOUNT_LABEL = { college: "College", individual: "Individual" } as const;
const TRACK_LABEL = { tech: "Tech", non_tech: "Non-tech" } as const;

const heatCol = <R extends { heat: Heat }>(): ColumnDef<R> => ({ key: "heat", label: "Heat", group: "Follow-up", kind: "special", text: (r) => `${HEAT_LABEL[r.heat.level]} ${r.heat.score}: ${r.heat.why}`, sort: (r) => r.heat.score });
const fuStatusCol = <R extends { followUp: FollowUp }>(): ColumnDef<R> => ({ key: "followUp", label: "Follow-up", group: "Follow-up", kind: "special", text: (r) => followUpText(r.followUp), sort: (r) => (r.followUp.nudge ? 1 : 0) + (r.followUp.call1 ? 2 : 0) + (r.followUp.call2 ? 4 : 0) });
const fuNoteCol = <R extends { followUp: FollowUp }>(): ColumnDef<R> => txt<R>("followUpNote", "Call note", "Follow-up", (r) => latestCall(r.followUp)?.note ?? null);
const fuAtCol = <R extends { followUp: FollowUp }>(): ColumnDef<R> => date<R>("followUpAt", "Last call", "Follow-up", (r) => latestCall(r.followUp)?.at ?? null);

export const STUDENT_COLUMNS: ColumnDef<StudentRow>[] = [
  { key: "name", label: "Name", group: "Student", kind: "special", text: (r) => r.name, sort: (r) => r.name.toLowerCase() },
  heatCol(),
  txt("email", "Email", "Student", (r) => r.email),
  txt("phone", "Phone", "Student", (r) => r.phone),
  txt("college", "College", "Student", (r) => r.college),
  txt("city", "City", "Student", (r) => r.city),
  txt("accountType", "Account type", "Student", (r) => (r.accountType ? ACCOUNT_LABEL[r.accountType] : "Not chosen")),
  { key: "profile", label: "Profile", group: "Journey", kind: "text", text: (r) => (r.profileComplete ? "Complete" : `${r.profilePct}%`), sort: (r) => (r.profileComplete ? 101 : r.profilePct) },
  txt("stage", "Stage", "Journey", (r) => STAGE_LABEL[r.stage]),
  txt("aiStatus", "AI interview", "Journey", (r) => aiStatusLabel(r.aiStatus)),
  { key: "score", label: "Findtern score", group: "Journey", kind: "number", text: (r) => (r.score === null ? "" : r.score.toFixed(1)), sort: (r) => r.score },
  txt("track", "Tech or non-tech", "Journey", (r) => (r.track ? TRACK_LABEL[r.track] : "")),
  txt("openToWork", "Open to work", "Journey", (r) => yes(r.openToWork)),
  { key: "offers", label: "Offers", group: "Placement", kind: "text", text: (r) => offerText(r.offers), sort: (r) => (r.offers.sent ? r.offers.sent : null) },
  { key: "meetings", label: "Meetings", group: "Placement", kind: "text", text: (r) => meetText(r.meetings), sort: (r) => (r.meetings.total ? r.meetings.total : null) },
  { key: "hired", label: "Hired", group: "Placement", kind: "text", text: (r) => hiredText(r.hired), sort: (r) => (anyHired(r.hired) ? hiredText(r.hired).toLowerCase() : null) },
  { key: "lastSeenAt", label: "Last seen", group: "Activity", kind: "date", text: (r) => (r.activityHidden ? "Hidden" : r.lastSeenAt ? dateText(r.lastSeenAt) : "Never"), sort: (r) => dateSort(r.lastSeenAt) },
  date("createdAt", "Signed up", "Activity", (r) => r.createdAt),
  num("nudges", "Nudges", "Activity", (r) => nudgeTotal(r.nudges)),
  date("lastNudgedAt", "Last nudged", "Activity", (r) => r.nudges.last),
  fuStatusCol(), fuNoteCol(), fuAtCol(),
];

export const EMPLOYER_COLUMNS: ColumnDef<EmployerRow>[] = [
  { key: "company", label: "Company", group: "Company", kind: "special", text: (r) => r.company, sort: (r) => r.company.toLowerCase() },
  heatCol(),
  txt("contact", "Contact", "Company", (r) => r.contact),
  txt("email", "Email", "Company", (r) => r.email),
  txt("phone", "Phone", "Company", (r) => r.phone),
  txt("city", "City", "Company", (r) => r.city),
  txt("emailVerified", "Email verified", "Account", (r) => yes(r.emailVerified)),
  txt("fte", "International FTE", "Account", (r) => FTE_LABEL[r.fte] ?? r.fte),
  { key: "standing", label: "Standing", group: "Account", kind: "text", text: (r) => (r.frozen ? "Frozen" : r.active ? "Active" : "Switched off"), sort: (r) => (r.frozen ? 2 : r.active ? 0 : 1) },
  num("strikes", "Strikes", "Account", (r) => r.strikes),
  txt("pro", "Findtern Pro", "Account", (r) => PRO_LABEL[r.pro] ?? r.pro),
  txt("viaDrive", "Via drive", "Account", (r) => (r.inDriveNow ? "In a drive now" : r.viaDrive ? "Yes" : "No")),
  { key: "projects", label: "Projects", group: "Hiring", kind: "text", text: (r) => (r.projectsTotal ? `${r.projectsTotal} total · ${r.projectsOpen} open` : ""), sort: (r) => (r.projectsTotal ? r.projectsOpen * 1000 + r.projectsTotal : null) },
  num("offersSent", "Offers sent", "Hiring", (r) => r.offers.sent),
  num("offersWaiting", "Pending", "Hiring", (r) => r.offers.pending),
  num("offersAccepted", "Accepted", "Hiring", (r) => r.offers.accepted),
  num("unpaid", "Waiting on payment", "Hiring", (r) => r.offers.unpaid),
  num("hires", "Hired", "Hiring", (r) => r.offers.hired),
  { key: "meetings", label: "Meetings", group: "Hiring", kind: "text", text: (r) => meetText(r.meetings), sort: (r) => (r.meetings.total ? r.meetings.total : null) },
  { key: "lastActiveAt", label: "Last active", group: "Activity", kind: "date", text: (r) => (r.activityHidden ? "Hidden" : r.lastActiveAt ? dateText(r.lastActiveAt) : "Never"), sort: (r) => dateSort(r.lastActiveAt) },
  date("createdAt", "Signed up", "Activity", (r) => r.createdAt),
  num("nudges", "Nudges", "Activity", (r) => nudgeTotal(r.nudges)),
  date("lastNudgedAt", "Last nudged", "Activity", (r) => r.nudges.last),
  fuStatusCol(), fuNoteCol(), fuAtCol(),
];

export const COLLEGE_COLUMNS: ColumnDef<CollegeRow>[] = [
  { key: "name", label: "College", group: "College", kind: "special", text: (r) => r.name, sort: (r) => r.name.toLowerCase() },
  heatCol(),
  txt("city", "City", "College", (r) => r.city),
  txt("partner", "Partner", "College", (r) => yes(r.partner)),
  { key: "tpo", label: "TPO contact", group: "College", kind: "text", text: (r) => (r.tpoName ? [r.tpoName, r.tpoEmail].filter(Boolean).join(", ") + (r.tpoCount > 1 ? ` (+${r.tpoCount - 1})` : "") : ""), sort: (r) => lc(r.tpoName) },
  num("students", "Students joined", "Placement", (r) => r.students),
  { key: "seats", label: "Seats used", group: "Placement", kind: "text", text: (r) => (r.seatsBought ? `${r.seatsUsed} of ${r.seatsBought}` : ""), sort: (r) => (r.seatsBought ? r.seatsUsed / r.seatsBought : null) },
  num("drives", "Drives", "Placement", (r) => r.drives),
  num("notInterviewed", "Not interviewed", "Placement", (r) => r.notInterviewed),
  num("offers", "Offers", "Placement", (r) => r.offers),
  num("placed", "Students placed", "Placement", (r) => r.placed),
  date("lastTpoAt", "Last TPO activity", "Activity", (r) => r.lastTpoAt),
  num("nudgesSent", "Nudges by TPO", "Activity", (r) => r.nudgesSent),
  date("lastNudgeAt", "Last TPO nudge", "Activity", (r) => r.lastNudgeAt),
  fuStatusCol(), fuNoteCol(), fuAtCol(),
];

/** Sort by one column; missing values sink to the bottom either way; ties by the first column's text. */
export function sortRows<R>(rows: R[], col: ColumnDef<R>, dir: "asc" | "desc", tie: ColumnDef<R>): R[] {
  const d = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = col.sort(a), y = col.sort(b);
    const t = tie.text(a).localeCompare(tie.text(b));
    if (x === null && y === null) return t;
    if (x === null) return 1;
    if (y === null) return -1;
    return (x < y ? -1 : x > y ? 1 : 0) * d || t;
  });
}

/** The CSV of exactly the shown columns, in order, for the given rows. Formula-safe (master-row csvCell). */
export function rowsCsv<R>(rows: R[], cols: ColumnDef<R>[]): string {
  const head = cols.map((c) => csvCell(c.label)).join(",");
  const body = rows.map((r) => cols.map((c) => csvCell(c.text(r))).join(","));
  return "﻿" + [head, ...body].join("\r\n") + "\r\n";
}

// ── Tabs ─────────────────────────────────────────────────────────────────

export type TabKey = "students" | "employers" | "colleges";
export const TAB_TARGET: Record<TabKey, FollowUpTarget> = { students: "student", employers: "employer", colleges: "college" };

export type View = { id: string; name: string; columns: string[]; filters: Filters; sort: { key: string; dir: "asc" | "desc" } };
const HEAT_SORT = { key: "heat", dir: "desc" } as const;

export const VIEWS: Record<TabKey, View[]> = {
  students: [
    { id: "work", name: "Work list", columns: ["name", "heat", "college", "stage", "offers", "lastSeenAt", "nudges", "lastNudgedAt", "followUp", "followUpNote"], filters: {}, sort: HEAT_SORT },
    { id: "money", name: "Waiting on payment", columns: ["name", "heat", "phone", "college", "offers", "lastSeenAt", "followUp", "followUpNote"], filters: { offers: "unpaid" }, sort: HEAT_SORT },
    { id: "stuck", name: "Ready, not interviewed", columns: ["name", "heat", "phone", "college", "profile", "aiStatus", "lastSeenAt", "nudges", "followUp"], filters: { stage: "profile" }, sort: HEAT_SORT },
    { id: "placement", name: "Offers and meetings", columns: ["name", "heat", "college", "aiStatus", "score", "offers", "meetings", "hired"], filters: {}, sort: HEAT_SORT },
    { id: "contacts", name: "Contact sheet", columns: ["name", "email", "phone", "college", "city", "accountType"], filters: {}, sort: { key: "name", dir: "asc" } },
    { id: "follow", name: "Follow-ups", columns: ["name", "heat", "phone", "followUp", "followUpNote", "followUpAt", "nudges", "lastNudgedAt"], filters: {}, sort: { key: "followUpAt", dir: "desc" } },
  ],
  employers: [
    { id: "work", name: "Work list", columns: ["company", "heat", "contact", "projects", "offersWaiting", "unpaid", "lastActiveAt", "nudges", "lastNudgedAt", "followUp", "followUpNote"], filters: {}, sort: HEAT_SORT },
    { id: "money", name: "Waiting on payment", columns: ["company", "heat", "contact", "phone", "unpaid", "offersAccepted", "lastActiveAt", "followUp"], filters: { offers: "unpaid" }, sort: HEAT_SORT },
    { id: "idle", name: "Open project, no offers", columns: ["company", "heat", "contact", "phone", "projects", "offersSent", "lastActiveAt", "followUp"], filters: { projects: "open-no-offer" }, sort: HEAT_SORT },
    { id: "account", name: "Account standing", columns: ["company", "standing", "strikes", "pro", "fte", "emailVerified", "viaDrive"], filters: {}, sort: { key: "company", dir: "asc" } },
    { id: "contacts", name: "Contact sheet", columns: ["company", "contact", "email", "phone", "city"], filters: {}, sort: { key: "company", dir: "asc" } },
  ],
  colleges: [
    { id: "work", name: "Work list", columns: ["name", "heat", "tpo", "students", "seats", "drives", "placed", "lastTpoAt", "nudgesSent", "lastNudgeAt", "followUp", "followUpNote"], filters: {}, sort: HEAT_SORT },
    { id: "seats", name: "Seats unused", columns: ["name", "heat", "tpo", "seats", "students", "notInterviewed", "lastTpoAt", "followUp"], filters: { seats: "unused" }, sort: HEAT_SORT },
    { id: "activity", name: "TPO activity", columns: ["name", "heat", "tpo", "lastTpoAt", "nudgesSent", "lastNudgeAt", "drives"], filters: {}, sort: { key: "lastTpoAt", dir: "desc" } },
  ],
};

