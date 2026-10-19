import { parseOffer } from "../offer.ts";
import { toInrMinor } from "./money.ts";

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
  onboarding: { userId: string; createdAt: Date | null; meaningful: boolean; feePaid: boolean; score: number | null }[];
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
  employerPayments: { amountMinor: number; currency: string; status: string; paidAt: Date | null; createdAt: Date | null }[];
  internPayments: { amountMinor: number; currency: string; status: string; paidAt: Date | null; createdAt: Date | null }[];
};

const pct = (n: number, d: number) => (d > 0 ? Number(((n / d) * 100).toFixed(1)) : 0);
const ratio = (n: number, d: number) => (d > 0 ? Number((n / d).toFixed(1)) : 0);
const HIRED = new Set(["accepted", "hired"]);

export function computeAnalytics(input: AnalyticsInput) {
  const { since, until } = input;
  const inRange = (d: Date | null | undefined) => {
    if (!d) return false;
    const t = new Date(d).getTime();
    return (!since || t >= since.getTime()) && (!until || t < until.getTime());
  };

  const onboardingIn = input.onboarding.filter((o) => inRange(o.createdAt));
  const proposalsIn = input.proposals.filter((p) => inRange(p.createdAt));
  const interviewsIn = input.interviews.filter((i) => inRange(i.createdAt));
  const employersIn = input.employers.filter((e) => inRange(e.createdAt));
  const projectsIn = input.projects.filter((p) => inRange(p.createdAt));
  const hiresIn = input.proposals.filter((p) => p.status === "hired" && inRange(p.hiredAt));
  const isFullTime = (p: { offerDetails: unknown; currency: string | null }) => Boolean(parseOffer(p.offerDetails, p.currency).fullTime);

  const signups = onboardingIn.length;
  const activeUsers = onboardingIn.filter((o) => o.meaningful).length;
  const applied = new Set(proposalsIn.map((p) => p.internId));
  const interviewed = new Set(interviewsIn.map((i) => i.internId));
  const placed = new Set(proposalsIn.filter((p) => HIRED.has(p.status)).map((p) => p.internId));
  const companies = employersIn.length;
  const fullTimeProposals = proposalsIn.filter(isFullTime).length;

  const sumInr = (rows: AnalyticsInput["employerPayments"]) =>
    rows.filter((r) => r.status === "paid" && inRange(r.paidAt ?? r.createdAt)).reduce((s, r) => s + toInrMinor(r.amountMinor, r.currency), 0);
  const revenueEmployersMinor = sumInr(input.employerPayments);
  const revenueInternsMinor = sumInr(input.internPayments);

  const hireDays = hiresIn
    .map((p) => (p.createdAt && p.hiredAt ? (new Date(p.hiredAt).getTime() - new Date(p.createdAt).getTime()) / 86_400_000 : null))
    .filter((d): d is number => d != null && d >= 0);

  // Growth: signups in this window against the same-length window before it.
  let monthlyGrowth: number | null = null;
  if (since) {
    const end = until ?? new Date();
    const span = end.getTime() - since.getTime();
    const prev = input.onboarding.filter((o) => {
      const t = o.createdAt ? new Date(o.createdAt).getTime() : NaN;
      return t >= since.getTime() - span && t < since.getTime();
    }).length;
    monthlyGrowth = prev > 0 ? pct(signups - prev, prev) : null;
  }

  const totals = {
    signups,
    activeUsers,
    companies,
    projects: projectsIn.length,
    activeProjects: projectsIn.filter((p) => (p.status ?? "active").toLowerCase() === "active" || !p.status).length,
    proposals: proposalsIn.length,
    internshipProposals: proposalsIn.length - fullTimeProposals,
    fullTimeProposals,
    pendingProposals: proposalsIn.filter((p) => ["sent", "draft", "interview_scheduled", "under_review"].includes(p.status)).length,
    hires: hiresIn.length,
    fullTimeHires: hiresIn.filter(isFullTime).length,
    revenueMinor: revenueEmployersMinor + revenueInternsMinor,
    revenueEmployersMinor,
    revenueInternsMinor,
  };

  const rates = {
    avgAppsPerUser: ratio(proposalsIn.length, signups),
    placementRate: pct(placed.size, applied.size),
    projectsPerCompany: ratio(input.projects.length, companies),
    hiresPerCompany: ratio(hiresIn.length, companies),
    successRate: pct(hiresIn.length, proposalsIn.length),
    interviewRate: pct(interviewed.size, applied.size),
    profileCompletionRate: pct(activeUsers, signups),
    applicationSuccessRate: pct(hiresIn.length, applied.size),
    avgHireTimeDays: hireDays.length ? Number((hireDays.reduce((a, b) => a + b, 0) / hireDays.length).toFixed(1)) : null,
    monthlyGrowth,
  };

  const base = Math.max(1, signups);
  const stage = (label: string, value: number) => ({ stage: label, value, percentage: pct(value, base) });
  const funnel = [
    stage("Signed up", signups),
    stage("Profile complete", activeUsers),
    stage("Fee paid", onboardingIn.filter((o) => o.feePaid).length),
    stage("AI interview scored", onboardingIn.filter((o) => (o.score ?? 0) > 0).length),
    stage("Received an offer", onboardingIn.filter((o) => applied.has(o.userId)).length),
    stage("Hired", onboardingIn.filter((o) => input.proposals.some((p) => p.internId === o.userId && p.status === "hired")).length),
  ];

  // Monthly trend over the range (or the last 6 months when open-ended).
  // Month buckets in UTC so the server's own time zone cannot add a month.
  const end = until ?? new Date();
  const start = since ?? new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 5, 1));
  const trend: { month: string; proposals: number; hires: number; successRate: number; interviewRate: number }[] = [];
  for (
    let m = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
    m < end && trend.length < 24;
    m = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 1))
  ) {
    const next = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 1));
    const within = (d: Date | null) => d != null && new Date(d) >= m && new Date(d) < next;
    const props = input.proposals.filter((p) => within(p.createdAt));
    const app = new Set(props.map((p) => p.internId));
    const intv = new Set(input.interviews.filter((i) => within(i.createdAt)).map((i) => i.internId));
    const hires = input.proposals.filter((p) => p.status === "hired" && within(p.hiredAt)).length;
    trend.push({
      month: m.toLocaleString("en-IN", { month: "short", year: "2-digit", timeZone: "UTC" }),
      proposals: props.length,
      hires,
      successRate: pct(hires, props.length),
      interviewRate: pct(intv.size, app.size),
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
      const sent = input.proposals.filter((p) => p.employerId === e.id).length;
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
    .sort((a, b) => b.hires - a.hires || b.proposals - a.proposals || b.projects - a.projects)
    .slice(0, 5);

  const internName = new Map(input.interns.map((u) => [u.id, `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || "Candidate"]));
  const byIntern = new Map<string, { applications: number; offers: number }>();
  for (const p of input.proposals) {
    const cur = byIntern.get(p.internId) ?? { applications: 0, offers: 0 };
    cur.applications++;
    if (HIRED.has(p.status)) cur.offers++;
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

  return { totals, rates, funnel, trend, skillDemand, regionDemand, highestPayingSkills, topCompanies, topInterns, hiredList };
}

export type Analytics = ReturnType<typeof computeAnalytics>;
