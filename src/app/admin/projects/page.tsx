import { count, desc, eq, sql, type SQL } from "drizzle-orm";
import { Briefcase, Sparkles, CheckCircle2, Send, Download } from "lucide-react";

import { getDb, schema } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { flattenParams, parsePageRequest, searchAny, toPage } from "@/lib/admin/params";
import { AdminPageHeader } from "@/components/admin/panel";
import { StatCard, StatGrid } from "@/components/admin/stat-card";
import { DataTable } from "@/components/admin/data-table";
import { StatusBadge } from "@/components/admin/status-badge";

export default async function AdminProjectsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = flattenParams(await searchParams);
  const req = parsePageRequest(params);

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
    params.status ? eq(schema.projects.status, params.status) : undefined,
    params.type === "full_time" ? eq(schema.projects.fullTimeOffer, true) : undefined,
    params.type === "internship" ? eq(schema.projects.fullTimeOffer, false) : undefined,
  ].filter(Boolean) as SQL[];

  const where = conditions.length
    ? sql`${conditions.reduce((acc, c) => sql`${acc} and ${c}`)}`
    : undefined;

  const proposalCountSubquery = sql<number>`(
    select count(*)::int from ${schema.proposals} p where p.project_id = ${schema.projects.id}
  )`;

  const [
    rows,
    [totalRow],
    [totalProjectsCount],
    [activeCount],
    [fullTimeCount],
    [proposalsCount],
  ] = await Promise.all([
    db
      .select({
        id: schema.projects.id,
        projectName: schema.projects.projectName,
        status: schema.projects.status,
        fullTimeOffer: schema.projects.fullTimeOffer,
        locationType: schema.projects.locationType,
        skills: schema.projects.skills,
        createdAt: schema.projects.createdAt,
        employerName: schema.employers.companyName,
        employerEmail: schema.employers.companyEmail,
        proposalCount: proposalCountSubquery,
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
    db.select({ c: count() }).from(schema.projects),
    db.select({ c: count() }).from(schema.projects).where(eq(schema.projects.status, "active")),
    db.select({ c: count() }).from(schema.projects).where(eq(schema.projects.fullTimeOffer, true)),
    db.select({ c: count() }).from(schema.proposals),
  ]);

  const page = toPage(rows, Number(totalRow?.c ?? 0), req.page, req.perPage);
  const totalProjects = Number(totalProjectsCount?.c ?? 0);
  const activeTotal = Number(activeCount?.c ?? 0);
  const fullTimeTotal = Number(fullTimeCount?.c ?? 0);
  const proposalsTotal = Number(proposalsCount?.c ?? 0);

  const num = (n: number) => n.toLocaleString("en-IN");
  const exportHref = `/api/admin/export?type=projects&${new URLSearchParams(params).toString()}`;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Projects"
        subtitle="Catalog of employer project listings, candidate requirements and full time offers."
        action={
          <a
            href={exportHref}
            className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-3.5 text-sm font-medium text-ink-700 transition-colors hover:bg-ink-50"
          >
            <Download className="size-4" aria-hidden />
            Export CSV
          </a>
        }
      />

      <StatGrid cols={4}>
        <StatCard
          label="Total projects"
          value={num(totalProjects)}
          hint="All posted listings"
          icon={Briefcase}
          tone="brand"
        />
        <StatCard
          label="Active listings"
          value={num(activeTotal)}
          hint="Accepting applications"
          icon={CheckCircle2}
          tone="success"
        />
        <StatCard
          label="Full time potential"
          value={num(fullTimeTotal)}
          hint={`${totalProjects > 0 ? Math.round((fullTimeTotal / totalProjects) * 100) : 0}% of all listings`}
          icon={Sparkles}
          tone="accent"
        />
        <StatCard
          label="Proposals sent"
          value={num(proposalsTotal)}
          hint="Candidate submissions"
          icon={Send}
          tone="info"
        />
      </StatGrid>

      <DataTable
        basePath="/admin/projects"
        params={params}
        page={page.page}
        pages={page.pages}
        total={page.total}
        perPage={page.perPage}
        rows={rows}
        noun="projects"
        caption="Projects catalog list"
        searchPlaceholder="Search project, employer or required skill…"
        filters={[
          {
            key: "status",
            label: "Status",
            options: [
              { value: "active", label: "Active" },
              { value: "closed", label: "Closed" },
              { value: "draft", label: "Draft" },
            ],
          },
          {
            key: "type",
            label: "Offer type",
            options: [
              { value: "full_time", label: "Full time potential" },
              { value: "internship", label: "Internship only" },
            ],
          },
        ]}
        columns={[
          {
            header: "Project",
            cell: (row) => (
              <div className="min-w-0 max-w-sm">
                <p className="truncate font-medium text-ink-900">{row.projectName}</p>
                <p className="truncate text-xs text-text-subtle">
                  {row.locationType || "Anywhere"} ·{" "}
                  {row.skills?.length ? row.skills.slice(0, 3).join(", ") : "No skills specified"}
                </p>
              </div>
            ),
          },
          {
            header: "Employer",
            cell: (row) => (
              <div className="min-w-0">
                <p className="truncate font-medium text-ink-800">{row.employerName}</p>
                <p className="truncate text-xs text-text-subtle">{row.employerEmail}</p>
              </div>
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
              <span className="font-semibold text-ink-800 tabular-nums">
                {row.proposalCount}
              </span>
            ),
          },
          {
            header: "Status",
            cell: (row) => <StatusBadge value={row.status} />,
          },
          {
            header: "Posted",
            cell: (row) => (
              <span className="text-xs text-text-subtle">
                {row.createdAt ? formatDate(row.createdAt.toISOString()) : "None"}
              </span>
            ),
          },
        ]}
      />
    </div>
  );
}
