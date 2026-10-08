import { count, desc, eq, sql, type SQL } from "drizzle-orm";
import { Send, CheckCircle2, Clock, Sparkles, Download } from "lucide-react";

import { getDb, schema } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { flattenParams, parsePageRequest, searchAny, toPage } from "@/lib/admin/params";
import { AdminPageHeader } from "@/components/admin/panel";
import { StatCard, StatGrid } from "@/components/admin/stat-card";
import { DataTable } from "@/components/admin/data-table";
import { StatusBadge } from "@/components/admin/status-badge";

export default async function AdminProposalTrackerPage({
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
        sql`${schema.users.firstName}`,
        sql`${schema.users.lastName}`,
        sql`${schema.employers.companyName}`,
        sql`${schema.projects.projectName}`,
      ],
      req.search,
    ),
    params.status ? eq(schema.proposals.status, params.status) : undefined,
    params.flow ? eq(schema.proposals.flowType, params.flow) : undefined,
  ].filter(Boolean) as SQL[];

  const where = conditions.length
    ? sql`${conditions.reduce((acc, c) => sql`${acc} and ${c}`)}`
    : undefined;

  const [
    rows,
    [totalRow],
    [totalProposalsCount],
    [acceptedCount],
    [directFlowCount],
    [interviewFlowCount],
  ] = await Promise.all([
    db
      .select({
        id: schema.proposals.id,
        status: schema.proposals.status,
        flowType: schema.proposals.flowType,
        createdAt: schema.proposals.createdAt,
        hiredAt: schema.proposals.hiredAt,
        internFirstName: schema.users.firstName,
        internLastName: schema.users.lastName,
        internEmail: schema.users.email,
        companyName: schema.employers.companyName,
        projectName: schema.projects.projectName,
      })
      .from(schema.proposals)
      .innerJoin(schema.users, eq(schema.users.id, schema.proposals.internId))
      .innerJoin(schema.employers, eq(schema.employers.id, schema.proposals.employerId))
      .innerJoin(schema.projects, eq(schema.projects.id, schema.proposals.projectId))
      .where(where)
      .orderBy(desc(schema.proposals.createdAt))
      .limit(req.perPage)
      .offset(req.offset),
    db
      .select({ c: count() })
      .from(schema.proposals)
      .innerJoin(schema.users, eq(schema.users.id, schema.proposals.internId))
      .innerJoin(schema.employers, eq(schema.employers.id, schema.proposals.employerId))
      .innerJoin(schema.projects, eq(schema.projects.id, schema.proposals.projectId))
      .where(where),
    db.select({ c: count() }).from(schema.proposals),
    db.select({ c: count() }).from(schema.proposals).where(eq(schema.proposals.status, "accepted")),
    db.select({ c: count() }).from(schema.proposals).where(eq(schema.proposals.flowType, "direct")),
    db.select({ c: count() }).from(schema.proposals).where(eq(schema.proposals.flowType, "interview_first")),
  ]);

  const page = toPage(rows, Number(totalRow?.c ?? 0), req.page, req.perPage);
  const totalCount = Number(totalProposalsCount?.c ?? 0);
  const acceptedTotal = Number(acceptedCount?.c ?? 0);
  const directTotal = Number(directFlowCount?.c ?? 0);
  const interviewTotal = Number(interviewFlowCount?.c ?? 0);

  const num = (n: number) => n.toLocaleString("en-IN");
  const exportHref = `/api/admin/export?type=proposals&${new URLSearchParams(params).toString()}`;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Proposal tracker"
        subtitle="End to end proposal pipeline between employers and student candidates."
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
          label="Total proposals"
          value={num(totalCount)}
          hint="All submissions recorded"
          icon={Send}
          tone="brand"
        />
        <StatCard
          label="Accepted offers"
          value={num(acceptedTotal)}
          hint={`${totalCount > 0 ? Math.round((acceptedTotal / totalCount) * 100) : 0}% acceptance rate`}
          icon={CheckCircle2}
          tone="success"
        />
        <StatCard
          label="Direct hiring path"
          value={num(directTotal)}
          hint="Instant project offers"
          icon={Sparkles}
          tone="accent"
        />
        <StatCard
          label="Interview first path"
          value={num(interviewTotal)}
          hint="Evaluated via interview"
          icon={Clock}
          tone="info"
        />
      </StatGrid>

      <DataTable
        basePath="/admin/proposal-tracker"
        params={params}
        page={page.page}
        pages={page.pages}
        total={page.total}
        perPage={page.perPage}
        rows={rows}
        noun="proposals"
        caption="Proposals activity list"
        searchPlaceholder="Search candidate, employer, or project…"
        filters={[
          {
            key: "status",
            label: "Status",
            options: [
              { value: "sent", label: "Sent" },
              { value: "accepted", label: "Accepted" },
              { value: "rejected", label: "Rejected" },
              { value: "interview_scheduled", label: "Interview scheduled" },
            ],
          },
          {
            key: "flow",
            label: "Flow type",
            options: [
              { value: "direct", label: "Direct offer" },
              { value: "interview_first", label: "Interview first" },
            ],
          },
        ]}
        columns={[
          {
            header: "Candidate",
            cell: (row) => (
              <div className="min-w-0">
                <p className="truncate font-medium text-ink-900">
                  {row.internFirstName} {row.internLastName}
                </p>
                <p className="truncate text-xs text-text-subtle">{row.internEmail}</p>
              </div>
            ),
          },
          {
            header: "Employer",
            cell: (row) => <span className="font-medium text-ink-800">{row.companyName}</span>,
          },
          {
            header: "Project",
            cell: (row) => <span className="text-ink-700">{row.projectName}</span>,
          },
          {
            header: "Hiring path",
            cell: (row) => (
              <span className="font-mono text-2xs uppercase tracking-wider text-ink-700 bg-ink-100 rounded px-2 py-0.5">
                {row.flowType === "direct" ? "Direct offer" : "Interview first"}
              </span>
            ),
          },
          {
            header: "Status",
            cell: (row) => <StatusBadge value={row.status} />,
          },
          {
            header: "Sent date",
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
