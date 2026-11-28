import { and, count, countDistinct, desc, eq, inArray, max, ne, not, sql, type SQL } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { scopeLabel } from "@/lib/db/schema";
import { parsePageRequest, searchAny, toQueryString } from "@/lib/admin/params";
import { hiredWhere, openProject, realEmployerId, trimmedStatus } from "@/lib/admin/scope";
import { TAKEDOWN_WITHDRAW_STATUSES } from "@/lib/projects/takedown";
import { exportRows } from "./projects-board-export.ts";
import { paySummary, PROJECT_VIEWS, type PaySummary, type ProjectView } from "./projects-board-pure.ts";

/**
 * Admin Projects board, paged by company. Every count goes through `projectFilters` and `VIEW_SQL`, so a view tab's count
 * is the number of projects that view lists (pure twin: matchesView in projects-board-pure.ts).
 */

export const COMPANIES_PER_PAGE = 20;
export const COMPANY_SORTS = ["projects", "name", "latest"] as const;
export type CompanySort = (typeof COMPANY_SORTS)[number];

export const STATUS_FILTERS = [
  { value: "active", label: "Active" },
  { value: "closed", label: "Not active" },
  { value: "deactivated", label: "Deactivated by Findtern" },
  { value: "paused", label: "Paused" },
  { value: "employer_closed", label: "Closed by employer" },
  { value: "draft", label: "Draft" },
  { value: "pending_review", label: "Pending review" },
  { value: "rejected", label: "Rejected" },
] as const;
export const MODE_FILTERS = [
  { value: "remote", label: "Remote" },
  { value: "onsite", label: "On-site" },
  { value: "hybrid", label: "Hybrid" },
] as const;

export interface ProjectsQuery {
  q: string;
  status: string;
  type: string;
  mode: string;
  city: string;
  sort: CompanySort;
  page: number;
}

export function parseProjectsQuery(params: Record<string, string>): ProjectsQuery {
  const pick = <T extends readonly { value: string }[]>(list: T, v: string | undefined) => (list.some((o) => o.value === v) ? v! : "");
  // Page and search through the shared parser (clamped page, NUL bytes stripped: Postgres rejects \u0000 in text).
  const { page, search } = parsePageRequest(params);
  return {
    q: search.slice(0, 200),
    status: pick(STATUS_FILTERS, params.status),
    type: params.type === "full_time" || params.type === "internship" ? params.type : "",
    mode: pick(MODE_FILTERS, params.mode),
    city: (params.city ?? "").replaceAll("\u0000", "").trim().slice(0, 100),
    sort: (COMPANY_SORTS as readonly string[]).includes(params.sort ?? "") ? (params.sort as CompanySort) : "projects",
    page,
  };
}

const P = schema.projects;

/** The employer's status in canonical words (lifecycle.ts normalizeStatus), a blank one being live. */
export const lifecycleSql = sql`(CASE coalesce(nullif(lower(${trimmedStatus()}), ''), 'published') WHEN 'active' THEN 'published' WHEN 'inactive' THEN 'paused' WHEN 'archived' THEN 'closed' ELSE coalesce(nullif(lower(${trimmedStatus()}), ''), 'published') END)`;
const employerStatus = (s: string) => sql`(${P.takenDownAt} IS NULL AND ${lifecycleSql} = ${s})`;

/** SQL twin of matchesView. */
export const VIEW_SQL: Record<ProjectView, SQL | undefined> = {
  all: undefined,
  active: openProject(),
  deactivated: sql`${P.takenDownAt} IS NOT NULL`,
  full_time: eq(P.fullTimeOffer, true),
};

export const STATUS_SQL: Record<string, SQL> = {
  active: openProject(),
  closed: not(openProject()),
  deactivated: VIEW_SQL.deactivated!,
  paused: employerStatus("paused"),
  employer_closed: sql`(${P.takenDownAt} IS NULL AND ${lifecycleSql} NOT IN ('published', 'paused', 'draft', 'pending_review', 'rejected'))`,
  draft: employerStatus("draft"),
  pending_review: employerStatus("pending_review"),
  rejected: employerStatus("rejected"),
};

