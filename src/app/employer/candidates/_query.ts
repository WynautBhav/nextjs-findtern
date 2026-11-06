import { and, desc, eq, sql } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import {
  RATING_META,
  toCandidateProfile,
  type CandidateProfile,
  type Ratings,
} from "@/lib/employer-candidates";
import { candidateRelations, hiredInternIds, type CandidateRelation } from "@/lib/employer-visibility";
import { attachPhotos, candidatePoolClauses, scoreExpr } from "@/lib/employer-pool";
import { projectCities } from "@/lib/project-locations";
import { likePattern } from "@/lib/admin/palette-search";
import { employerRegion, type Currency } from "@/lib/employer-pricing";
import { BANDS, type BandId } from "@/lib/score";
import { timezoneForLocation } from "@/lib/timezones";
import { parseSortFields } from "@/lib/candidate-sort";
import { MAX_COMPARE, isOpenProject, parseIds, rememberedFilters } from "@/lib/employer-selection";
import { presenceOf, type PresenceLabel } from "@/lib/presence";
import { savedInternIds } from "@/lib/saved-roles";
import { rankProfiles } from "@/components/employer/candidate-rank";
import type { FullTimeContext } from "@/components/employer/candidate-card";

export type SortKey = "score" | keyof Ratings;

export type Filters = {
  q: string;
  skills: string[];
  /**
   * The employer set the skills themselves (`skills` is in the URL, even
   * empty). Otherwise the selected project's skills apply and show as chips.
   */
  skillsSet: boolean;
  city: string;
  mode: string;
  minScore: number;
  laptop: string;
  /** Plan (price band) - the legacy page's hourly-price filter. */
  plan: BandId | "";
  /** Per-axis AI interview rating floors, out of 10. */
  minRatings: Ratings;
  /** Sort fields in priority order (legacy multi-field sort); empty = Findtern Score. */
  sorts: SortKey[];
  dir: "desc" | "asc";
  /**
   * Legacy "Include remote candidates" (EMB-15): off, candidates who only
   * work remotely are left out. Null = the project's default, which legacy
   * set ON for a remote project and OFF otherwise.
   */
  remote: boolean | null;
  /** Legacy "Maximum skill match": rank candidates with more of the chosen skills first. */
  skillPriority: boolean;
  /** "grid" is the cards (the default); "table" the dense ranked rows. */
  view: "grid" | "table";
  pageSize: number;
  page: number;
  project?: string;
  /** False when the employer chose "show everyone" over the project's defaults. */
  projectDefaults: boolean;
  /** Candidates ticked for Compare. Carried on every link so paging keeps them. */
  ids: string[];
  /** `ids` was in the URL (even empty): it wins over the remembered picks. */
  idsSet: boolean;
};

export const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "score", label: "Findtern Score" },
  ...RATING_META.map((meta) => ({ value: meta.key, label: meta.label })),
];

/** Query keys that are filters; anything else (project, ids, fresh) is not. */
export const FILTER_KEYS = [
  "q",
  "skills",
  "city",
  "mode",
  "min",
  "laptop",
  "plan",
  "sort",
  "dir",
  "view",
  "pageSize",
  "pf",
  "remote",
  "sm",
  "page",
  ...RATING_META.map((m) => `r_${m.key}`),
];

export type SearchParams = {
  q?: string | string[];
  skills?: string | string[];
  city?: string | string[];
  mode?: string | string[];
  min?: string | string[];
  laptop?: string | string[];
  plan?: string | string[];
  sort?: string | string[];
  dir?: string | string[];
  view?: string | string[];
  pageSize?: string | string[];
  ids?: string | string[];
  page?: string | string[];
  project?: string | string[];
  pf?: string | string[];
  remote?: string | string[];
  sm?: string | string[];
  /** "Reset": start clean instead of restoring the remembered filters. */
  fresh?: string | string[];
  /** Legacy deep link that opened the full-time offer for a hire (EMH-42). */
  ftInternId?: string | string[];
} & { [K in `r_${keyof Ratings}`]?: string | string[] };

