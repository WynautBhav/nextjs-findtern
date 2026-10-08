import { count, sql } from "drizzle-orm";
import {
  BarChart3,
  Download,
  Users,
  Building2,
  Briefcase,
  CalendarCheck,
  CheckCircle2,
  FileSpreadsheet,
  TrendingUp,
} from "lucide-react";

import { getDb, schema } from "@/lib/db";
import { AdminPageHeader, Panel, PanelHeader } from "@/components/admin/panel";
import { StatCard, StatGrid } from "@/components/admin/stat-card";

export default async function AdminReportsPage() {
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
  ] = await Promise.all([
    db.select({ c: count() }).from(schema.users),
    db.select({ c: count() }).from(schema.internOnboarding),
    db.select({ c: count() }).from(schema.proposals),
    db.select({ c: count() }).from(schema.interviews),
    db.select({ c: count() }).from(schema.proposals).where(sql`${schema.proposals.hiredAt} is not null`),
    db.select({ c: count() }).from(schema.employers),
    db.select({ c: count() }).from(schema.projects),
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

  const num = (n: number) => n.toLocaleString("en-IN");

  const funnelSteps = [
    { label: "Account registered", count: totalSignups, pct: 100, color: "bg-brand-600" },
    { label: "Profile completed", count: totalProfiles, pct: profileRate, color: "bg-brand-700" },
    {
      label: "Proposal submitted",
      count: totalProposals,
      pct: totalSignups > 0 ? Math.round((totalProposals / totalSignups) * 100) : 0,
      color: "bg-emerald-600",
    },
    {
      label: "Interview scheduled",
      count: totalInterviews,
      pct: totalSignups > 0 ? Math.round((totalInterviews / totalSignups) * 100) : 0,
      color: "bg-amber-600",
    },
    {
      label: "Candidate hired",
      count: totalHires,
      pct: totalSignups > 0 ? Math.round((totalHires / totalSignups) * 100) : 0,
      color: "bg-purple-600",
    },
  ];

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Reports"
        subtitle="Platform conversion funnel, geographic spread and automated data exports."
      />

      <StatGrid cols={4}>
        <StatCard
          label="Profile completion"
          value={`${profileRate}%`}
          hint={`${num(totalProfiles)} of ${num(totalSignups)} signups`}
          icon={Users}
          tone="brand"
        />
        <StatCard
          label="Interview conversion"
          value={`${interviewRate}%`}
          hint={`${num(totalInterviews)} scheduled sessions`}
          icon={CalendarCheck}
          tone="info"
        />
        <StatCard
          label="Hire placement rate"
          value={`${hireRate}%`}
          hint={`${num(totalHires)} finalized hires`}
          icon={CheckCircle2}
          tone="success"
        />
        <StatCard
          label="Active partners"
          value={num(totalCompanies)}
          hint={`${num(totalProjects)} listings published`}
          icon={Building2}
          tone="accent"
        />
      </StatGrid>

      {/* Funnel breakdown */}
      <Panel>
        <PanelHeader
          title="Candidate conversion funnel"
          description="Progression from initial student registration through to placement."
          icon={TrendingUp}
        />
        <div className="space-y-4 px-6 py-5">
          {funnelSteps.map((step) => (
            <div key={step.label} className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-ink-800">{step.label}</span>
                <span className="text-text-subtle tabular-nums font-medium">
                  {num(step.count)} ({step.pct}%)
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-ink-100">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${step.color}`}
                  style={{ width: `${Math.max(4, Math.min(100, step.pct))}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </Panel>

      {/* Geography and Projects split */}
      <div className="grid gap-6 md:grid-cols-2">
        <Panel>
          <PanelHeader
            title="Candidate geography"
            description="Top regional distribution of verified intern profiles."
            icon={BarChart3}
          />
          <div className="divide-y divide-ink-100 px-6 py-2">
            {topStatesRaw.map((row) => (
              <div key={row.state} className="flex items-center justify-between py-2.5 text-sm">
                <span className="font-medium text-ink-800">{row.state}</span>
                <span className="text-text-subtle tabular-nums font-semibold">
                  {num(Number(row.c))}
                </span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel>
          <PanelHeader
            title="Project workplace format"
            description="Workplace arrangement across posted listings."
            icon={Briefcase}
          />
          <div className="divide-y divide-ink-100 px-6 py-2">
            {projectTypesRaw.map((row) => (
              <div key={row.locationType} className="flex items-center justify-between py-2.5 text-sm">
                <span className="font-medium capitalize text-ink-800">{row.locationType}</span>
                <span className="text-text-subtle tabular-nums font-semibold">
                  {num(Number(row.c))} listings
                </span>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {/* Direct Data Exports */}
      <Panel>
        <PanelHeader
          title="Raw data exports"
          description="Download filtered CSV spreadsheets for offline analysis and auditing."
          icon={FileSpreadsheet}
        />
        <div className="grid gap-4 p-6 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex flex-col justify-between rounded-xl border border-ink-200 bg-ink-50/50 p-4 transition-all hover:bg-ink-50 hover:border-ink-300">
            <div>
              <p className="font-semibold text-ink-900">Intern master file</p>
              <p className="mt-1 text-xs text-text-subtle">
                Complete roster of candidates with contact and profile status.
              </p>
            </div>
            <a
              href="/api/admin/export?type=interns"
              className="mt-4 inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-ink-200 bg-white px-3 text-xs font-medium text-ink-800 shadow-xs transition-colors hover:bg-ink-50"
            >
              <Download className="size-3.5" aria-hidden />
              Download CSV
            </a>
          </div>

          <div className="flex flex-col justify-between rounded-xl border border-ink-200 bg-ink-50/50 p-4 transition-all hover:bg-ink-50 hover:border-ink-300">
            <div>
              <p className="font-semibold text-ink-900">Companies directory</p>
              <p className="mt-1 text-xs text-text-subtle">
                Employer partners, contact information, GST numbers, and setup progress.
              </p>
            </div>
            <a
              href="/api/admin/export?type=companies"
              className="mt-4 inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-ink-200 bg-white px-3 text-xs font-medium text-ink-800 shadow-xs transition-colors hover:bg-ink-50"
            >
              <Download className="size-3.5" aria-hidden />
              Download CSV
            </a>
          </div>

          <div className="flex flex-col justify-between rounded-xl border border-ink-200 bg-ink-50/50 p-4 transition-all hover:bg-ink-50 hover:border-ink-300">
            <div>
              <p className="font-semibold text-ink-900">Projects catalog</p>
              <p className="mt-1 text-xs text-text-subtle">
                All projects, required skills, full time conversion offers, and statuses.
              </p>
            </div>
            <a
              href="/api/admin/export?type=projects"
              className="mt-4 inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-ink-200 bg-white px-3 text-xs font-medium text-ink-800 shadow-xs transition-colors hover:bg-ink-50"
            >
              <Download className="size-3.5" aria-hidden />
              Download CSV
            </a>
          </div>

          <div className="flex flex-col justify-between rounded-xl border border-ink-200 bg-ink-50/50 p-4 transition-all hover:bg-ink-50 hover:border-ink-300">
            <div>
              <p className="font-semibold text-ink-900">Payments ledger</p>
              <p className="mt-1 text-xs text-text-subtle">
                Financial payment receipts, order IDs, and payment verification records.
              </p>
            </div>
            <a
              href="/api/admin/export?type=payments"
              className="mt-4 inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-ink-200 bg-white px-3 text-xs font-medium text-ink-800 shadow-xs transition-colors hover:bg-ink-50"
            >
              <Download className="size-3.5" aria-hidden />
              Download CSV
            </a>
          </div>
        </div>
      </Panel>
    </div>
  );
}
