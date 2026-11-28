import { isSettledStatus } from "../refund-accounting.ts";
import { parseOffer } from "../offer.ts";
import { toInrMinor } from "./money.ts";
import { revenueMinorOf } from "./revenue.ts";
import { shortDateTime } from "../format.ts";
import { isHiredProposal } from "../hire-status.ts";
import { effectiveProposalStatus } from "../proposal-expiry.ts";

/**
 * Hiring analytics (legacy `GET /api/admin/reports/analytics`,
 * routes.ts:5455-6400), computed from rows the loader has already narrowed to
 * real companies (test employers out) and interns. Pure, so it is testable
 * and the page and the JSON export cannot disagree.
 *
 * Differences from legacy, on purpose:
 *  - money is summed in INR (USD converted at the business rate), never
 *    rupees and dollars added raw;
 *  - "hired" uses `hiredAt` (the moment the employer paid) instead of
 *    re-deriving it from order notes;
 *  - the funnel follows this product's real steps (profile → fee → AI
 *    interview → offer → hire) instead of legacy's "completed interview".
 */

export type AnalyticsInput = {
  since: Date | null;
  until: Date | null;
  interns: { id: string; firstName: string | null; lastName: string | null; createdAt: Date | null }[];
  /** `complete` is the admin's complete-profile rule (loadCompleteProfileIds), the same set the Interns page and Dashboard use. */
  onboarding: { userId: string; createdAt: Date | null; complete: boolean; feePaid: boolean; score: number | null }[];
  employers: { id: string; companyName: string; createdAt: Date | null }[];
  projects: { id: string; employerId: string; status: string | null; skills: unknown; city: string | null; state: string | null; createdAt: Date | null }[];
  proposals: {
    id: string;
    employerId: string;
    internId: string;
    projectId: string;
    status: string;
    offerDetails: unknown;
    currency: string | null;
    createdAt: Date | null;
    hiredAt: Date | null;
  }[];
  interviews: { internId: string; employerId: string; status: string; createdAt: Date | null }[];
  employerPayments: { employerId?: string; amountMinor: number; currency: string; status: string; paidAt: Date | null; createdAt: Date | null; /** Lets a payroll invoice leave its pass-through salary out of revenue (revenue.ts). */ raw?: unknown }[];
  internPayments: { amountMinor: number; currency: string; status: string; paidAt: Date | null; createdAt: Date | null }[];
  /** Paid college seat batches count as revenue like employer orders. */
  collegeBatches?: { amountMinor: number; status: string; paidAt: Date | null; createdAt: Date | null }[];
  /** Interns who gave a city, most first, already grouped and limited in SQL; `citiesTotal` is everyone who gave one. */
  cities?: { city: string; count: number }[];
  citiesTotal?: number;
};

const pct = (n: number, d: number) => (d > 0 ? Number(((n / d) * 100).toFixed(1)) : 0);
const ratio = (n: number, d: number) => (d > 0 ? Number((n / d).toFixed(1)) : 0);
/**
 * A hire is a hire date or status hired/completed (college master-data, lib/hire-status), never a bare `accepted`: an accepted
 * offer is unpaid, the employer still sees the intern masked, and it can expire unpaid.
 */
export const isHire = (p: { status: string; hiredAt?: Date | string | null }) => isHiredProposal({ ...p, status: p.status.trim() });

