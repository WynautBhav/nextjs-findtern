import { and, count, gte, sql } from "drizzle-orm";
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
} from "lucide-react";

import { getDb, schema } from "@/lib/db";
import { AdminPageHeader, Panel, PanelHeader, PanelBody } from "@/components/admin/panel";
import { StatCard, StatGrid } from "@/components/admin/stat-card";
import { TrendChart, PipelineBars, type TrendPoint } from "@/components/admin/trend-chart";
import { formatNumber } from "@/lib/format";
import { flattenParams, PERIOD_OPTIONS, periodStart } from "@/lib/admin/params";

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = flattenParams(await searchParams);
  const since = periodStart(params.period);
  /** Totals respect the chosen period; trend charts always show six months. */
  const from = (col: AnyPgColumn) => (since ? gte(col, since) : undefined);
  const db = getDb();

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
  ] = await Promise.all([
    db.select({ c: count() }).from(schema.users).where(from(schema.users.createdAt)),
    db.select({ c: count() }).from(schema.internOnboarding).where(from(schema.internOnboarding.createdAt)),
    db.select({ c: count() }).from(schema.proposals).where(from(schema.proposals.createdAt)),
    db.select({ c: count() }).from(schema.interviews).where(from(schema.interviews.createdAt)),
    db.select({ c: count() }).from(schema.proposals).where(and(sql`${schema.proposals.hiredAt} is not null`, from(schema.proposals.hiredAt))),
    db.select({ c: count() }).from(schema.employers).where(from(schema.employers.createdAt)),
    db.select({ c: count() }).from(schema.projects).where(from(schema.projects.createdAt)),
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
      .where(sql`${schema.interviews.createdAt} >= date_trunc('month', now()) - interval '5 months'`)
      .groupBy(sql`1`),
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
      body: "Receipts, order IDs and verification.",
      href: "/api/admin/export?type=payments",
    },
  ];

  return (
    <div className="apple-admin space-y-4">
      <AdminPageHeader
        title="Analytics Reports"
        subtitle="Conversion, geography and raw exports."
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
      </nav>

      <StatGrid cols={4}>
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
