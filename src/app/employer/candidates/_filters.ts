/**
 * Query-string contract of /employer/candidates: the filter types, how a URL
 * becomes `Filters` and back. Pure functions, moved out of page.tsx unchanged.
 */
import { RATING_META, type Ratings } from "@/lib/employer-candidates";
import { BANDS, PLAN_NAME, type BandId } from "@/lib/score";
import { parseSortFields } from "@/lib/candidate-sort";
import { MAX_COMPARE, parseIds } from "@/lib/employer-selection";

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

export type Chip = { label: string; href: string; cause?: string };

/** One removable chip per filter set in the rail (skills have their own row). */
export function activeChipsOf(f: Filters, hrefFor: (patch: Partial<Omit<Filters, "page">>) => string): Chip[] {
  const chips: Chip[] = [];
  if (f.q) chips.push({ label: `Keyword: ${f.q}`, href: hrefFor({ q: "" }), cause: `the keyword "${f.q}"` });
  if (f.city) chips.push({ label: `City: ${f.city}`, href: hrefFor({ city: "" }), cause: `the city filter (${f.city})` });
  if (f.mode) chips.push({ label: `Mode: ${f.mode}`, href: hrefFor({ mode: "" }), cause: `the work mode (${f.mode})` });
  if (f.laptop === "yes") chips.push({ label: "Has a laptop", href: hrefFor({ laptop: "" }), cause: "the laptop filter" });
  if (f.plan) chips.push({ label: `Price: ${PLAN_NAME[f.plan]}`, href: hrefFor({ plan: "" }), cause: `the hourly price (${PLAN_NAME[f.plan]} only)` });
  if (f.minScore > 0) chips.push({ label: `Score ${f.minScore.toFixed(1)}+`, href: hrefFor({ minScore: 0 }), cause: `the score floor (${f.minScore.toFixed(1)}+)` });
  for (const meta of RATING_META) {
    const v = f.minRatings[meta.key];
    if (v > 0) chips.push({ label: `${meta.label} ${v.toFixed(1)}+`, href: hrefFor({ minRatings: { ...f.minRatings, [meta.key]: 0 } }), cause: `the ${meta.label} floor (${v.toFixed(1)}+)` });
  }
  return chips;
}

/* ── Filters ─────────────────────────────────────────────────────────────── */

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
export function filterParams(merged: Filters): URLSearchParams {
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