/** Real employers' projects matching the search and filters. Needs the employers join (search reads the company name). */
export function projectFilters(query: Omit<ProjectsQuery, "sort" | "page">): SQL {
  const conds: (SQL | undefined)[] = [
    realEmployerId(P.employerId),
    searchAny([sql`${P.projectName}`, sql`${schema.employers.companyName}`, sql`${P.skills}::text`], query.q),
    query.status ? STATUS_SQL[query.status] : undefined,
    query.type === "full_time" ? VIEW_SQL.full_time : query.type === "internship" ? sql`coalesce(${P.fullTimeOffer}, false) = false` : undefined,
    query.mode ? sql`lower(trim(coalesce(${P.locationType}, ''))) = ${query.mode}` : undefined,
    query.city ? sql`lower(trim(coalesce(${P.city}, ''))) = ${query.city.toLowerCase()}` : undefined,
  ];
  return and(...conds.filter((c): c is SQL => Boolean(c)))!;
}

export interface BoardProject {
  id: string;
  name: string;
  skills: string[];
  scopeOfWork: string;
  /** The employer's duration pick in words ("Up to 90 days"), or the free text of a legacy row; "" when blank. */
  scope: string;
  city: string;
  state: string;
  preferredLocations: string[];
  locationType: string;
  fullTimeOffer: boolean;
  status: string | null;
  takenDownAt: string | null;
  takenDownReason: string | null;
  createdAt: string | null;
  offersSent: number;
  hires: number;
  openOffers: number;
  pay: PaySummary;
}

export interface BoardCompany {
  employerId: string;
  companyName: string;
  projects: BoardProject[];
}

export interface ProjectsBoard {
  companies: BoardCompany[];
  totalCompanies: number;
  totalProjects: number;
  pages: number;
  page: number;
  views: Record<ProjectView, number>;
  cities: string[];
}

const str = (v: unknown) => (typeof v === "string" ? v : "");
const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "") : []);
const iso = (d: Date | string | null) => (d ? new Date(d).toISOString() : null);

/** View tab counts over every real employer's projects (no search or filter), one row from VIEW_SQL. */
export async function loadProjectViewCounts(): Promise<Record<ProjectView, number>> {
  const db = getDb();
  const [row] = await db
    .select(Object.fromEntries(PROJECT_VIEWS.map((v) => [v, VIEW_SQL[v] ? sql<number>`count(*) filter (where ${VIEW_SQL[v]})::int` : sql<number>`count(*)::int`])) as Record<ProjectView, SQL<number>>)
    .from(P)
    .where(realEmployerId(P.employerId));
  return Object.fromEntries(PROJECT_VIEWS.map((v) => [v, Number(row?.[v] ?? 0)])) as Record<ProjectView, number>;
}