export function readFilters(params: SearchParams): Filters {
  const min = Number(one(params.min) ?? "0");
  const page = Number(one(params.page) ?? "1");
  const ps = Number(one(params.pageSize) ?? "24");
  const pageSize = ps === 12 || ps === 48 ? ps : 24;
  const viewRaw = (one(params.view) ?? "").trim().toLowerCase();
  // Cards by default (client QA, 2 Nov). Rows stay one click away; "table" and
  // the old "list" both mean rows.
  const view: "grid" | "table" = viewRaw === "table" || viewRaw === "list" ? "table" : "grid";
  const planRaw = (one(params.plan) ?? "").trim();
  const floor = (raw: string | string[] | undefined) => {
    const n = Number(one(raw) ?? "0");
    return Number.isFinite(n) && n > 0 ? Math.min(10, n) : 0;
  };
  const all = (raw: string | string[] | undefined) => (raw === undefined ? [] : Array.isArray(raw) ? raw : [raw]);
  const remoteValues = all(params.remote);

  return {
    q: (one(params.q) ?? "").trim().slice(0, 60),
    skills: (one(params.skills) ?? "")
      .split(",")
      .map((skill) => skill.trim())
      .filter(Boolean)
      .slice(0, 7),
    skillsSet: params.skills !== undefined,
    city: (one(params.city) ?? "").trim().slice(0, 160),
    mode: (one(params.mode) ?? "").trim(),
    minScore: Number.isFinite(min) && min > 0 ? min : 0,
    laptop: (one(params.laptop) ?? "").trim().toLowerCase(),
    plan: BANDS.some((b) => b.id === planRaw) ? (planRaw as BandId) : "",
    minRatings: {
      communication: floor(params.r_communication),
      coding: floor(params.r_coding),
      aptitude: floor(params.r_aptitude),
      interview: floor(params.r_interview),
    },
    sorts: parseSortFields(params.sort),
    dir: one(params.dir) === "asc" ? "asc" : "desc",
    // The form sends remote=0, plus remote=1 when ticked; absent = default.
    remote: remoteValues.some((v) => ["1", "true", "on"].includes(v)) ? true : remoteValues.includes("0") ? false : null,
    // Absent = on (the default); the form sends sm=0, plus sm=1 when ticked.
    skillPriority: params.sm === undefined || all(params.sm).includes("1"),
    view,
    pageSize,
    page: Number.isFinite(page) && page > 0 ? Math.floor(page) : 1,
    project: (one(params.project) ?? "").trim(),
    projectDefaults: one(params.pf) !== "0",
    ids: parseIds(params.ids),
    idsSet: params.ids !== undefined,
  };
}

