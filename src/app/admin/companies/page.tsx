import Link from "next/link";
import { count, desc, eq, sql, type SQL } from "drizzle-orm";
import { Building2, CheckCircle2, Briefcase, FileCheck, Download } from "lucide-react";

import { getDb, schema } from "@/lib/db";
import { formatDate, formatNumber } from "@/lib/format";
import { flattenParams, parsePageRequest, searchAny, toPage } from "@/lib/admin/params";
import { AdminPageHeader } from "@/components/admin/panel";
import { StatCard, StatGrid } from "@/components/admin/stat-card";
import { DataTable } from "@/components/admin/data-table";
import { StatusBadge } from "@/components/admin/status-badge";

export default async function AdminCompaniesPage({
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
        sql`${schema.employers.companyName}`,
        sql`${schema.employers.companyEmail}`,
        sql`${schema.employers.city}`,
        sql`${schema.employers.primaryContactName}`,
      ],
      req.search,
    ),
    params.status ? eq(schema.employers.isActive, params.status === "active") : undefined,
    params.setup === "complete" ? eq(schema.employers.setupCompleted, true) : undefined,
    params.setup === "incomplete" ? eq(schema.employers.setupCompleted, false) : undefined,
  ].filter(Boolean) as SQL[];

  const where = conditions.length
    ? sql`${conditions.reduce((acc, c) => sql`${acc} and ${c}`)}`
    : undefined;

  const projectCountSubquery = sql<number>`(
    select count(*)::int from ${schema.projects} p where p.employer_id = ${schema.employers.id}
  )`;

  const [
    rows,
    [totalRow],
    [totalCompaniesMetric],
    [setupCompleteMetric],
    [activeProjectsMetric],
    [gstRegisteredMetric],
  ] = await Promise.all([
    db
      .select({
        id: schema.employers.id,
        name: schema.employers.name,
        companyName: schema.employers.companyName,
        companyEmail: schema.employers.companyEmail,
        countryCode: schema.employers.countryCode,
        phoneNumber: schema.employers.phoneNumber,
        city: schema.employers.city,
        state: schema.employers.state,
        companySize: schema.employers.companySize,
        primaryContactName: schema.employers.primaryContactName,
        primaryContactRole: schema.employers.primaryContactRole,
        gstNumber: schema.employers.gstNumber,
        setupCompleted: schema.employers.setupCompleted,
        isActive: schema.employers.isActive,
        createdAt: schema.employers.createdAt,
        projectCount: projectCountSubquery,
      })
      .from(schema.employers)
      .where(where)
      .orderBy(desc(schema.employers.createdAt))
      .limit(req.perPage)
      .offset(req.offset),
    db.select({ c: count() }).from(schema.employers).where(where),
    db.select({ c: count() }).from(schema.employers),
    db.select({ c: count() }).from(schema.employers).where(eq(schema.employers.setupCompleted, true)),
    db.select({ c: count() }).from(schema.projects).where(eq(schema.projects.status, "active")),
    db.select({ c: count() }).from(schema.employers).where(sql`${schema.employers.gstNumber} is not null`),
  ]);

  const page = toPage(rows, Number(totalRow?.c ?? 0), req.page, req.perPage);
  const totalCount = Number(totalCompaniesMetric?.c ?? 0);
  const setupCount = Number(setupCompleteMetric?.c ?? 0);
  const activeProjectsCount = Number(activeProjectsMetric?.c ?? 0);
  const gstCount = Number(gstRegisteredMetric?.c ?? 0);

  const exportHref = `/api/admin/export?type=companies&${new URLSearchParams(params).toString()}`;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Companies"
        subtitle="Directory of hiring partners, organizational profiles and projects."
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
          label="Registered companies"
          value={formatNumber(totalCount)}
          hint="Total employer accounts"
          icon={Building2}
          tone="brand"
        />
        <StatCard
          label="Setup completed"
          value={formatNumber(setupCount)}
          hint={`${totalCount > 0 ? Math.round((setupCount / totalCount) * 100) : 0}% completion rate`}
          icon={CheckCircle2}
          tone="success"
        />
        <StatCard
          label="Active projects"
          value={formatNumber(activeProjectsCount)}
          hint="Currently accepting applicants"
          icon={Briefcase}
          tone="info"
          href="/admin/projects"
        />
        <StatCard
          label="Tax verified"
          value={formatNumber(gstCount)}
          hint="Registered GST records"
          icon={FileCheck}
          tone="accent"
        />
      </StatGrid>

      <DataTable
        basePath="/admin/companies"
        params={params}
        page={page.page}
        pages={page.pages}
        total={page.total}
        perPage={page.perPage}
        rows={rows}
        noun="companies"
        caption="Registered employers directory"
        searchPlaceholder="Search company, contact, or location…"
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
            key: "setup",
            label: "Setup",
            options: [
              { value: "complete", label: "Complete" },
              { value: "incomplete", label: "Incomplete" },
            ],
          },
        ]}
        columns={[
          {
            header: "Company",
            cell: (row) => (
              <Link
                href={`/admin/companies/${row.id}`}
                className="group flex items-center gap-2.5"
              >
                <span
                  aria-hidden
                  className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand-50 text-xs font-semibold text-brand-700 transition group-hover:bg-brand-100"
                >
                  {row.companyName.charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <p className="truncate font-medium text-ink-900 group-hover:text-brand-700 group-hover:underline">
                    {row.companyName}
                  </p>
                  <p className="truncate text-xs text-text-subtle">
                    {row.city ? `${row.city}${row.state ? `, ${row.state}` : ""}` : "Location unlisted"}
                  </p>
                </div>
              </Link>
            ),
          },
          {
            header: "Primary contact",
            cell: (row) => (
              <div className="min-w-0">
                <p className="truncate font-medium text-ink-800">
                  {row.primaryContactName || row.name || "Unassigned"}
                </p>
                <p className="truncate text-xs text-text-subtle">{row.companyEmail}</p>
              </div>
            ),
          },
          {
            header: "Phone",
            cell: (row) => (
              <span className="text-xs text-ink-700 tabular-nums">
                {row.countryCode} {row.phoneNumber}
              </span>
            ),
          },
          {
            header: "Projects",
            align: "right",
            cell: (row) => (
              <span className="font-semibold text-ink-800 tabular-nums">
                {row.projectCount}
              </span>
            ),
          },
          {
            header: "GST status",
            cell: (row) => (
              <span className="text-xs font-mono text-ink-700">
                {row.gstNumber || "Unlisted"}
              </span>
            ),
          },
          {
            header: "Setup",
            cell: (row) => (
              <StatusBadge
                tone={row.setupCompleted ? "success" : "warning"}
                label={row.setupCompleted ? "Complete" : "Incomplete"}
              />
            ),
          },
          {
            header: "Account",
            cell: (row) => <StatusBadge value={row.isActive ? "active" : "inactive"} />,
          },
          {
            header: "Joined",
            cell: (row) => (
              <span className="text-xs text-text-subtle">
                {row.createdAt ? formatDate(row.createdAt.toISOString()) : "None"}
              </span>
            ),
          },
          {
            header: "Action",
            align: "right",
            cell: (row) => (
              <Link
                href={`/admin/companies/${row.id}`}
                className="inline-flex items-center gap-1 rounded-md border border-sand-300 bg-sand-50/80 px-2.5 py-1 text-xs font-medium text-ink-700 transition hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
              >
                View 360
              </Link>
            ),
          },
        ]}
      />
    </div>
  );
}