/** `all`: every matching company in screen order, no paging (the CSV export). */
export async function loadProjectsBoard(query: ProjectsQuery, opts: { all?: boolean } = {}): Promise<ProjectsBoard> {
  const db = getDb();
  const where = projectFilters(query);
  const latest = max(P.createdAt);
  const n = count();
  const order =
    query.sort === "name"
      ? [sql`lower(${schema.employers.companyName})`, schema.employers.id]
      : query.sort === "latest"
        ? [sql`${latest} DESC NULLS LAST`, schema.employers.id]
        : [desc(n), sql`lower(${schema.employers.companyName})`, schema.employers.id];

  const [[totals], views, cityRows] = await Promise.all([
    db
      .select({ companies: countDistinct(P.employerId), projects: count() })
      .from(P)
      .innerJoin(schema.employers, eq(schema.employers.id, P.employerId))
      .where(where),
    loadProjectViewCounts(),
    db
      .selectDistinct({ city: sql<string>`initcap(trim(${P.city}))` })
      .from(P)
      .where(and(realEmployerId(P.employerId), sql`trim(coalesce(${P.city}, '')) <> ''`))
      .orderBy(sql`initcap(trim(${P.city}))`)
      .limit(200),
  ]);
  const totalCompanies = Number(totals?.companies ?? 0);
  const pages = Math.max(1, Math.ceil(totalCompanies / COMPANIES_PER_PAGE));
  const page = opts.all ? 1 : Math.min(query.page, pages);
  const perPage = opts.all ? Math.max(1, totalCompanies) : COMPANIES_PER_PAGE;

  const companyRows = await db
    .select({ employerId: schema.employers.id, companyName: schema.employers.companyName })
    .from(P)
    .innerJoin(schema.employers, eq(schema.employers.id, P.employerId))
    .where(where)
    .groupBy(schema.employers.id, schema.employers.companyName)
    .orderBy(...order)
    .limit(perPage)
    .offset((page - 1) * perPage);
  const ids = companyRows.map((c) => c.employerId);

  const projects = ids.length
    ? await db
        .select({
          id: P.id,
          employerId: P.employerId,
          name: P.projectName,
          skills: P.skills,
          scopeOfWork: P.scopeOfWork,
          city: P.city,
          state: P.state,
          preferredLocations: P.preferredLocations,
          locationType: P.locationType,
          fullTimeOffer: P.fullTimeOffer,
          status: P.status,
          takenDownAt: P.takenDownAt,
          takenDownReason: P.takenDownReason,
          createdAt: P.createdAt,
        })
        .from(P)
        .innerJoin(schema.employers, eq(schema.employers.id, P.employerId))
        .where(and(where, inArray(P.employerId, ids)))
        .orderBy(desc(P.createdAt), P.id)
    : [];
  const projectIds = projects.map((p) => p.id);

  const pr = schema.proposals;
  const [stats, offers] = projectIds.length
    ? await Promise.all([
        db
          .select({
            projectId: pr.projectId,
            sent: sql<number>`count(*) filter (where ${pr.status} <> 'draft')::int`,
            hires: sql<number>`count(*) filter (where ${hiredWhere("proposals")})::int`,
            open: sql<number>`count(*) filter (where ${inArray(pr.status, [...TAKEDOWN_WITHDRAW_STATUSES])} and ${pr.hiredAt} is null)::int`,
          })
          .from(pr)
          .where(inArray(pr.projectId, projectIds))
          .groupBy(pr.projectId),
        db
          .select({ projectId: pr.projectId, status: pr.status, currency: pr.currency, offerDetails: pr.offerDetails })
          .from(pr)
          .where(and(inArray(pr.projectId, projectIds), ne(pr.status, "draft"))),
      ])
    : [[], []];
  const statOf = new Map(stats.map((s) => [s.projectId, s]));
  const offersOf = new Map<string, typeof offers>();
  for (const o of offers) offersOf.set(o.projectId, [...(offersOf.get(o.projectId) ?? []), o]);

  const byCompany = new Map<string, BoardProject[]>();
  for (const p of projects) {
    const s = statOf.get(p.id);
    const row: BoardProject = {
      id: p.id,
      name: p.name,
      skills: list(p.skills),
      scopeOfWork: str(p.scopeOfWork).trim(),
      scope: str(p.scopeOfWork).trim() ? scopeLabel(str(p.scopeOfWork).trim()) : "",
      city: str(p.city).trim(),
      state: str(p.state).trim(),
      preferredLocations: list(p.preferredLocations),
      locationType: str(p.locationType).trim().toLowerCase(),
      fullTimeOffer: p.fullTimeOffer === true,
      status: p.status,
      takenDownAt: iso(p.takenDownAt),
      takenDownReason: p.takenDownReason,
      createdAt: iso(p.createdAt),
      offersSent: Number(s?.sent ?? 0),
      hires: Number(s?.hires ?? 0),
      openOffers: Number(s?.open ?? 0),
      pay: paySummary(offersOf.get(p.id) ?? []),
    };
    byCompany.set(p.employerId, [...(byCompany.get(p.employerId) ?? []), row]);
  }

  return {
    companies: companyRows.map((c) => ({ employerId: c.employerId, companyName: c.companyName ?? "", projects: byCompany.get(c.employerId) ?? [] })),
    totalCompanies,
    totalProjects: Number(totals?.projects ?? 0),
    pages,
    page,
    views,
    cities: cityRows.map((r) => r.city).filter(Boolean),
  };
}

export const EXPORT_MAX_ROWS = 10_000;


/**
 * The page's CSV link: the page's own params, unpaged. `type` names the export on that route, so the Engagement filter
 * travels as `ft=yes|no` and `exportQuery` turns it back.
 */
export function projectsExportHref(params: Record<string, string>): string {
  const type = parseProjectsQuery(params).type;
  return `/api/admin/export${toQueryString({ ...params, type: "projects", ft: type === "full_time" ? "yes" : type === "internship" ? "no" : "", page: "" })}`;
}

/** The export's query params (`type` names the export there, so Engagement travels as `ft=yes|no`) as the page's query. */
export function exportQuery(params: Record<string, string>): ProjectsQuery {
  return parseProjectsQuery({ ...params, type: params.ft === "yes" ? "full_time" : params.ft === "no" ? "internship" : "" });
}

/** The CSV's rows: the loader itself with every filter and the company sort, unpaged. Null when more than EXPORT_MAX_ROWS match. */
export async function loadProjectsExport(params: Record<string, string>) {
  const query = exportQuery(params);
  const [{ projects }] = await getDb()
    .select({ projects: count() })
    .from(P)
    .innerJoin(schema.employers, eq(schema.employers.id, P.employerId))
    .where(projectFilters(query));
  if (Number(projects) > EXPORT_MAX_ROWS) return null;
  return exportRows((await loadProjectsBoard(query, { all: true })).companies);
}
