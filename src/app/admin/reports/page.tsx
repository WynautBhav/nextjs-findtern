import { and, count, eq, gte, lt, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import Link from "next/link";
import {
  BarChart3,
  Download,
  Users,
  Building2,
  CalendarCheck,
  CheckCircle2,
  FileSpreadsheet,
  TrendingUp,
  IndianRupee,
} from "lucide-react";

import { getDb, schema } from "@/lib/db";
import { AdminPageHeader, Panel, PanelHeader, PanelBody } from "@/components/admin/panel";
import { StatCard, StatGrid } from "@/components/admin/stat-card";
import { TrendChart, PipelineBars, type TrendPoint } from "@/components/admin/trend-chart";
import { formatMoney, formatNumber } from "@/lib/format";
import { flattenParams, PERIOD_OPTIONS, periodStart } from "@/lib/admin/params";
import { inrMinorSql, meaningfulProfile, realEmployerId, realEmployers } from "@/lib/admin/scope";
import { RevenueChart, type RevenuePoint } from "@/components/admin/finance-charts";

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = flattenParams(await searchParams);
  // A custom from-to range wins over the preset period.
  const validDate = (v?: string) => (v && !Number.isNaN(Date.parse(v)) ? new Date(v) : null);
  const rangeFrom = validDate(params.from);
  const rangeTo = validDate(params.to);
  const since = rangeFrom ?? (rangeTo ? null : periodStart(params.period));
  const until = rangeTo ? new Date(rangeTo.getTime() + 86_400_000) : null;
  /** Totals respect the chosen period; trend charts always show six months. */
  const from = (col: AnyPgColumn) => and(since ? gte(col, since) : undefined, until ? lt(col, until) : undefined);
  const db = getDb();
  // Test employers (the internal "admin" one and the AI-interview one) are not real activity.
  const realProposal = realEmployerId(schema.proposals.employerId);
  const realInterview = realEmployerId(schema.interviews.employerId);

  const [
    [signupsTotal],
    [profilesCompleted],
    [proposalsTotal],
    [interviewsTotal],
    [hiresTotal],
    [companiesTotal],
    [projectsTotal],
    topStatesRaw,
    projectTypesRaw,
    proposalsMonthly,
    interviewsMonthly,
    [revenueTotal],
    revenueMonthly,
  ] = await Promise.all([
    db.select({ c: count() }).from(schema.users).where(and(eq(schema.users.role, "intern"), from(schema.users.createdAt))),
    db
      .select({ c: count() })
      .from(schema.internOnboarding)
      .innerJoin(schema.users, eq(schema.users.id, schema.internOnboarding.userId))
      .where(and(eq(schema.users.role, "intern"), meaningfulProfile(), from(schema.internOnboarding.createdAt))),
    db.select({ c: count() }).from(schema.proposals).where(and(realProposal, from(schema.proposals.createdAt))),
    db.select({ c: count() }).from(schema.interviews).where(and(realInterview, from(schema.interviews.createdAt))),
    db.select({ c: count() }).from(schema.proposals).where(and(realProposal, sql`${schema.proposals.hiredAt} is not null`, from(schema.proposals.hiredAt))),
    db.select({ c: count() }).from(schema.employers).where(and(realEmployers(), from(schema.employers.createdAt))),
    db.select({ c: count() }).from(schema.projects).where(and(realEmployerId(schema.projects.employerId), from(schema.projects.createdAt))),
    db
      .select({
        state: sql<string>`coalesce(${schema.internOnboarding.state}, 'Unlisted')`,
        c: count(),
      })
      .from(schema.internOnboarding)
      .groupBy(sql`coalesce(${schema.internOnboarding.state}, 'Unlisted')`)
      .orderBy(sql`count(*) desc`)
      .limit(6),
    db
      .select({
        locationType: sql<string>`coalesce(${schema.projects.locationType}, 'Remote')`,
        c: count(),
      })
      .from(schema.projects)
      .groupBy(sql`coalesce(${schema.projects.locationType}, 'Remote')`)
      .orderBy(sql`count(*) desc`),
    db
      .select({
        month: sql<string>`to_char(date_trunc('month', ${schema.proposals.createdAt}), 'YYYY-MM')`,
        c: count(),
      })
      .from(schema.proposals)
      .where(sql`${schema.proposals.createdAt} >= date_trunc('month', now()) - interval '5 months'`)
      .groupBy(sql`1`),
    db
      .select({
        month: sql<string>`to_char(date_trunc('month', ${schema.interviews.createdAt}), 'YYYY-MM')`,
        c: count(),
      })
      .from(schema.interviews)
      .where(and(realInterview, sql`${schema.interviews.createdAt} >= date_trunc('month', now()) - interval '5 months'`))
      .groupBy(sql`1`),
    // Revenue: paid employer orders + intern fees in the period, USD converted.
    db
      .select({
        total: sql<number>`(
          coalesce((select sum(${inrMinorSql(schema.employerPayments.amountMinor, schema.employerPayments.currency)}) from ${schema.employerPayments} where ${and(eq(schema.employerPayments.status, "paid"), from(schema.employerPayments.paidAt))}), 0)
          + coalesce((select sum(${inrMinorSql(schema.internPayments.amountMinor, schema.internPayments.currency)}) from ${schema.internPayments} where ${and(eq(schema.internPayments.status, "paid"), from(schema.internPayments.paidAt))}), 0)
        )::bigint`,
      })
      .from(sql`(select 1) as one`),
    Promise.all(
      ([schema.employerPayments, schema.internPayments] as const).map((t) =>
        db
          .select({
            month: sql<string>`to_char(date_trunc('month', ${t.paidAt} AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata'), 'YYYY-MM')`,
            total: sql<number>`coalesce(sum(${inrMinorSql(t.amountMinor, t.currency)}), 0)::bigint`,
          })
          .from(t)
          .where(and(eq(t.status, "paid"), sql`${t.paidAt} >= date_trunc('month', now()) - interval '5 months'`))
          .groupBy(sql`1`),
      ),
    ).then((sets) => sets.flat()),
  ]);

  const totalSignups = Number(signupsTotal?.c ?? 0);
  const totalProfiles = Number(profilesCompleted?.c ?? 0);
  const totalProposals = Number(proposalsTotal?.c ?? 0);
  const totalInterviews = Number(interviewsTotal?.c ?? 0);
  const totalHires = Number(hiresTotal?.c ?? 0);
  const totalCompanies = Number(companiesTotal?.c ?? 0);
  const totalProjects = Number(projectsTotal?.c ?? 0);

  const profileRate = totalSignups > 0 ? Math.round((totalProfiles / totalSignups) * 100) : 0;
  const interviewRate = totalSignups > 0 ? Math.round((totalInterviews / totalSignups) * 100) : 0;
  const hireRate = totalInterviews > 0 ? Math.round((totalHires / totalInterviews) * 100) : 0;


  // Six monthly buckets, zero-filled - the trend chart needs continuity,
  // not just the months that happen to have rows.
  const now = new Date();
  const buckets: { key: string; label: string }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    buckets.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: d.toLocaleString("en-IN", { month: "short" }),
    });
  }
  const proposalsByMonth = new Map(proposalsMonthly.map((r) => [r.month, Number(r.c)]));
  const interviewsByMonth = new Map(interviewsMonthly.map((r) => [r.month, Number(r.c)]));
  const revenueByMonth = new Map<string, number>();
  for (const r of revenueMonthly) revenueByMonth.set(r.month, (revenueByMonth.get(r.month) ?? 0) + Number(r.total));
  const revenueTrend: RevenuePoint[] = buckets.map((b) => ({ label: b.label, totalMinor: revenueByMonth.get(b.key) ?? 0 }));
  const totalRevenue = Number(revenueTotal?.total ?? 0);
  const trend: TrendPoint[] = buckets.map((b) => ({
    label: b.label,
    proposals: proposalsByMonth.get(b.key) ?? 0,
    interviews: interviewsByMonth.get(b.key) ?? 0,
  }));

  const funnelSteps = [
    { status: "registered", label: "Account registered", count: totalSignups },
    { status: "profiled", label: "Profile completed", count: totalProfiles },
    { status: "proposed", label: "Proposal submitted", count: totalProposals },
    { status: "interviewed", label: "Interview scheduled", count: totalInterviews },
    { status: "hired", label: "Candidate hired", count: totalHires },
  ];

  const states = topStatesRaw.map((r) => ({ label: r.state, count: Number(r.c) }));
  const statesMax = Math.max(1, ...states.map((s) => s.count));
  const formats = projectTypesRaw.map((r) => ({ label: r.locationType, count: Number(r.c) }));
  const formatsMax = Math.max(1, ...formats.map((f) => f.count));

  const exports = [
    {
      title: "Intern master file",
      body: "Candidates with contact and profile status.",
      href: "/api/admin/export?type=interns",
    },
    {
      title: "Companies directory",
      body: "Partners, contacts, GST and setup progress.",
      href: "/api/admin/export?type=companies",
    },
    {
      title: "Projects catalog",
      body: "Listings, skills, offers and statuses.",
      href: "/api/admin/export?type=projects",
    },
    {
      title: "Payments ledger",
      body: "Receipts, order IDs, GST split and verification.",
      href: "/api/admin/export?type=payments",
    },
    {
      title: "Intern payouts",
      body: "Stipend transfers, references and schedule.",
      href: "/api/admin/export?type=payouts",
    },
    {
      title: "Intern payments",
      body: "Activation fees, promo codes and GST split.",
      href: "/api/admin/export?type=intern-payments",
    },
  ];

  return (
    <div className="apple-admin space-y-4">
      <AdminPageHeader
        title="Analytics Reports"
        subtitle="Conversion, geography and raw exports."
        action={
          <>
            <Link
              href="/admin/reports/analytics"
              className="inline-flex min-h-11 items-center gap-1.5 rounded-[10px] border border-ink-200 bg-white px-3.5 text-[14px] font-medium text-ink-700 hover:bg-ink-50"
            >
              <BarChart3 className="size-4" aria-hidden />
              Hiring analytics
            </Link>
            <Link
              href="/admin/reports/money"
              className="inline-flex min-h-11 items-center gap-1.5 rounded-[10px] border border-ink-200 bg-white px-3.5 text-[14px] font-medium text-ink-700 hover:bg-ink-50"
            >
              <IndianRupee className="size-4" aria-hidden />
              Money in and out
            </Link>
          </>
        }
      />
      <nav aria-label="Period" className="flex flex-wrap gap-1.5">
        {[{ value: "", label: "All time" }, ...PERIOD_OPTIONS].map((o) => (
          <Link
            key={o.value}
            href={o.value ? `/admin/reports?period=${o.value}` : "/admin/reports"}
            aria-current={(params.period ?? "") === o.value ? "page" : undefined}
            className={`inline-flex min-h-9 items-center rounded-full px-3 text-xs font-medium max-lg:min-h-11 ${
              (params.period ?? "") === o.value ? "bg-ink-900 text-white" : "bg-white text-ink-700 ring-1 ring-ink-200 hover:bg-ink-50"
            }`}
          >
            {o.label}
          </Link>
        ))}
        <form method="get" className="flex flex-wrap items-center gap-1.5 text-xs text-ink-600">
          <label className="inline-flex items-center gap-1">
            From
            <input type="date" name="from" defaultValue={params.from ?? ""} className="h-9 rounded-lg border border-ink-200 px-2 text-sm" />
          </label>
          <label className="inline-flex items-center gap-1">
            To
            <input type="date" name="to" defaultValue={params.to ?? ""} className="h-9 rounded-lg border border-ink-200 px-2 text-sm" />
          </label>
          <button type="submit" className="h-9 rounded-full bg-white px-3 font-medium text-ink-700 ring-1 ring-ink-200 hover:bg-ink-50">
            Apply range
          </button>
        </form>
      </nav>

      <StatGrid cols={4}>
        <StatCard
          label="Revenue collected"
          value={formatMoney(totalRevenue, "INR", { zeroLabel: "₹0" })}
          hint="Paid orders and intern fees · USD at ₹100/$"
          icon={IndianRupee}
          tone="success"
        />
        <StatCard
          label="Profile completion"
          value={`${profileRate}%`}
          hint={`${formatNumber(totalProfiles)} of ${formatNumber(totalSignups)} signups`}
          icon={Users}
          tone="brand"
        />
        <StatCard
          label="Interview conversion"
          value={`${interviewRate}%`}
          hint={`${formatNumber(totalInterviews)} scheduled sessions`}
          icon={CalendarCheck}
          tone="info"
        />
        <StatCard
          label="Hire placement rate"
          value={`${hireRate}%`}
          hint={`${formatNumber(totalHires)} finalized hires`}
          icon={CheckCircle2}
          tone="success"
        />
        <StatCard
          label="Active partners"
          value={formatNumber(totalCompanies)}
          hint={`${formatNumber(totalProjects)} listings published`}
          icon={Building2}
          tone="accent"
        />
      </StatGrid>

      <div className="grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
        <Panel className="bg-white">
          <PanelHeader
            title="Activity trend"
            description="Proposals and interviews over the last six months."
            icon={TrendingUp}
          />
          <PanelBody>
            <TrendChart data={trend} />
          </PanelBody>
        </Panel>

        <Panel className="bg-white">
          <PanelHeader
            title="Revenue trend"
            description="Collected revenue over the last six months (India time)."
            icon={IndianRupee}
          />
          <PanelBody>
            <RevenueChart data={revenueTrend} />
          </PanelBody>
        </Panel>

        <Panel className="bg-white">
          <PanelHeader
            title="Conversion funnel"
            description="Registration to placement."
          />
          <PanelBody>
            <PipelineBars items={funnelSteps} />
          </PanelBody>
        </Panel>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Panel className="bg-white">
          <PanelHeader
            title="Candidate geography"
            description="Top regions by verified profile."
            icon={BarChart3}
          />
          <PanelBody className="space-y-3">
            {states.map((s) => (
              <div key={s.label}>
                <div className="mb-1 flex items-baseline justify-between gap-3">
                  <span className="truncate text-[14px] font-medium tracking-[-0.01em] text-ink-800">
                    {s.label}
                  </span>
                  <span className="shrink-0 text-[13px] font-semibold tabular-nums text-ink-900">
                    {formatNumber(s.count)}
                  </span>
                </div>
                <div aria-hidden className="h-1.5 overflow-hidden rounded-full bg-ink-100">
                  <div
                    className="h-full rounded-full bg-brand-600"
                    style={{ width: `${(s.count / statesMax) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </PanelBody>
        </Panel>

        <Panel className="bg-white">
          <PanelHeader
            title="Workplace format"
            description="Arrangement across listings."
          />
          <PanelBody className="space-y-3">
            {formats.map((f) => (
              <div key={f.label}>
                <div className="mb-1 flex items-baseline justify-between gap-3">
                  <span className="truncate text-[14px] font-medium tracking-[-0.01em] text-ink-800 capitalize">
                    {f.label}
                  </span>
                  <span className="shrink-0 text-[13px] font-semibold tabular-nums text-ink-900">
                    {formatNumber(f.count)}
                  </span>
                </div>
                <div aria-hidden className="h-1.5 overflow-hidden rounded-full bg-ink-100">
                  <div
                    className="h-full rounded-full bg-brand-600"
                    style={{ width: `${(f.count / formatsMax) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </PanelBody>
        </Panel>
      </div>

      <Panel className="bg-white">
        <PanelHeader
          title="Raw data exports"
          description="CSV for offline analysis and auditing."
          icon={FileSpreadsheet}
        />
        <div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-4">
          {exports.map((item) => (
            <div
              key={item.title}
              className="apple-spring flex flex-col justify-between rounded-[10px] border border-ink-200 bg-white p-4 hover:border-brand-300"
            >
              <div>
                <p className="text-[15px] font-semibold tracking-[-0.01em] text-ink-900">
                  {item.title}
                </p>
                <p className="mt-1 text-[13px] leading-relaxed text-text-subtle">
                  {item.body}
                </p>
              </div>
              <a
                href={item.href}
                className="apple-spring apple-pressable mt-4 inline-flex min-h-11 items-center justify-center gap-1.5 rounded-[10px] border border-ink-200 bg-white px-3 text-[13px] font-semibold text-ink-800 hover:bg-ink-50"
              >
                <Download className="size-4" aria-hidden />
                Download CSV
              </a>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