export function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function titleCase(value: string): string {
  return value.replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Tick or untick a candidate for Compare. Never silently drops an earlier
 * pick: the caller offers no link once four are chosen (EMB-13).
 */
export function toggle(list: string[], value: string): string[] {
  const hit = list.some((entry) => entry.toLowerCase() === value.toLowerCase());
  if (hit) return list.filter((entry) => entry.toLowerCase() !== value.toLowerCase());
  return list.length >= MAX_COMPARE ? list : [...list, value];
}

/**
 * Rebuild the query string from a filter change, on top of the current
 * filters (a skill chip has to keep the city and the score floor). A `""` or
 * `0` value removes that filter.
 */
export function withFilters(base: Filters, patch: Partial<Omit<Filters, "page">> & { page?: number | "" } = {}): string {
  const page = patch.page === "" ? 1 : (patch.page ?? base.page);
  // Changing the compare picks is explicit, so an emptied list stays empty
  // rather than falling back to the remembered one.
  const merged: Filters = { ...base, ...patch, page, idsSet: base.idsSet || patch.ids !== undefined };
  return `/employer/candidates${queryOf(merged)}`;
}

/**
 * The same view with no city. A typed city is simply dropped; a city that
 * came from the project's defaults needs "show everyone", so the project's
 * skills are pinned explicitly to keep matching on them.
 */
export function withoutCity(filters: Filters, effectiveSkills: string[], patch: Partial<Omit<Filters, "page">> = {}): string {
  return filters.city
    ? withFilters(filters, { ...patch, city: "", page: "" })
    : withFilters(filters, { ...patch, projectDefaults: false, skills: effectiveSkills, skillsSet: true, page: "" });
}

/** The query string for a set of filters. */
export function queryOf(merged: Filters): string {
  const next = new URLSearchParams(filterParams(merged));
  if (merged.project) next.set("project", merged.project);
  if (merged.ids.length > 0 || merged.idsSet) next.set("ids", merged.ids.join(","));
  if (merged.page > 1) next.set("page", String(merged.page));
  const query = next.toString();
  return query ? `?${query}` : "";
}

/** Just the filters: what is remembered per project (EMB-05). */
function filterParams(merged: Filters): URLSearchParams {
  const next = new URLSearchParams();
  if (merged.q) next.set("q", merged.q);
  if (merged.skillsSet) next.set("skills", merged.skills.join(","));
  if (merged.city) next.set("city", merged.city);
  if (merged.mode) next.set("mode", merged.mode);
  if (merged.minScore > 0) next.set("min", String(merged.minScore));
  if (merged.laptop) next.set("laptop", merged.laptop);
  if (merged.plan) next.set("plan", merged.plan);
  for (const meta of RATING_META) {
    const value = merged.minRatings[meta.key];
    if (value > 0) next.set(`r_${meta.key}`, String(value));
  }
  if (merged.sorts.length > 0) next.set("sort", merged.sorts.join(","));
  if (merged.dir === "asc") next.set("dir", "asc");
  if (merged.remote !== null) next.set("remote", merged.remote ? "1" : "0");
  if (!merged.skillPriority) next.set("sm", "0");
  // Always written, even for the default: a link without any filter looks like a bare
  // visit and restores the last remembered view, so "Cards" could never undo "Rows".
  if (merged.view) next.set("view", merged.view);
  if (merged.pageSize && merged.pageSize !== 24) next.set("pageSize", String(merged.pageSize));
  if (!merged.projectDefaults) next.set("pf", "0");
  return next;
}

export function rememberQueryOf(filters: Filters): string {
  return filterParams(filters).toString();
}

/**
 * The compare page reads `ids` and `project`; the rest of the filters ride
 * along so "Back to candidates" can return to the same view.
 */
export function compareHref(filters: Filters): string {
  return `/employer/compare${queryOf({ ...filters, page: 1 })}`;
}

/** How many filters are set beyond the defaults (the rail's "Apply (N)"). */
export function activeFilterCount(filters: Filters): number {
  return [
    Boolean(filters.q),
    Boolean(filters.city),
    Boolean(filters.mode),
    filters.remote !== null,
    filters.laptop === "yes",
    Boolean(filters.plan),
    filters.minScore > 0,
    ...RATING_META.map((meta) => filters.minRatings[meta.key] > 0),
    filters.sorts.length > 0,
    filters.dir === "asc",
    !filters.skillPriority,
    filters.skillsSet && filters.skills.length > 0,
  ].filter(Boolean).length;
}

/** Start clean: drops the remembered filters, keeps the project. */
export function resetHref(projectId: string | null): string {
  return `/employer/candidates?fresh=1${projectId ? `&project=${encodeURIComponent(projectId)}` : ""}`;
}

export type FilterChip = { key: string; label: string; href: string };

/**
 * One removable chip per filter the employer set (skills have their own chip
 * row above the list, sort and view live in the toolbar).
 */
export function activeChips(filters: Filters): FilterChip[] {
  const drop = (patch: Partial<Omit<Filters, "page">>) => withFilters(filters, { ...patch, page: "" });
  const chips: FilterChip[] = [];
  if (filters.q) chips.push({ key: "q", label: `Keyword: ${filters.q}`, href: drop({ q: "" }) });
  if (filters.city) chips.push({ key: "city", label: `City: ${filters.city}`, href: drop({ city: "" }) });
  if (filters.mode) chips.push({ key: "mode", label: `Work mode: ${titleCase(filters.mode)}`, href: drop({ mode: "" }) });
  if (filters.remote !== null) {
    chips.push({ key: "remote", label: filters.remote ? "Remote candidates included" : "Remote candidates left out", href: drop({ remote: null }) });
  }
  if (filters.laptop === "yes") chips.push({ key: "laptop", label: "Has a laptop", href: drop({ laptop: "" }) });
  const band = BANDS.find((b) => b.id === filters.plan);
  if (band) chips.push({ key: "plan", label: `Band: ${band.name}`, href: drop({ plan: "" }) });
  if (filters.minScore > 0) chips.push({ key: "min", label: `Findtern Score ${filters.minScore.toFixed(1)}+`, href: drop({ minScore: 0 }) });
  for (const meta of RATING_META) {
    const floor = filters.minRatings[meta.key];
    if (floor > 0) {
      chips.push({
        key: `r_${meta.key}`,
        label: `${meta.label} ${floor.toFixed(1)}+`,
        href: drop({ minRatings: { ...filters.minRatings, [meta.key]: 0 } }),
      });
    }
  }
  if (!filters.skillPriority) chips.push({ key: "sm", label: "Skill-match ranking off", href: drop({ skillPriority: true }) });
  return chips;
}

/** Up to five lower-cased city names from the comma-separated filter. */
export function cityTerms(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(",")
        .map((c) => c.trim().toLowerCase())
        .filter(Boolean),
    ),
  ).slice(0, 5);
}

