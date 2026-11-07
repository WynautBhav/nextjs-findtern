import Link from "next/link";
import { and, asc, count, desc, eq, not, sql, type SQL } from "drizzle-orm";
import { Download } from "lucide-react";

import { getDb, schema } from "@/lib/db";
import { q } from "@/lib/college/sql";
import { formatDate, formatNumber } from "@/lib/format";
import { flattenParams, parsePageRequest, searchAny, toPage, toQueryString } from "@/lib/admin/params";
import { activeProject, realEmployerId } from "@/lib/admin/scope";
import { AdminLoadError, AdminPageHeader, Panel } from "@/components/admin/panel";
import { AdminTabs, type AdminTabItem } from "@/components/admin/admin-tabs";
import { DataTable, IdentityCell, parseSort } from "@/components/admin/data-table";
import { StatusBadge } from "@/components/admin/status-badge";
import { ButtonAnchor } from "@/components/ui/button";
import { ADMIN_PILL_SECONDARY } from "@/components/admin/surface";

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
  const headerWith = (subtitle?: string) => (
    <AdminPageHeader
      title="Projects"
      subtitle={subtitle}
      action={
        <div className="flex flex-wrap gap-2">
        <ButtonAnchor href="/admin/projects/review" variant="outline" size="sm" className={ADMIN_PILL_SECONDARY}>
          Review queue
        </ButtonAnchor>
        <ButtonAnchor href={exportHref} variant="outline" size="sm" className={ADMIN_PILL_SECONDARY}>
          <Download className="size-4" aria-hidden />
          Export CSV
        </ButtonAnchor>
        </div>
      }
    />
  );
  const header = headerWith();
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

  // Active / closed / full-time are views (the counts were stat tiles); the filters keep the same URL keys.
  const viewHref = (patch: Record<string, string>) => `/admin/projects${toQueryString({ ...params, status: "", type: "", ...patch, page: "" })}`;
  const views: AdminTabItem[] = [
    { key: "all", label: "All projects", count: loaded.all, href: viewHref({}) },
    { key: "active", label: "Active", count: loaded.active, href: viewHref({ status: "active" }) },
    { key: "closed", label: "Closed", count: Math.max(0, loaded.all - loaded.active), href: viewHref({ status: "closed" }) },
    { key: "full_time", label: "Full-time potential", count: loaded.fullTime, href: viewHref({ type: "full_time" }) },
  ];
  const activeView =
    params.status === "active" && !params.type
      ? "active"
      : params.status === "closed" && !params.type
        ? "closed"
        : params.type === "full_time" && !params.status
          ? "full_time"
          : !params.status && !params.type
            ? "all"
            : "";

  return (
    <div className="space-y-4">
      {headerWith(
        `${formatNumber(loaded.all)} projects, ${formatNumber(loaded.active)} open to candidates, with ${formatNumber(loaded.proposals)} proposals sent across them.`,
      )}

      <AdminTabs items={views} active={activeView} label="Project views" />

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
              // Long names wrap to two lines rather than widen the table past
              // its card at 1440 (QA-140).
              <div className="min-w-0 whitespace-normal lg:max-w-xs">
                <p className="line-clamp-2 break-words font-medium text-foreground" title={row.projectName}>
                  {row.projectName}
                </p>
                <p className="truncate text-[0.8125rem] text-text-subtle" title={(row.skills ?? []).join(", ")}>
                  {row.skills?.length ? row.skills.slice(0, 4).join(", ") : "No skills listed"}
                </p>
              </div>
            ),
          },
          {
            header: "Company",
            sort: "company",
            cell: (row) => (
              <IdentityCell name={row.employerName} id={row.employerId} href={`/admin/companies/${row.employerId}?tab=projects`} size="sm" className="lg:max-w-52" />
            ),
          },
          {
            header: "Where",
            cell: (row) => (
              <div className="min-w-0 lg:max-w-36">
                <p className="truncate capitalize">{row.locationType || "Remote"}</p>
                {row.city || row.timezone ? <p className="truncate text-[0.8125rem] text-text-subtle">{row.city || row.timezone}</p> : null}
              </div>
            ),
          },
          {
            header: "Type",
            cell: (row) => <StatusBadge tone={row.fullTimeOffer ? "info" : "neutral"} label={row.fullTimeOffer ? "Full-time potential" : "Internship"} dot={false} />,
          },
          {
            header: "Proposals",
            sort: "proposals",
            numeric: true,
            cell: (row) => (
              <Link href={`/admin/proposal-tracker?company=${row.employerId}`} className="font-medium text-foreground hover:underline">
                {row.proposalCount}
              </Link>
            ),
          },
          { header: "Status", cell: (row) => <StatusBadge value={row.isActive ? "active" : "closed"} /> },
          { header: "Posted", sort: "posted", cell: (row) => <span className="nums whitespace-nowrap text-text-subtle">{formatDate(row.createdAt)}</span> },
        ]}
      />
    </div>
  );
}
