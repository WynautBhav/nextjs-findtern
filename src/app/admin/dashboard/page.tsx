import { count, desc, eq, sql, type SQL } from "drizzle-orm";
import {
  Users,
  Building2,
  CalendarCheck,
  Briefcase,
  Sparkles,
  Timer,
  TrendingUp,
  Send,
} from "lucide-react";
import Link from "next/link";

import { getDb, schema } from "@/lib/db";
import { formatDate, formatMoney } from "@/lib/format";
import { flattenParams, parsePageRequest, searchAny, toPage } from "@/lib/admin/params";
import {
  AdminPageHeader,
  AttentionBanner,
  Panel,
  PanelHeader,
} from "@/components/admin/panel";
import { StatCard, StatGrid } from "@/components/admin/stat-card";
import { DataTable } from "@/components/admin/data-table";
import { PipelineBars, TrendChart } from "@/components/admin/trend-chart";
import { StatusBadge } from "@/components/admin/status-badge";

/**
 * Admin dashboard.
 *
 * Reads happen inline in this file rather than through a service module: they
 * exist only to render this one screen, and an indirection between a page and
 * the query it needs is a place for the two to disagree.
 *
 * Every figure is wrapped in a try/catch. A partial dashboard is worse than an
 * empty one — it reads as real data — so if the database is unreachable the
 * whole screen degrades to zeros behind an explicit notice rather than showing
 * some numbers and hiding the failure.
 */

const PIPELINE_LABELS: Record<string, string> = {
  sent: "Sent",
  accepted: "Accepted",
  hired: "Hired",
  expired: "Expired",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
};