/** A safety ceiling, not a page size: the pool is ranked in memory (EMB-06). */
const POOL_CEILING = 5000;

export type CandidatesData = {
  /** Set when this visit should restore the project's saved filters (EMB-05). */
  restoreTo: string | null;
  loadFailed: boolean;
  candidates: CandidateProfile[];
  total: number;
  pages: number;
  currency: Currency;
  region: "IN" | null;
  projects: { id: string; projectName: string }[];
  shortlisted: Set<string>;
  activeProjectId: string | null;
  activeProjectSkills: string[];
  /** The skills the list is filtered by: the employer's, or the project's. */
  effectiveSkills: string[];
  /** What the selected project filled in (row 61), for the note above the list. */
  projectApplied: { name: string; skills: string[]; city: string } | null;
  includeRemote: boolean;
  cityList: string[];
  nameUnlocked: Set<string>;
  plans: (typeof schema.pricingPlans.$inferSelect)[];
  relations: Map<string, CandidateRelation>;
  fullTime: FullTimeContext | null;
  /** Presence label per candidate on this page; null = no label shown. */
  presence: Record<string, PresenceLabel | null>;
  /** Interns who saved the selected project's role (it raises them in the ranking). */
  saved: Set<string>;
};

/**
 * Everything the candidates page reads. `filters.project` is corrected in
 * place to the project actually in use.
 */
