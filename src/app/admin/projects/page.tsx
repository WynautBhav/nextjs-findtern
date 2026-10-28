import Link from "next/link";
import { and, asc, count, desc, eq, not, sql, type SQL } from "drizzle-orm";
import { Download } from "lucide-react";

import { getDb, schema } from "@/lib/db";
import { q } from "@/lib/college/sql";
import { formatDate, formatNumber } from "@/lib/format";
import { flattenParams, parsePageRequest, searchAny, toPage } from "@/lib/admin/params";
import { activeProject, realEmployerId } from "@/lib/admin/scope";
import { AdminLoadError, AdminPageHeader, Panel } from "@/components/admin/panel";
import { StatCard, StatGrid } from "@/components/admin/stat-card";
import { DataTable, parseSort } from "@/components/admin/data-table";
import { StatusBadge } from "@/components/admin/status-badge";
import { ButtonAnchor } from "@/components/ui/button";

/**
 * Projects (legacy admin-projects.tsx). "Active" is the shared rule: any
 * project not closed, with a blank status counting as active; "Closed" also
 * covers legacy's "inactive" and "archived" (ADP-13).
 */

const SORTS = ["name", "company", "proposals", "posted"] as const;

const proposalCount = sql<number>`(select count(*)::int from ${schema.proposals} p where p.project_id = ${q(schema.projects, schema.projects.id)})`;

