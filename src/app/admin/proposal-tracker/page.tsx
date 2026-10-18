import { desc, eq } from "drizzle-orm";
import { Send, CheckCircle2, Clock, Download, Sparkles } from "lucide-react";

import { getDb, schema } from "@/lib/db";
import { flattenParams } from "@/lib/admin/params";
import { acceptanceRate, proposalOutcome } from "@/lib/proposals";
import { AdminPageHeader } from "@/components/admin/panel";
import { StatCard, StatGrid } from "@/components/admin/stat-card";
import {
  ProposalTrackerView,
  type TrackerCompany,
  type TrackerProposal,
  type TrackerInterview,
  type TrackerCandidate,
} from "@/components/admin/proposal-tracker-view";
import { formatNumber } from "@/lib/format";

/** `YYYY-MM-DD` → Date, or null. `endOfDay` makes the "to" bound inclusive. */
function parseDay(value: string | undefined, endOfDay = false): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00"}+05:30`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export default async function AdminProposalTrackerPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = flattenParams(await searchParams);
  const initialTab =
    params.tab === "proposals" ||
    params.tab === "interviews" ||
    params.tab === "companies" ||
    params.tab === "candidates"
      ? (params.tab as "companies" | "proposals" | "interviews" | "candidates")
      : "companies";
  const from = parseDay(params.from);
  const to = parseDay(params.to, true);
  const inRange = (d: Date | null) => (!from || (d !== null && d >= from)) && (!to || (d !== null && d <= to));

  const db = getDb();

  const [employersList, allProposals, allInterviews] = await Promise.all([
    db.select().from(schema.employers).orderBy(desc(schema.employers.createdAt)),
    db
      .select({
        id: schema.proposals.id,
        status: schema.proposals.status,
        flowType: schema.proposals.flowType,
        currency: schema.proposals.currency,
        offerDetails: schema.proposals.offerDetails,
        createdAt: schema.proposals.createdAt,
        hiredAt: schema.proposals.hiredAt,
        internId: schema.proposals.internId,
        internFirstName: schema.users.firstName,
        internLastName: schema.users.lastName,
        internEmail: schema.users.email,
        internPhone: schema.users.phoneNumber,
        employerId: schema.proposals.employerId,
        companyName: schema.employers.companyName,
        projectId: schema.proposals.projectId,
        projectName: schema.projects.projectName,
      })
      .from(schema.proposals)
      .leftJoin(schema.users, eq(schema.users.id, schema.proposals.internId))
      .leftJoin(schema.employers, eq(schema.employers.id, schema.proposals.employerId))
      .leftJoin(schema.projects, eq(schema.projects.id, schema.proposals.projectId))
      .orderBy(desc(schema.proposals.createdAt)),
    db
      .select({
        id: schema.interviews.id,
        status: schema.interviews.status,
        slot1: schema.interviews.slot1,
        slot2: schema.interviews.slot2,
        slot3: schema.interviews.slot3,
        selectedSlot: schema.interviews.selectedSlot,
        timezone: schema.interviews.timezone,
        meetingLink: schema.interviews.meetingLink,
        notes: schema.interviews.notes,
        createdAt: schema.interviews.createdAt,
        internId: schema.interviews.internId,
        internFirstName: schema.users.firstName,
        internLastName: schema.users.lastName,
        internEmail: schema.users.email,
        employerId: schema.interviews.employerId,
        companyName: schema.employers.companyName,
        projectId: schema.interviews.projectId,
        projectName: schema.projects.projectName,
      })
      .from(schema.interviews)
      .leftJoin(schema.users, eq(schema.users.id, schema.interviews.internId))
      .leftJoin(schema.employers, eq(schema.employers.id, schema.interviews.employerId))
      .leftJoin(schema.projects, eq(schema.projects.id, schema.interviews.projectId))
      .orderBy(desc(schema.interviews.createdAt)),
  ]);

  // Every figure below is computed from the same date-filtered rows, so the
  // stat cards, company cards and tables always agree with each other.
  const rawProposals = allProposals.filter((p) => inRange(p.createdAt));
  const rawInterviews = allInterviews.filter((i) => inRange(i.createdAt));

  const totalCount = rawProposals.length;
  const wonTotal = rawProposals.filter((p) => proposalOutcome(p.status) === "won").length;
  const lostTotal = rawProposals.filter((p) => proposalOutcome(p.status) === "lost").length;
  const directTotal = rawProposals.filter((p) => p.flowType === "direct").length;
  const interviewTotal = rawProposals.filter((p) => p.flowType === "interview_first").length;
  const overallRate = acceptanceRate(wonTotal, lostTotal);

  // Group metrics per employer
  const proposalsByEmployer = new Map<string, number>();
  const hiredByEmployer = new Map<string, number>();
  const lostByEmployer = new Map<string, number>();
  const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
  for (const p of rawProposals) {
    if (p.employerId) {
      bump(proposalsByEmployer, p.employerId);
      const outcome = proposalOutcome(p.status);
      if (outcome === "won") bump(hiredByEmployer, p.employerId);
      if (outcome === "lost") bump(lostByEmployer, p.employerId);
    }
  }

  // Per candidate: who received proposals, from whom, and what they decided.
  const byIntern = new Map<string, TrackerCandidate>();
  for (const p of rawProposals) {
    const row =
      byIntern.get(p.internId) ??
      ({
        internId: p.internId,
        name: `${p.internFirstName ?? ""} ${p.internLastName ?? ""}`.trim() || "Candidate",
        email: p.internEmail,
        phone: p.internPhone,
        received: 0,
        won: 0,
        lost: 0,
        open: 0,
        companies: [],
        lastReceivedAt: null,
      } satisfies TrackerCandidate);
    row.received += 1;
    row[proposalOutcome(p.status)] += 1;
    const company = p.companyName ?? "Unknown Company";
    if (!row.companies.includes(company)) row.companies.push(company);
    const at = p.createdAt?.toISOString() ?? null;
    if (at && (!row.lastReceivedAt || at > row.lastReceivedAt)) row.lastReceivedAt = at;
    byIntern.set(p.internId, row);
  }
  const trackerCandidates = Array.from(byIntern.values()).sort((a, b) => b.received - a.received);

  const interviewsByEmployer = new Map<string, number>();
  for (const i of rawInterviews) {
    if (i.employerId) {
      interviewsByEmployer.set(i.employerId, (interviewsByEmployer.get(i.employerId) ?? 0) + 1);
    }
  }

  const trackerCompanies: TrackerCompany[] = employersList.map((emp) => ({
    id: emp.id,
    companyName: emp.companyName,
    companyEmail: emp.companyEmail,
    city: emp.city,
    state: emp.state,
    isActive: emp.isActive,
    proposalsCount: proposalsByEmployer.get(emp.id) ?? 0,
    interviewsCount: interviewsByEmployer.get(emp.id) ?? 0,
    hiredCount: hiredByEmployer.get(emp.id) ?? 0,
    rejectedCount: lostByEmployer.get(emp.id) ?? 0,
    acceptanceRate: acceptanceRate(hiredByEmployer.get(emp.id) ?? 0, lostByEmployer.get(emp.id) ?? 0),
  }));

  const trackerProposals: TrackerProposal[] = rawProposals.map((p) => ({
    id: p.id,
    status: p.status,
    flowType: p.flowType,
    currency: p.currency,
    offerDetails: (p.offerDetails as Record<string, unknown>) || null,
    createdAt: p.createdAt ? p.createdAt.toISOString() : null,
    hiredAt: p.hiredAt ? p.hiredAt.toISOString() : null,
    internId: p.internId,
    internFirstName: p.internFirstName,
    internLastName: p.internLastName,
    internEmail: p.internEmail,
    internPhone: p.internPhone,
    employerId: p.employerId ?? "",
    companyName: p.companyName ?? "Unknown Company",
    projectId: p.projectId,
    projectName: p.projectName ?? "Project",
  }));

  const trackerInterviews: TrackerInterview[] = rawInterviews.map((i) => ({
    id: i.id,
    status: i.status,
    slot1: i.slot1 ? i.slot1.toISOString() : null,
    slot2: i.slot2 ? i.slot2.toISOString() : null,
    slot3: i.slot3 ? i.slot3.toISOString() : null,
    selectedSlot: i.selectedSlot,
    timezone: i.timezone,
    meetingLink: i.meetingLink,
    notes: i.notes,
    createdAt: i.createdAt ? i.createdAt.toISOString() : null,
    internId: i.internId,
    internFirstName: i.internFirstName,
    internLastName: i.internLastName,
    internEmail: i.internEmail,
    employerId: i.employerId,
    companyName: i.companyName ?? "Unknown Company",
    projectId: i.projectId,
    projectName: i.projectName,
  }));

  const exportHref = `/api/admin/export?type=proposals`;
  const rangeLabel =
    from || to
      ? `${params.from ?? "start"} to ${params.to ?? "today"}`
      : "All time";

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Proposal Pipeline"
        subtitle="End to end proposal pipeline between employers and student candidates."
        action={
          <a
            href={exportHref}
            className="apple-spring apple-pressable inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-[10px] border border-ink-200 bg-white px-3.5 text-[14px] font-medium text-ink-700 hover:bg-ink-50"
          >
            <Download className="size-4" aria-hidden />
            Export CSV
          </a>
        }
      />

      {/* The date range lives in its own row: beside the title it was wider
          than a phone screen and pushed the Export button off the edge. */}
      <form
        method="get"
        className="grid grid-cols-2 items-end gap-2 sm:flex sm:flex-wrap"
        aria-label="Date range"
      >
        <input type="hidden" name="tab" value={initialTab} />
        <label className="min-w-0 text-2xs font-medium text-ink-600">
          From
          <input
            type="date"
            name="from"
            defaultValue={params.from ?? ""}
            className="mt-1 block min-h-11 w-full min-w-0 rounded-[10px] border border-ink-200 bg-white px-2.5 text-[13px] text-ink-800 sm:w-auto"
          />
        </label>
        <label className="min-w-0 text-2xs font-medium text-ink-600">
          To
          <input
            type="date"
            name="to"
            defaultValue={params.to ?? ""}
            className="mt-1 block min-h-11 w-full min-w-0 rounded-[10px] border border-ink-200 bg-white px-2.5 text-[13px] text-ink-800 sm:w-auto"
          />
        </label>
        <button
          type="submit"
          className="apple-spring apple-pressable col-span-2 min-h-11 rounded-[10px] bg-brand-700 px-3.5 text-[14px] font-medium text-white hover:bg-brand-600 sm:col-span-1"
        >
          Apply
        </button>
        <span className="col-span-2 self-center text-[13px] text-text-subtle sm:col-span-1 sm:ml-1 sm:self-end sm:pb-3">
          {rangeLabel}
        </span>
      </form>

      <StatGrid cols={4}>
        <StatCard
          label="Total proposals"
          value={formatNumber(totalCount)}
          hint={rangeLabel}
          icon={Send}
          tone="brand"
        />
        <StatCard
          label="Accepted or hired"
          value={formatNumber(wonTotal)}
          hint={
            overallRate === null
              ? `${rangeLabel} · nothing decided yet`
              : `${rangeLabel} · ${overallRate}% of decided (${formatNumber(lostTotal)} rejected)`
          }
          icon={CheckCircle2}
          tone="success"
        />
        <StatCard
          label="Direct hiring path"
          value={formatNumber(directTotal)}
          hint="Instant project offers"
          icon={Sparkles}
          tone="accent"
        />
        <StatCard
          label="Interview first path"
          value={formatNumber(interviewTotal)}
          hint="Evaluated via interview"
          icon={Clock}
          tone="info"
        />
      </StatGrid>

      {/* 3 Tabs + Interactive Modals */}
      <ProposalTrackerView
        companies={trackerCompanies}
        proposals={trackerProposals}
        interviews={trackerInterviews}
        candidates={trackerCandidates}
        initialTab={initialTab}
      />
    </div>
  );
}