export default async function AdminDashboard({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = flattenParams(await searchParams);

  let data: {
    totalSignups: number;
    internsWithProfile: number;
    totalCompanies: number;
    companiesSetupComplete: number;
    interviewsTotal: number;
    interviewsScheduled: number;
    totalProjects: number;
    fullTimeProjects: number;
    totalProposals: number;
    avgHiringSpeedDays: number | null;
    revenueMinor: number;
    revenueCurrency: string;
    pipeline: { status: string; count: number }[];
    trend: { label: string; proposals: number; interviews: number }[];
  };

  let failed = false;

  try {
    const db = getDb();

    const [
      [signups],
      [withProfile],
      [companies],
      [companiesReady],
      [interviews],
      [scheduled],
      [projectTotal],
      [fullTime],
      [proposals],
      [speed],
      [revenue],
      pipelineRaw,
      trendRaw,
    ] = await Promise.all([
      db.select({ c: count() }).from(schema.users),
      db.select({ c: count() }).from(schema.internOnboarding),
      db.select({ c: count() }).from(schema.employers),
      db.select({ c: count() }).from(schema.employers).where(eq(schema.employers.setupCompleted, true)),
      db.select({ c: count() }).from(schema.interviews),
      db.select({ c: count() }).from(schema.interviews).where(eq(schema.interviews.status, "scheduled")),
      db.select({ c: count() }).from(schema.projects),
      db.select({ c: count() }).from(schema.projects).where(eq(schema.projects.fullTimeOffer, true)),
      db.select({ c: count() }).from(schema.proposals),
      db
        .select({
          d: sql<string>`avg(extract(epoch from (${schema.proposals.hiredAt} - ${schema.proposals.createdAt})) / 86400.0)`,
        })
        .from(schema.proposals)
        .where(sql`${schema.proposals.hiredAt} is not null`),
      db
        .select({
          total: sql<number>`coalesce(sum(${schema.employerPayments.amountMinor}), 0)::bigint`,
          currency: sql<string>`coalesce(max(${schema.employerPayments.currency}), 'INR')`,
        })
        .from(schema.employerPayments)
        .where(eq(schema.employerPayments.status, "paid")),
      db
        .select({ status: schema.proposals.status, c: count() })
        .from(schema.proposals)
        .groupBy(schema.proposals.status),
      db.execute(sql`
        with months as (
          select to_char(date_trunc('month', now()) - (n || ' month')::interval, 'Mon') as label,
                 n
          from generate_series(5, 0, -1) as n
        )
        select m.label,
               coalesce(p.c, 0)::int as proposals,
               coalesce(i.c, 0)::int as interviews
        from months m
        left join (
          select to_char(date_trunc('month', created_at), 'YYYY-MM') as month, count(*) as c
          from ${schema.proposals} group by 1
        ) p on p.month = to_char(date_trunc('month', now()) - (m.n || ' month')::interval, 'YYYY-MM')
        left join (
          select to_char(date_trunc('month', created_at), 'YYYY-MM') as month, count(*) as c
          from ${schema.interviews} group by 1
        ) i on i.month = to_char(date_trunc('month', now()) - (m.n || ' month')::interval, 'YYYY-MM')
        order by m.n desc
      `) as unknown as {
        rows: { label: string; proposals: number; interviews: number }[];
      },
    ]);

    const pipelineMap = new Map(pipelineRaw.map((row) => [row.status, Number(row.c)]));

    data = {
      totalSignups: Number(signups?.c ?? 0),
      internsWithProfile: Number(withProfile?.c ?? 0),
      totalCompanies: Number(companies?.c ?? 0),
      companiesSetupComplete: Number(companiesReady?.c ?? 0),
      interviewsTotal: Number(interviews?.c ?? 0),
      interviewsScheduled: Number(scheduled?.c ?? 0),
      totalProjects: Number(projectTotal?.c ?? 0),
      fullTimeProjects: Number(fullTime?.c ?? 0),
      totalProposals: Number(proposals?.c ?? 0),
      avgHiringSpeedDays: speed?.d ? Math.round(Number(speed.d)) : null,
      revenueMinor: Number(revenue?.total ?? 0),
      revenueCurrency: revenue?.currency ?? "INR",
      pipeline: Object.keys(PIPELINE_LABELS).map((status) => ({
        status,
        count: pipelineMap.get(status) ?? 0,
      })),
      trend: (trendRaw?.rows ?? []).map((row) => ({
        label: row.label,
        proposals: Number(row.proposals),
        interviews: Number(row.interviews),
      })),
    };
  } catch {
    failed = true;
    data = {
      totalSignups: 0,
      internsWithProfile: 0,
      totalCompanies: 0,
      companiesSetupComplete: 0,
      interviewsTotal: 0,
      interviewsScheduled: 0,
      totalProjects: 0,
      fullTimeProjects: 0,
      totalProposals: 0,
      avgHiringSpeedDays: null,
      revenueMinor: 0,
      revenueCurrency: "INR",
      pipeline: Object.keys(PIPELINE_LABELS).map((status) => ({ status, count: 0 })),
      trend: [],
    };
  }

  const incomplete = Math.max(0, data.totalSignups - data.internsWithProfile);
  const num = (n: number) => n.toLocaleString("en-IN");

  return (
    <div>
      <AdminPageHeader
        title="Dashboard"
        subtitle="Everything happening across interns, companies and projects."
        action={
          <Link
            href="/admin/reports"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-3.5 text-sm font-medium text-ink-700 transition-colors hover:bg-ink-50"
          >
            <TrendingUp className="size-4" aria-hidden />
            Full reports
          </Link>
        }
      />

      {failed ? (
        <div
          role="alert"
          className="mb-6 rounded-lg border border-danger/25 bg-danger-soft px-4 py-3 text-sm text-danger"
        >
          Could not reach the database. Figures below are zero, not real.
        </div>
      ) : null}

      <div className="space-y-6">
        <AttentionBanner
          count={incomplete}
          total={data.totalSignups}
          noun="interns"
          href="/admin/interns?profile=incomplete"
        />

        {/* KPI row -------------------------------------------------------- */}
        <StatGrid cols={6}>
          <StatCard
            label="Total interns"
            value={num(data.internsWithProfile)}
            hint={`${num(data.totalSignups)} total signups`}
            icon={Users}
            tone="brand"
            href="/admin/interns"
          />
          <StatCard
            label="Companies"
            value={num(data.totalCompanies)}
            hint={`${num(data.companiesSetupComplete)} setup completed`}
            icon={Building2}
            tone="info"
            href="/admin/companies"
          />
          <StatCard
            label="Interviews"
            value={num(data.interviewsTotal)}
            hint={`${num(data.interviewsScheduled)} scheduled`}
            icon={CalendarCheck}
            tone="accent"
          />
          <StatCard
            label="Full time potential"
            value={num(data.fullTimeProjects)}
            hint={`of ${num(data.totalProjects)} total projects`}
            icon={Briefcase}
            tone="success"
            href="/admin/projects?ft=yes"
          />
          <StatCard
            label="Avg hiring speed"
            value={data.avgHiringSpeedDays === null ? "None" : `${data.avgHiringSpeedDays}d`}
            hint="Proposal to acceptance"
            icon={Timer}
            tone="neutral"
          />
          <StatCard
            label="Revenue collected"
            value={
              data.revenueMinor > 0
                ? formatMoney(data.revenueMinor, data.revenueCurrency as "INR", { compact: true })
                : "Zero"
            }
            hint={`${num(data.totalProposals)} proposals sent`}
            icon={Sparkles}
            tone="success"
            href="/admin/transactions"
          />
        </StatGrid>

        {/* Charts --------------------------------------------------------- */}
        <div className="grid gap-6 lg:grid-cols-5">
          <Panel className="lg:col-span-3">
            <PanelHeader
              title="Activity trends"
              description="Proposals against interviews over the last six months."
              icon={TrendingUp}
            />
            <div className="px-5 py-5">
              {data.trend.length > 0 ? (
                <TrendChart data={data.trend} />
              ) : (
                <p className="py-10 text-center text-sm text-text-subtle">
                  Not enough activity to chart yet.
                </p>
              )}
            </div>
          </Panel>

          <Panel className="lg:col-span-2">
            <PanelHeader
              title="Proposal pipeline"
              description="Where every proposal currently sits."
              icon={Send}
              action={
                <Link
                  href="/admin/proposal-tracker"
                  className="text-xs font-medium text-brand-700 hover:underline"
                >
                  Tracker
                </Link>
              }
            />
            <div className="px-5 py-5">
              <PipelineBars
                items={data.pipeline.map((item) => ({
                  status: item.status,
                  count: item.count,
                  label: PIPELINE_LABELS[item.status],
                }))}
              />
            </div>
          </Panel>
        </div>

        {/* Intern management ---------------------------------------------- */}
        <InternManagement params={params} />

        {/* Project management --------------------------------------------- */}
        <ProjectManagement params={params} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Intern management
// ---------------------------------------------------------------------------

async function InternManagement({ params }: { params: Record<string, string> }) {
  const req = parsePageRequest(params);
  const db = getDb();

  const conditions: (SQL | undefined)[] = [
    searchAny(
      [
        sql`${schema.users.firstName}`,
        sql`${schema.users.lastName}`,
        sql`${schema.users.email}`,
        sql`${schema.users.phoneNumber}`,
      ],
      req.search,
    ),
    params.status ? eq(schema.users.isActive, params.status === "active") : undefined,
    params.visibility ? eq(schema.users.profileVisibility, params.visibility) : undefined,
    params.profile === "complete"
      ? sql`${schema.internOnboarding.id} is not null`
      : undefined,
    params.profile === "incomplete" ? sql`${schema.internOnboarding.id} is null` : undefined,
  ].filter(Boolean) as SQL[];

  const where = conditions.length ? sql`${conditions.reduce((acc, c) => sql`${acc} and ${c}`)}` : undefined;

  const proposalCount = sql<number>`(
    select count(*)::int from ${schema.proposals} p where p.intern_id = ${schema.users.id}
  )`;

  const [rows, [totalRow]] = await Promise.all([
    db
      .select({
        id: schema.users.id,
        firstName: schema.users.firstName,
        lastName: schema.users.lastName,
        email: schema.users.email,
        countryCode: schema.users.countryCode,
        phoneNumber: schema.users.phoneNumber,
        isActive: schema.users.isActive,
        visibility: schema.users.profileVisibility,
        createdAt: schema.users.createdAt,
        proposalCount,
        hasProfile: sql<boolean>`(${schema.internOnboarding.id} is not null)`,
      })
      .from(schema.users)
      .leftJoin(schema.internOnboarding, eq(schema.internOnboarding.userId, schema.users.id))
      .where(where)
      .orderBy(desc(schema.users.createdAt))
      .limit(req.perPage)
      .offset(req.offset),
    db
      .select({ c: count() })
      .from(schema.users)
      .leftJoin(schema.internOnboarding, eq(schema.internOnboarding.userId, schema.users.id))
      .where(where),
  ]);

  const page = toPage(rows, Number(totalRow?.c ?? 0), req.page, req.perPage);

  return (
    <DataTable
      basePath="/admin/dashboard"
      params={params}
      page={page.page}
      pages={page.pages}
      total={page.total}
      perPage={page.perPage}
      rows={rows}
      noun="interns"
      dense
      caption="Registered interns"
      searchPlaceholder="Search by name, email, phone…"
      exportHref={`/api/admin/export?type=interns&${new URLSearchParams(params).toString()}`}
      filters={[
        {
          key: "status",
          label: "Status",
          options: [
            { value: "active", label: "Active" },
            { value: "inactive", label: "Inactive" },
          ],
        },
        {
          key: "profile",
          label: "Profile",
          options: [
            { value: "complete", label: "Complete" },
            { value: "incomplete", label: "Incomplete" },
          ],
        },
        {
          key: "visibility",
          label: "Visibility",
          options: [
            { value: "live", label: "Live" },
            { value: "hidden", label: "Hidden" },
          ],
        },
      ]}
      columns={[
        {
          header: "Intern",
          cell: (row) => (
            <Link
              href={`/admin/interns/${row.id}`}
              className="group flex items-center gap-2.5"
            >
              <span
                aria-hidden
                className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700 transition group-hover:bg-brand-100"
              >
                {row.firstName.charAt(0)}
                {row.lastName.charAt(0)}
              </span>
              <div className="min-w-0">
                <p className="truncate font-medium text-ink-900 group-hover:text-brand-700 group-hover:underline">
                  {row.firstName} {row.lastName}
                </p>
                <p className="truncate text-xs text-text-subtle">
                  Joined {row.createdAt ? formatDate(row.createdAt.toISOString()) : "None"}
                </p>
              </div>
            </Link>
          ),
        },
        {
          header: "Contact",
          cell: (row) => (
            <div className="min-w-0">
              <p className="truncate text-ink-700">{row.email}</p>
              <p className="truncate text-xs text-text-subtle tabular-nums">
                {row.countryCode} {row.phoneNumber}
              </p>
            </div>
          ),
        },
        {
          header: "Proposals",
          align: "right",
          cell: (row) => (
            <span className="font-medium text-ink-800">{row.proposalCount}</span>
          ),
        },
        {
          header: "Profile",
          cell: (row) => (
            <StatusBadge
              tone={row.hasProfile ? "success" : "warning"}
              label={row.hasProfile ? "Complete" : "Incomplete"}
            />
          ),
        },
        {
          header: "Account",
          cell: (row) => <StatusBadge value={row.isActive ? "active" : "inactive"} />,
        },
        {
          header: "Directory",
          cell: (row) => <StatusBadge value={row.visibility} />,
        },
        {
          header: "Action",
          align: "right",
          cell: (row) => (
            <Link
              href={`/admin/interns/${row.id}`}
              className="inline-flex items-center gap-1 rounded-md border border-sand-300 bg-sand-50/80 px-2.5 py-1 text-xs font-medium text-ink-700 transition hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
            >
              View
            </Link>
          ),
        },
      ]}
    />
  );
}

// ---------------------------------------------------------------------------
// Project management
// ---------------------------------------------------------------------------

async function ProjectManagement({ params }: { params: Record<string, string> }) {
  // The project table has its own page/per keys. Sharing `page` with the intern
  // table above would make the two pagers overwrite each other in the URL — the
  // exact bug that exists on the live dashboard, where filtering the intern list
  // resets the project list to page 1 and vice versa.
  const projectParams = { ...params, page: params.pp, per: params.pper };
  const req = parsePageRequest(projectParams);
  const db = getDb();

  const conditions: (SQL | undefined)[] = [
    searchAny(
      [
        sql`${schema.projects.projectName}`,
        sql`${schema.employers.companyName}`,
        sql`${schema.projects.skills}::text`,
      ],
      req.search,
    ),
    params.projectStatus ? eq(schema.projects.status, params.projectStatus) : undefined,
  ].filter(Boolean) as SQL[];

  const where = conditions.length ? sql`${conditions.reduce((acc, c) => sql`${acc} and ${c}`)}` : undefined;
  const proposalCount = sql<number>`(
    select count(*)::int from ${schema.proposals} p where p.project_id = ${schema.projects.id}
  )`;

  const [rows, [totalRow]] = await Promise.all([
    db
      .select({
        id: schema.projects.id,
        employerId: schema.projects.employerId,
        projectName: schema.projects.projectName,
        status: schema.projects.status,
        fullTimeOffer: schema.projects.fullTimeOffer,
        locationType: schema.projects.locationType,
        skills: schema.projects.skills,
        createdAt: schema.projects.createdAt,
        employerName: schema.employers.companyName,
        proposalCount,
      })
      .from(schema.projects)
      .innerJoin(schema.employers, eq(schema.employers.id, schema.projects.employerId))
      .where(where)
      .orderBy(desc(schema.projects.createdAt))
      .limit(req.perPage)
      .offset(req.offset),
    db
      .select({ c: count() })
      .from(schema.projects)
      .innerJoin(schema.employers, eq(schema.employers.id, schema.projects.employerId))
      .where(where),
  ]);

  const page = toPage(rows, Number(totalRow?.c ?? 0), req.page, req.perPage);

  return (
    <DataTable
      basePath="/admin/dashboard"
      params={projectParams}
      pageKey="pp"
      perKey="pper"
      page={page.page}
      pages={page.pages}
      total={page.total}
      perPage={page.perPage}
      rows={rows}
      noun="projects"
      dense
      caption="Active projects"
      searchPlaceholder="Search projects or employers…"
      filters={[
        {
          key: "projectStatus",
          label: "Status",
          options: [
            { value: "active", label: "Active" },
            { value: "closed", label: "Closed" },
            { value: "draft", label: "Draft" },
          ],
        },
      ]}
      columns={[
        {
          header: "Project",
          cell: (row) => (
            <div className="min-w-0">
              <p className="truncate font-medium text-ink-900">{row.projectName}</p>
              <p className="truncate text-xs text-text-subtle">
                {row.locationType ?? "Anywhere"} ·{" "}
                {row.skills?.length ? row.skills.slice(0, 3).join(", ") : "No skills listed"}
              </p>
            </div>
          ),
        },
        {
          header: "Employer",
          cell: (row) => (
            <Link
              href={`/admin/companies/${row.employerId}`}
              className="truncate text-ink-700 hover:text-brand-700 hover:underline font-medium"
            >
              {row.employerName}
            </Link>
          ),
        },
        {
          header: "Posted",
          cell: (row) => (
            <span className="text-text-subtle">
              {row.createdAt ? formatDate(row.createdAt.toISOString()) : "None"}
            </span>
          ),
        },
        {
          header: "Type",
          cell: (row) => (
            <StatusBadge
              tone={row.fullTimeOffer ? "success" : "info"}
              label={row.fullTimeOffer ? "Full time" : "Internship"}
            />
          ),
        },
        {
          header: "Proposals",
          align: "right",
          cell: (row) => (
            <span className="font-medium text-ink-800">{row.proposalCount}</span>
          ),
        },
        {
          header: "Status",
          cell: (row) => <StatusBadge value={row.status} />,
        },
      ]}
    />
  );
}
