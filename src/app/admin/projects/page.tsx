import { getSession } from "@/lib/auth";
import { canWrite } from "@/lib/admin/permissions";
import { flattenParams, toQueryString } from "@/lib/admin/params";
import { COMPANIES_PER_PAGE, loadProjectsBoard, MODE_FILTERS, parseProjectsQuery, projectsExportHref, STATUS_FILTERS, type ProjectsBoard as Board } from "@/lib/admin/projects-board";
import { formatNumber } from "@/lib/format";
import { AdminEmpty, AdminLoadError, AdminPageHeader, Panel } from "@/components/admin/panel";
import { AdminTabs, type AdminTabItem } from "@/components/admin/admin-tabs";
import { Pagination } from "@/components/admin/pagination";
import { TableToolbar } from "@/components/admin/table-toolbar";
import { ProjectsBoard } from "./projects-board";

/**
 * Projects, grouped by company and paged by company (COMPANIES_PER_PAGE). The view tabs count every real employer's
 * projects with the same rule the list filters by (projects-board.ts VIEW_SQL); the switch on each row is the existing
 * takedown / restore.
 */
export default async function AdminProjectsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = flattenParams(await searchParams);
  const query = parseProjectsQuery(params);
  const session = await getSession();
  // The page path has no write rule of its own; the takedown / restore routes need companies:write.
  const mayWrite = canWrite(session?.permissions, "/api/admin/projects");

  let board: Board | null = null;
  try {
    board = await loadProjectsBoard(query);
  } catch (error) {
    console.error("[admin/projects]", error);
  }

  const exportHref = projectsExportHref(params);

  const header = (subtitle?: string) => <AdminPageHeader title="Projects" subtitle={subtitle} />;
  if (!board) {
    return (
      <div className="space-y-6">
        {header()}
        <Panel>
          <AdminLoadError what="the project list" retryHref="/admin/projects" />
        </Panel>
      </div>
    );
  }

  const v = board.views;
  const viewHref = (patch: Record<string, string>) => `/admin/projects${toQueryString({ ...params, status: "", type: "", page: "", ...patch })}`;
  const views: AdminTabItem[] = [
    { key: "all", label: "All projects", count: v.all, href: viewHref({}) },
    { key: "active", label: "Active", count: v.active, href: viewHref({ status: "active" }) },
    { key: "deactivated", label: "Deactivated", count: v.deactivated, href: viewHref({ status: "deactivated" }) },
    { key: "full_time", label: "Full-time", count: v.full_time, href: viewHref({ type: "full_time" }) },
  ];
  const activeView =
    !query.type && !query.status ? "all" : !query.type && (query.status === "active" || query.status === "deactivated") ? query.status : query.type === "full_time" && !query.status ? "full_time" : "";
  const filtered = Boolean(query.q || query.status || query.type || query.mode || query.city);
  const shownProjects = board.companies.reduce((n, c) => n + c.projects.length, 0);

  return (
    <div className="space-y-4">
      {header(`${formatNumber(v.all)} projects from real companies, ${formatNumber(v.active)} open to candidates and ${formatNumber(v.deactivated)} deactivated by Findtern.`)}

      <AdminTabs items={views} active={activeView} label="Project views" />

      <TableToolbar
        searchPlaceholder="Search project, company or skill…"
        exportHref={exportHref}
        filters={[
          { key: "status", label: "Status", options: [...STATUS_FILTERS] },
          { key: "type", label: "Engagement", options: [{ value: "full_time", label: "Full-time" }, { value: "internship", label: "Internship" }] },
          { key: "mode", label: "Work mode", options: [...MODE_FILTERS] },
          { key: "city", label: "City", options: board.cities.map((c) => ({ value: c, label: c })) },
        ]}
      />

      {board.companies.length === 0 ? (
        <Panel>
          {filtered ? (
            <AdminEmpty title="No project matches" body="Nothing matches this search and these filters." action={{ href: "/admin/projects", label: "Clear filters" }} />
          ) : (
            <AdminEmpty title="No projects yet" body="Projects appear here once a company posts one." />
          )}
        </Panel>
      ) : (
        <>
          <ProjectsBoard
            key={`${board.page}:${toQueryString(params)}`}
            companies={board.companies}
            canWrite={mayWrite}
            summary={`${formatNumber(board.totalProjects)} ${board.totalProjects === 1 ? "project" : "projects"} from ${formatNumber(board.totalCompanies)} ${board.totalCompanies === 1 ? "company" : "companies"}${board.pages > 1 ? `, ${formatNumber(shownProjects)} on this page` : ""}.`}
          />
          {board.pages > 1 ? (
            <Panel>
              <Pagination
                page={board.page}
                pages={board.pages}
                total={board.totalCompanies}
                perPage={COMPANIES_PER_PAGE}
                rowsShown={board.companies.length}
                params={params}
                basePath="/admin/projects"
                noun="companies"
              />
            </Panel>
          ) : null}
        </>
      )}
    </div>
  );
}