export function computeAnalytics(input: AnalyticsInput) {
  const { since, until } = input;
  const inRange = (d: Date | null | undefined) => {
    if (!d) return false;
    const t = new Date(d).getTime();
    return (!since || t >= since.getTime()) && (!until || t < until.getTime());
  };

  // A draft has not been sent to anyone: it is not an offer, an application or a "Sent" status (the dashboard and the
  // Proposals pages already leave drafts out). Counting them put 35 "offers sent" here against 33 on the dashboard.
  const proposals = input.proposals.filter((p) => p.status.trim().toLowerCase() !== "draft");
  // A signup is an intern account made in the range (Overview's "New interns"), not a profile row touched in it.
  const signedUpIn = new Set(input.interns.filter((i) => inRange(i.createdAt)).map((i) => i.id));
  const onboardingOf = new Map(input.onboarding.map((o) => [o.userId, o]));
  const onboardingIn = [...signedUpIn].map((id) => onboardingOf.get(id) ?? { userId: id, createdAt: null, complete: false, feePaid: false, score: null });
  const proposalsIn = proposals.filter((p) => inRange(p.createdAt));
  const interviewsIn = input.interviews.filter((i) => inRange(i.createdAt));
  const employersIn = input.employers.filter((e) => inRange(e.createdAt));
  const projectsIn = input.projects.filter((p) => inRange(p.createdAt));
  const hiresIn = proposals.filter((p) => isHire(p) && inRange(p.hiredAt));
  const isFullTime = (p: { offerDetails: unknown; currency: string | null }) => Boolean(parseOffer(p.offerDetails, p.currency).fullTime);

  const signups = onboardingIn.length;
  const activeUsers = onboardingIn.filter((o) => o.complete).length;
  const applied = new Set(proposalsIn.map((p) => p.internId));
  const interviewed = new Set(interviewsIn.map((i) => i.internId));
  const placed = new Set(proposalsIn.filter(isHire).map((p) => p.internId));
  const companies = employersIn.length;
  const fullTimeProposals = proposalsIn.filter(isFullTime).length;

  const sumInr = (rows: AnalyticsInput["employerPayments"]) =>
    // Gross, like Collected (receivables-load paidReceipts): a refunded or partly refunded order was money received.
    rows.filter((r) => isSettledStatus(r.status) && inRange(r.paidAt ?? r.createdAt)).reduce((s, r) => s + toInrMinor(revenueMinorOf(r), r.currency), 0);
  const revenueEmployersMinor = sumInr(input.employerPayments);
  const revenueInternsMinor = sumInr(input.internPayments);
  const revenueCollegesMinor = sumInr((input.collegeBatches ?? []).map((b) => ({ ...b, currency: "INR" })));

  const hireDays = hiresIn
    .map((p) => (p.createdAt && p.hiredAt ? (new Date(p.hiredAt).getTime() - new Date(p.createdAt).getTime()) / 86_400_000 : null))
    .filter((d): d is number => d != null && d >= 0);

  // Growth: signups in this window against the same-length window before it.
  let monthlyGrowth: number | null = null;
  if (since) {
    const end = until ?? new Date();
    const span = end.getTime() - since.getTime();
    const prev = input.interns.filter((o) => {
      const t = o.createdAt ? new Date(o.createdAt).getTime() : NaN;
      return t >= since.getTime() - span && t < since.getTime();
    }).length;
    monthlyGrowth = prev > 0 ? pct(signups - prev, prev) : null;
  }

  // Employer behaviour (legacy routes.ts:6226-6270): active = posted a
  // project or sent an offer in the range; repeat = paid two or more orders
  // in the range.
  const activeEmployerIds = new Set([...projectsIn.map((p) => p.employerId), ...proposalsIn.map((p) => p.employerId)]);
  const paidOrders = new Map<string, number>();
  const realEmployer = new Set(input.employers.map((e) => e.id));
  for (const pay of input.employerPayments) {
    if (!pay.employerId || !realEmployer.has(pay.employerId) || !isSettledStatus(pay.status) || !inRange(pay.paidAt ?? pay.createdAt)) continue;
    paidOrders.set(pay.employerId, (paidOrders.get(pay.employerId) ?? 0) + 1);
  }
  const repeatEmployers = [...paidOrders.values()].filter((n) => n >= 2).length;
  const activeProjects = projectsIn.filter((p) => !p.status || ["active", "published"].includes(p.status.toLowerCase())).length;

  const totals = {
    signups,
    activeUsers,
    companies,
    projects: projectsIn.length,
    activeProjects,
    activeEmployers: activeEmployerIds.size,
    repeatEmployers,
    proposals: proposalsIn.length,
    internshipProposals: proposalsIn.length - fullTimeProposals,
    fullTimeProposals,
    pendingProposals: proposalsIn.filter((p) => ["sent", "draft", "interview_scheduled", "under_review"].includes(effectiveProposalStatus(p))).length,
    hires: hiresIn.length,
    fullTimeHires: hiresIn.filter(isFullTime).length,
    revenueMinor: revenueEmployersMinor + revenueInternsMinor + revenueCollegesMinor,
    revenueEmployersMinor,
    revenueInternsMinor,
    revenueCollegesMinor,
  };

  const rates = {
    avgAppsPerUser: ratio(proposalsIn.length, signups),
    placementRate: pct(placed.size, applied.size),
    // Projects posted in the range over companies that joined in the range: the same window on both sides (it was every
    // project ever over the range's companies, which inflated the figure for any period shorter than the platform's life).
    projectsPerCompany: ratio(projectsIn.length, companies),
    hiresPerCompany: ratio(hiresIn.length, companies),
    successRate: pct(hiresIn.length, proposalsIn.length),
    interviewRate: pct(interviewed.size, applied.size),
    profileCompletionRate: pct(activeUsers, signups),
    applicationSuccessRate: pct(hiresIn.length, applied.size),
    avgHireTimeDays: hireDays.length ? Number((hireDays.reduce((a, b) => a + b, 0) / hireDays.length).toFixed(1)) : null,
    monthlyGrowth,
    /** Share of all real companies that were active in the range. */
    activeEmployerRate: pct(activeEmployerIds.size, input.employers.length),
    /** Share of active companies that paid two or more orders. */
    repeatEmployerRate: pct(repeatEmployers, activeEmployerIds.size),
    /** Share of projects posted in the range that are still open. */
    activeProjectRate: pct(activeProjects, projectsIn.length),
  };

  const base = Math.max(1, signups);
  const stage = (label: string, value: number) => ({ stage: label, value, percentage: pct(value, base) });
  const funnel = [
    stage("Signed up", signups),
    stage("Profile complete", activeUsers),
    stage("Fee paid", onboardingIn.filter((o) => o.feePaid).length),
    stage("AI interview scored", onboardingIn.filter((o) => (o.score ?? 0) > 0).length),
    stage("Received an offer", onboardingIn.filter((o) => applied.has(o.userId)).length),
    stage("Hired", onboardingIn.filter((o) => proposals.some((p) => p.internId === o.userId && isHire(p))).length),
  ];

  // Monthly trend over the range (or the last 6 months when open-ended).
  // Month buckets in UTC so the server's own time zone cannot add a month.
  const end = until ?? new Date();
  const start = since ?? new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 5, 1));
  const trend: { month: string; proposals: number; hires: number; successRate: number; interviewRate: number; interns: number; companies: number }[] = [];
  for (
    let m = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
    m < end && trend.length < 24;
    m = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 1))
  ) {
    const next = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 1));
    const within = (d: Date | null) => d != null && new Date(d) >= m && new Date(d) < next;
    const props = proposals.filter((p) => within(p.createdAt));
    const app = new Set(props.map((p) => p.internId));
    const intv = new Set(input.interviews.filter((i) => within(i.createdAt)).map((i) => i.internId));
    const hires = proposals.filter((p) => isHire(p) && within(p.hiredAt)).length;
    trend.push({
      month: shortDateTime(m, { month: "short", year: "2-digit", timeZone: "UTC" }),
      proposals: props.length,
      hires,
      successRate: pct(hires, props.length),
      interviewRate: pct(intv.size, app.size),
      // Legacy's growth chart: new interns (profile created) and new companies per month.
      interns: input.onboarding.filter((o) => within(o.createdAt)).length,
      companies: input.employers.filter((e) => within(e.createdAt)).length,
    });
  }

  const skillsOf = (v: unknown) => (Array.isArray(v) ? v.map((s) => String(s).trim()).filter(Boolean) : []);
  const skillCounts = new Map<string, number>();
  for (const p of projectsIn) for (const s of skillsOf(p.skills)) skillCounts.set(s, (skillCounts.get(s) ?? 0) + 1);
  const skillDemand = [...skillCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([skill, count]) => ({ skill, count }));

  const regionCounts = new Map<string, number>();
  for (const p of projectsIn) {
    const region = (p.state || p.city || "Remote / unlisted").trim();
    regionCounts.set(region, (regionCounts.get(region) ?? 0) + 1);
  }
  const regionDemand = [...regionCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([region, count]) => ({ region, count }));

  // Average monthly offer per skill, from offers on projects needing that skill.
  const projectById = new Map(input.projects.map((p) => [p.id, p]));
  const pay = new Map<string, { sum: number; n: number }>();
  for (const p of proposalsIn) {
    const offer = parseOffer(p.offerDetails, p.currency);
    if (offer.fullTime || offer.monthlyMinor == null) continue;
    const monthly = toInrMinor(offer.monthlyMinor, offer.currency);
    for (const s of skillsOf(projectById.get(p.projectId)?.skills)) {
      const cur = pay.get(s) ?? { sum: 0, n: 0 };
      pay.set(s, { sum: cur.sum + monthly, n: cur.n + 1 });
    }
  }
  const highestPayingSkills = [...pay.entries()]
    .map(([skill, v]) => ({ skill, avgMonthlyMinor: Math.round(v.sum / v.n), offers: v.n }))
    .sort((a, b) => b.avgMonthlyMinor - a.avgMonthlyMinor)
    .slice(0, 8);

  const topCompanies = input.employers
    .map((e) => {
      const hires = hiresIn.filter((p) => p.employerId === e.id);
      const sent = proposals.filter((p) => p.employerId === e.id).length;
      const fullTime = hires.filter(isFullTime).length;
      return {
        id: e.id,
        name: e.companyName,
        projects: input.projects.filter((p) => p.employerId === e.id).length,
        proposals: sent,
        internshipHires: hires.length - fullTime,
        fullTimeHires: fullTime,
        hires: hires.length,
        conversion: pct(hires.length, sent),
      };
    })
    .filter((c) => c.proposals > 0 || c.projects > 0)
    // Legacy status: a company with a project is active.
    .map((c) => ({ ...c, status: c.projects > 0 ? ("active" as const) : ("inactive" as const) }))
    .sort((a, b) => b.hires - a.hires || b.proposals - a.proposals || b.projects - a.projects);

  const internName = new Map(input.interns.map((u) => [u.id, `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || "Candidate"]));
  const byIntern = new Map<string, { applications: number; offers: number }>();
  for (const p of proposals) {
    const cur = byIntern.get(p.internId) ?? { applications: 0, offers: 0 };
    cur.applications++;
    if (isHire(p)) cur.offers++;
    byIntern.set(p.internId, cur);
  }
  const topInterns = [...byIntern.entries()]
    .map(([id, v]) => {
      const interviews = input.interviews.filter((i) => i.internId === id).length;
      return {
        id,
        name: internName.get(id) ?? "Candidate",
        applications: v.applications,
        interviews,
        offers: v.offers,
        status: v.offers > 0 ? "placed" : interviews > 0 ? "interviewing" : "applied",
      };
    })
    .sort((a, b) => b.offers - a.offers || b.interviews - a.interviews || b.applications - a.applications)
    .slice(0, 5);

  const employerName = new Map(input.employers.map((e) => [e.id, e.companyName]));
  const hiredList = hiresIn
    .map((p) => ({
      internId: p.internId,
      internName: internName.get(p.internId) ?? "Candidate",
      companyId: p.employerId,
      companyName: employerName.get(p.employerId) ?? "Company",
      hiredAt: p.hiredAt ? new Date(p.hiredAt).toISOString() : null,
      kind: isFullTime(p) ? ("full-time" as const) : ("internship" as const),
    }))
    .sort((a, b) => String(b.hiredAt).localeCompare(String(a.hiredAt)));

  // Legacy's "Application status" tiles: every proposal ever, whatever the period (legacy server/routes.ts:6461-6497).
  const applicationStatus = applicationStatusBuckets(proposals.map((p) => ({ status: p.status, fullTime: isFullTime(p), hired: isHire(p) })));
  const cities = topWithOthers(input.cities ?? [], input.citiesTotal ?? 0);

  return { totals, rates, funnel, trend, skillDemand, regionDemand, highestPayingSkills, topCompanies, topInterns, hiredList, applicationStatus, cities };
}

const STATUS_ORDER = ["Sent", "Under Review", "Interviewed", "Hired (Internship)", "Hired (Full-time)", "Accepted, not paid", "Rejected", "Expired", "Withdrawn"];

/** Offer-status groups with counts, largest first; empty groups are left out. Hired is a paid hire only (isHire), so it matches Hires above. */
export function applicationStatusBuckets(rows: { status: string; fullTime: boolean; hired: boolean }[]): { name: string; value: number }[] {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const raw = r.status.trim().toLowerCase();
    if (!raw || raw === "draft") continue;
    const name =
      // Hired is a paid hire only (isHire, the rule every screen uses); a yes still being paid for is apart.
      r.hired ? (r.fullTime ? "Hired (Full-time)" : "Hired (Internship)")
      : raw === "accepted" || raw === "processing" ? "Accepted, not paid"
      : raw === "rejected" ? "Rejected"
      : raw === "interview_scheduled" || raw === "interviewed" ? "Interviewed"
      : raw === "under_review" || raw === "review" || raw === "reviewing" ? "Under Review"
      : raw === "expired" ? "Expired"
      : raw === "withdrawn" ? "Withdrawn"
      : "Sent";
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return STATUS_ORDER.filter((n) => counts.has(n))
    .map((name) => ({ name, value: counts.get(name)! }))
    .sort((a, b) => b.value - a.value);
}

/** The top rows plus one "Others" row for the rest, each with its share of `total` (one decimal). */
export function topWithOthers(rows: { city: string; count: number }[], total: number): { city: string; count: number; percentage: number }[] {
  if (rows.length === 0 || total <= 0) return [];
  const out = rows.map((r) => ({ city: r.city, count: r.count, percentage: pct(r.count, total) }));
  const rest = total - rows.reduce((s, r) => s + r.count, 0);
  if (rest > 0) out.push({ city: "Others", count: rest, percentage: pct(rest, total) });
  return out;
}

/** Top companies: the status chip and a name search together (legacy had both). */
export function filterCompanies<T extends { name: string; status: string }>(list: T[], f: { status: string; q: string }): T[] {
  const q = f.q.trim().toLowerCase();
  return list.filter((c) => (!f.status || c.status === f.status) && (!q || c.name.toLowerCase().includes(q)));
}

export type Analytics = ReturnType<typeof computeAnalytics>;

export type HireFilter = { kind: "" | "internship" | "full-time"; from: string; to: string; q: string };

/** The hires list filters (legacy: type, hired-date range, search). Dates are `YYYY-MM-DD`, inclusive. */
export function filterHires(list: Analytics["hiredList"], f: HireFilter): Analytics["hiredList"] {
  const q = f.q.trim().toLowerCase();
  return list.filter((h) => {
    if (f.kind && h.kind !== f.kind) return false;
    const day = h.hiredAt ? h.hiredAt.slice(0, 10) : "";
    if (f.from && (!day || day < f.from)) return false;
    if (f.to && (!day || day > f.to)) return false;
    if (q && !`${h.internName} ${h.companyName}`.toLowerCase().includes(q)) return false;
    return true;
  });
}