export async function loadCandidates(
  uid: string,
  filters: Filters,
  opts: { hasFilterParams: boolean; fresh: boolean },
): Promise<CandidatesData> {
  const data: CandidatesData = {
    restoreTo: null,
    loadFailed: false,
    candidates: [],
    total: 0,
    pages: 1,
    currency: "INR",
    region: null,
    projects: [],
    shortlisted: new Set(),
    activeProjectId: null,
    activeProjectSkills: [],
    effectiveSkills: filters.skills,
    projectApplied: null,
    includeRemote: false,
    cityList: [],
    nameUnlocked: new Set(),
    plans: [],
    relations: new Map(),
    fullTime: null,
    presence: {},
    saved: new Set(),
  };
  const compareIds = filters.ids;

  try {
    const db = getDb();

    // Names stay redacted until this employer hires the intern.
    data.nameUnlocked = await hiredInternIds(db, uid);

    // A shortlist is keyed on (project, candidate), so the page needs a
    // project. Only open projects are offered, newest first, and the newest
    // open one is the default (EMB-04 / EMH-15, legacy picker).
    const projectRows = (
      await db
        .select({
          id: schema.projects.id,
          projectName: schema.projects.projectName,
          skills: schema.projects.skills,
          city: schema.projects.city,
          preferredLocations: schema.projects.preferredLocations,
          locationType: schema.projects.locationType,
          status: schema.projects.status,
          takenDownAt: schema.projects.takenDownAt,
        })
        .from(schema.projects)
        .where(eq(schema.projects.employerId, uid))
        .orderBy(desc(schema.projects.createdAt))
    ).filter((p) => isOpenProject(p.status, p.takenDownAt));
    data.projects = projectRows.map((p) => ({ id: p.id, projectName: p.projectName }));
    const activeProjectId =
      (filters.project && data.projects.find((p) => p.id === filters.project)?.id) || data.projects[0]?.id || null;
    data.activeProjectId = activeProjectId;
    // A remembered project that was since closed or deleted is not carried on links.
    if (filters.project !== activeProjectId) filters.project = activeProjectId ?? "";

    // A bare visit (sidebar, "Back to candidates", a new project picked)
    // restores what this employer last applied on the project.
    if (!opts.hasFilterParams && !opts.fresh && activeProjectId) {
      const savedFilters = await rememberedFilters(uid, activeProjectId);
      if (savedFilters) {
        const next = new URLSearchParams(savedFilters);
        next.set("project", activeProjectId);
        if (compareIds.length > 0) next.set("ids", compareIds.join(","));
        data.restoreTo = `/employer/candidates?${next.toString()}`;
      }
    }
    if (data.restoreTo) return data;

    if (activeProjectId) {
      const rows = await db
        .select({ internId: schema.employerCartItems.internId })
        .from(schema.employerCartItems)
        .where(
          and(
            eq(schema.employerCartItems.employerId, uid),
            eq(schema.employerCartItems.projectId, activeProjectId),
            eq(schema.employerCartItems.listType, "cart"),
          ),
        );
      data.shortlisted = new Set(rows.map((r) => r.internId));
    }

    const [employer] = await db
      .select({
        country: schema.employers.country,
        state: schema.employers.state,
        countryCode: schema.employers.countryCode,
        phoneNumber: schema.employers.phoneNumber,
        fteStatus: schema.employers.internationalFteStatus,
      })
      .from(schema.employers)
      .where(eq(schema.employers.id, uid))
      .limit(1);
    data.region = employerRegion(employer ?? {});
    data.currency = data.region === "IN" ? "INR" : "USD";
    data.fullTime = { employerId: uid, fteStatus: employer?.fteStatus ?? "none", timezone: timezoneForLocation(employer ?? {}) };

    // The pool rule (active, live, open to work, AI-interviewed, approved)
    // lives in lib/employer-pool so the dashboard applies the same one.
    const clauses = candidatePoolClauses();

    if (filters.q) {
      // Keyword only - never a name. Employers browse a redacted pool, so the
      // query matches skills and city. Matching on name would let anyone
      // probe whether a specific person is on the platform. Never the bio:
      // employers do not receive it, so a search must not reveal it either.
      const needle = likePattern(filters.q);
      clauses.push(
        sql`(${schema.internOnboarding.skills}::text ILIKE ${needle} ESCAPE '\\' OR ${schema.internOnboarding.city} ILIKE ${needle} ESCAPE '\\')`,
      );
    }

    // Row 61 / legacy dashboard:1528: the selected project fills in its own
    // skills and city when the employer has not typed any. "Show everyone"
    // (pf=0) switches that off; typed filters always win.
    const project = projectRows.find((p) => p.id === activeProjectId);
    const projectRemote = !project?.locationType || project.locationType === "remote";
    data.activeProjectSkills = (Array.isArray(project?.skills) ? project.skills : []).filter(Boolean).slice(0, 7);
    let skillTerms = filters.skills;
    data.effectiveSkills = filters.skills;
    let cityText = filters.city;
    if (project && filters.projectDefaults) {
      if (!filters.skillsSet) skillTerms = data.activeProjectSkills;
      data.effectiveSkills = skillTerms;
      if (!cityText) cityText = projectCities(project).join(", ");
      if (skillTerms !== filters.skills || cityText !== filters.city) {
        data.projectApplied = {
          name: project.projectName,
          skills: skillTerms === filters.skills ? [] : skillTerms,
          city: cityText === filters.city ? "" : cityText,
        };
      }
    }

    // Legacy "Include remote candidates" (EMB-15): on by default for a
    // remote project (and when showing everyone), off otherwise. Off means
    // candidates who only work remotely are left out. Picking the Remote
    // work mode means remote candidates, so it counts as on.
    let includeRemote = filters.remote ?? (projectRemote || !filters.projectDefaults || filters.mode === "remote");
    if (filters.mode === "remote") includeRemote = true;
    data.includeRemote = includeRemote;
    if (!includeRemote) {
      clauses.push(
        sql`((${schema.internOnboarding.locationTypes})::text ILIKE '%onsite%' OR (${schema.internOnboarding.locationTypes})::text ILIKE '%hybrid%')`,
      );
    }

    // Any of the chosen skills (legacy rule): "React + Node" finds people with
    // either, and those with more of them rank first. A skill matches by its
    // whole name, case-insensitively, as legacy did (dashboard:2716).
    if (skillTerms.length > 0) {
      const wanted = Array.from(new Set(skillTerms.map((s) => s.trim().toLowerCase()).filter(Boolean)));
      const skills = schema.internOnboarding.skills;
      clauses.push(
        sql`EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(${skills}) = 'array' THEN ${skills} ELSE '[]'::jsonb END) AS s(e)
          WHERE lower(trim(coalesce(e->>'name', e->>'skill', e->>'title', e #>> '{}'))) IN (${sql.join(
            wanted.map((w) => sql`${w}`),
            sql`, `,
          )}))`,
      );
    }

    // Cities match the candidate's PREFERRED cities only, by the city part
    // of "City, State" (legacy getLocationMatchCount, EMB-15 decided). The
    // home city does not count. "Include remote" lets in candidates who take
    // remote work: they store no preferred city, so the city test would hide
    // them (`matchesPlace` in lib/employer-candidates is the same rule).
    const cityList = cityTerms(cityText);
    data.cityList = cityList;
    if (cityList.length > 0) {
      const preferred = schema.internOnboarding.preferredLocations;
      const cityMatch = sql`EXISTS (SELECT 1 FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(${preferred}) = 'array' THEN ${preferred} ELSE '[]'::jsonb END) AS p(v)
          WHERE lower(btrim(split_part(v, ',', 1))) IN (${sql.join(
            cityList.map((c) => sql`${c}`),
            sql`, `,
          )}))`;
      clauses.push(
        includeRemote
          ? sql`(${cityMatch} OR (${schema.internOnboarding.locationTypes})::text ILIKE '%remote%')`
          : cityMatch,
      );
    }

    if (filters.laptop === "yes") {
      clauses.push(eq(schema.internOnboarding.hasLaptop, true));
    } else if (filters.laptop === "no") {
      clauses.push(eq(schema.internOnboarding.hasLaptop, false));
    }

    if (filters.mode) {
      clauses.push(sql`(${schema.internOnboarding.locationTypes})::text ILIKE ${likePattern(filters.mode)} ESCAPE '\\'`);
    }

    if (filters.minScore > 0) {
      clauses.push(sql`${scoreExpr()} >= ${filters.minScore}`);
    }

    if (filters.plan) {
      const band = BANDS.find((b) => b.id === filters.plan);
      if (band) {
        // The top band is closed at 10, the others half-open - as `bandFor`.
        clauses.push(
          band.max >= 10
            ? sql`${scoreExpr()} >= ${band.min}`
            : sql`(${scoreExpr()} >= ${band.min} AND ${scoreExpr()} < ${band.max})`,
        );
      }
    }

    // The whole filtered pool, ranked in memory (EMB-06: this was the
    // newest 500 rows, so above 500 interns the score sort and the total
    // were wrong). The ceiling only guards against a runaway table.
    const rows = await db
      .select({ user: schema.users, onboarding: schema.internOnboarding })
      .from(schema.users)
      .innerJoin(schema.internOnboarding, eq(schema.internOnboarding.userId, schema.users.id))
      .where(and(...clauses))
      // Newest onboarding row first, so the dedupe below keeps it (legacy
      // read only the newest row per intern); then id for a total order.
      .orderBy(desc(schema.internOnboarding.updatedAt), desc(schema.users.id))
      .limit(POOL_CEILING);

    // `intern_onboarding` has no unique index on `user_id`: one row per intern.
    const seen = new Set<string>();
    const profiles = rows
      .filter((row) => {
        if (seen.has(row.user.id)) return false;
        seen.add(row.user.id);
        return true;
      })
      .map((row) => toCandidateProfile(row.user, row.onboarding))
      // Rating floors run here: `ratings` is a nested jsonb object whose
      // values the legacy writer stored as numbers or numeric strings.
      .filter((p) => RATING_META.every((meta) => p.ratings[meta.key] >= filters.minRatings[meta.key]));

    // Roles students saved for this project (OA3). Optional: a failed read
    // only drops the "Interested in this role" boost, never the list.
    data.saved = activeProjectId
      ? await savedInternIds(activeProjectId).catch((err) => {
          console.error("[employer/candidates] saved roles", err);
          return new Set<string>();
        })
      : new Set<string>();

    // A sort the employer picked leads; otherwise saved roles do. Skill and
    // city matches then break ties (bug sheet 21 Oct). Initials, never the name.
    const ranked = rankProfiles(profiles, {
      sorts: filters.sorts,
      dir: filters.dir,
      skillTerms,
      skillPriority: filters.skillPriority,
      cities: cityList,
      saved: data.saved,
    });

    data.total = ranked.length;
    data.pages = Math.max(1, Math.ceil(data.total / filters.pageSize));
    const start = (Math.min(filters.page, data.pages) - 1) * filters.pageSize;
    data.candidates = ranked.slice(start, start + filters.pageSize);
    await attachPhotos(db, data.candidates);

    data.plans = await db.select().from(schema.pricingPlans).where(eq(schema.pricingPlans.isActive, true));
    const pageIds = data.candidates.map((c) => c.id);
    data.relations = await candidateRelations(db, uid, pageIds);
    // Labels like "Online now", never a time. Optional, like the saved roles.
    data.presence = await presenceOf(pageIds).catch((err) => {
      console.error("[employer/candidates] presence", err);
      return {};
    });
  } catch (err) {
    console.error("[employer/candidates] load failed", err);
    data.loadFailed = true;
  }
  return data;
}