export default async function AdminProjectsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = flattenParams(await searchParams);
  const req = parsePageRequest(params);
  const sort = parseSort(params, SORTS, { key: "posted", dir: "desc" });

  const conditions: (SQL | undefined)[] = [
    searchAny([sql`${schema.projects.projectName}`, sql`${schema.employers.companyName}`, sql`${schema.projects.skills}::text`], req.search),
    realEmployerId(schema.projects.employerId),
    params.status === "active" ? activeProject() : params.status === "closed" ? not(activeProject()) : undefined,
    params.type === "full_time" ? eq(schema.projects.fullTimeOffer, true) : undefined,
    params.type === "internship" ? sql`coalesce(${schema.projects.fullTimeOffer}, false) = false` : undefined,
  ];
  const where = and(...conditions.filter((c): c is SQL => Boolean(c)));

  const sortExpr: Record<(typeof SORTS)[number], SQL> = {
    name: sql`lower(${schema.projects.projectName})`,
    company: sql`lower(${schema.employers.companyName})`,
    proposals: proposalCount,
    posted: sql`${schema.projects.createdAt}`,
  };

  const db = getDb();
  let loaded;
  try {
    const [rows, [totalRow], [all], [active], [fullTime], [proposals]] = await Promise.all([
      db
        .select({
          id: schema.projects.id,
          projectName: schema.projects.projectName,
          status: schema.projects.status,
          fullTimeOffer: schema.projects.fullTimeOffer,
          locationType: schema.projects.locationType,
          city: schema.projects.city,
          timezone: schema.projects.timezone,
          skills: schema.projects.skills,
          createdAt: schema.projects.createdAt,
          employerId: schema.projects.employerId,
          employerName: schema.employers.companyName,
          proposalCount,
          isActive: sql<boolean>`${activeProject()}`,
        })
        .from(schema.projects)
        .innerJoin(schema.employers, eq(schema.employers.id, schema.projects.employerId))
        .where(where)
        .orderBy(sort.dir === "asc" ? asc(sortExpr[sort.key]) : desc(sortExpr[sort.key]), desc(schema.projects.createdAt))
        .limit(req.perPage)
        .offset(req.offset),
      db
        .select({ c: count() })
        .from(schema.projects)
        .innerJoin(schema.employers, eq(schema.employers.id, schema.projects.employerId))
        .where(where),
      db.select({ c: count() }).from(schema.projects).where(realEmployerId(schema.projects.employerId)),
      db.select({ c: count() }).from(schema.projects).where(and(activeProject(), realEmployerId(schema.projects.employerId))),
      db.select({ c: count() }).from(schema.projects).where(and(eq(schema.projects.fullTimeOffer, true), realEmployerId(schema.projects.employerId))),
      db.select({ c: count() }).from(schema.proposals).where(realEmployerId(schema.proposals.employerId)),
    ]);
    loaded = {
      rows,
      total: Number(totalRow?.c ?? 0),
      all: Number(all?.c ?? 0),
      active: Number(active?.c ?? 0),
      fullTime: Number(fullTime?.c ?? 0),
      proposals: Number(proposals?.c ?? 0),
    };
  } catch (error) {
    console.error("[admin/projects]", error);
    loaded = null;
  }

  const exportHref = `/api/admin/export?type=projects&${new URLSearchParams(params).toString()}`;
  const header = (
    <AdminPageHeader
      title="Projects"
      subtitle="Every project companies have posted, how many offers each has drawn, and whether it is still open."
      action={
        <ButtonAnchor href={exportHref} variant="outline" size="sm">
          <Download className="size-4" aria-hidden />
          Export CSV
        </ButtonAnchor>
      }
    />
  );
  if (!loaded) {
    return (
      <div className="space-y-6">
        {header}
        <Panel>
          <AdminLoadError what="the project list" retryHref="/admin/projects" />
        </Panel>
      </div>
    );
  }

  const page = toPage(loaded.rows, loaded.total, req.page, req.perPage);
  const filtered = Boolean(req.search || params.status || params.type);

  return (
    <div className="space-y-6">
      {header}

      <StatGrid cols={4}>
        <StatCard label="Projects" value={formatNumber(loaded.all)} hint="Posted by real companies" tone="neutral" />
        <StatCard
          label="Active"
          value={formatNumber(loaded.active)}
          hint="Open to candidates, blank status included"
          tone="neutral"
          href="/admin/projects?status=active"
        />
        <StatCard
          label="Full-time potential"
          value={formatNumber(loaded.fullTime)}
          hint={`${loaded.all > 0 ? Math.round((loaded.fullTime / loaded.all) * 100) : 0}% of all projects`}
          tone="neutral"
          href="/admin/projects?type=full_time"
        />
        <StatCard label="Proposals sent" value={formatNumber(loaded.proposals)} hint="Across every project" tone="neutral" href="/admin/proposal-tracker" />
      </StatGrid>

      <DataTable
        basePath="/admin/projects"
        params={params}
        page={page.page}
        pages={page.pages}
        total={page.total}
        perPage={page.perPage}
        rows={loaded.rows}
        noun="projects"
        caption="Projects"
        searchPlaceholder="Search project, company or skill…"
        empty={
          filtered
            ? { title: "No project matches", body: "Nothing matches this search and these filters.", action: { href: "/admin/projects", label: "Clear filters" } }
            : { title: "No projects yet", body: "Projects appear here once a company posts one." }
        }
        filters={[
          {
            key: "status",
            label: "Status",
            options: [
              { value: "active", label: "Active" },
              { value: "closed", label: "Closed" },
            ],
          },
          {
            key: "type",
            label: "Offer type",
            options: [
              { value: "full_time", label: "Full-time potential" },
              { value: "internship", label: "Internship only" },
            ],
          },
        ]}
        columns={[
          {
            header: "Project",
            sort: "name",
            cell: (row) => (
              <div className="min-w-0 max-w-sm">
                <p className="truncate font-medium text-ink-900" title={row.projectName}>
                  {row.projectName}
                </p>
                <p className="truncate text-xs text-ink-600" title={(row.skills ?? []).join(", ")}>
                  {row.skills?.length ? row.skills.slice(0, 4).join(", ") : "No skills listed"}
                </p>
              </div>
            ),
          },
          {
            header: "Company",
            sort: "company",
            cell: (row) => (
              <Link href={`/admin/companies/${row.employerId}?tab=projects`} className="block max-w-52 truncate font-medium text-brand-700 hover:underline">
                {row.employerName}
              </Link>
            ),
          },
          {
            header: "Where",
            cell: (row) => (
              <div className="min-w-0 max-w-44">
                <p className="truncate capitalize">{row.locationType || "Remote"}</p>
                {row.city || row.timezone ? <p className="truncate text-xs text-ink-600">{row.city || row.timezone}</p> : null}
              </div>
            ),
          },
          { header: "Type", cell: (row) => (row.fullTimeOffer ? "Full-time potential" : "Internship") },
          {
            header: "Proposals",
            sort: "proposals",
            align: "right",
            cell: (row) => (
              <Link href={`/admin/proposal-tracker?company=${row.employerId}`} className="font-medium text-ink-900 hover:text-brand-700 hover:underline">
                {row.proposalCount}
              </Link>
            ),
          },
          { header: "Status", cell: (row) => <StatusBadge value={row.isActive ? "active" : "closed"} /> },
          { header: "Posted", sort: "posted", cell: (row) => <span className="nums whitespace-nowrap">{formatDate(row.createdAt)}</span> },
        ]}
      />
    </div>
  );
}
