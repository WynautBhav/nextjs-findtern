/**
 * The Candidates page's URL contract, with no database in it: what `readFilters` reads, the links every control builds
 * (`withFilters`, `queryOf`) and the chips. Read by the server loader AND by the browser region, so a link built on either
 * side is the same link. Relative `.ts` imports only (runs under plain `node --test` and in the client bundle).
 */

import type { schema } from "./db/index.ts";
import type { CandidateProfile } from "./employer-candidates.ts";
import type { CandidateRelation } from "./employer-visibility.ts";
import type { Currency } from "./employer-pricing.ts";
import type { PresenceLabel } from "./presence.ts";
import type { SubscriptionCharge } from "./employer-subscription.ts";
import type { CollegeOption } from "./candidate-pro-filters.ts";
import type { RelaxCounts } from "../components/employer/candidate-view.ts";
import { RATING_META, type Ratings } from "./employer-candidates.ts";
import { BANDS, PLAN_NAME, type BandId } from "./score.ts";
import { collegeSortToken, collegeSortWithDir, parseSortDir, parseSortFields, type CollegeSort, type SortDir } from "./candidate-sort.ts";
import { proQueryPairs, proRequestOf } from "./candidate-pro-request.ts";
import { proChips } from "./candidate-pro-filters.ts";
import { parseIds } from "./compare-map.ts";
import { MAX_COMPARE } from "./compare-map.ts";
import { PRO_PARAMS } from "./employer-filter-restore.ts";
import { DEFAULT_PAGE_SIZE, dedupeSkills, filterCount, parsePageSize, parseView, type ListView } from "../components/employer/candidate-view.ts";

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
  /**
   * `city` is in the URL, even empty: the employer's own choice (empty = "no city"), so the selected
   * project's city neither pre-fills the field nor filters. Otherwise the project's city applies.
   */
  citySet: boolean;
  minScore: number;
  laptop: string;
  /** Plan (price band) - the legacy page's hourly-price filter. */
  plan: BandId | "";
  /** Per-axis AI interview rating floors, out of 10. */
  minRatings: Ratings;
  /** Sort fields in priority order (legacy multi-field sort); empty = Findtern Score. */
  sorts: SortKey[];
  /** For the score sort chosen in `sorts`; "desc" (the default) when none is. The college order carries its own in `collegeSort`. */
  dir: SortDir;
  /**
   * Findtern Pro (subscribers only): a minimum CGPA, only CGPAs a college has verified, the colleges wanted and a
   * college order. As read from the URL; `loadCandidates` empties them in place for an employer without the
   * subscription, so every link built afterwards is clean.
   */
  cgpaMin: number;
  cgpaVerified: boolean;
  colleges: string[];
  collegeSort: CollegeSort | null;
  /**
   * Legacy "Include remote candidates" (EMB-15): off, candidates who only
   * work remotely are left out. Null = the project's default, which legacy
   * set ON for a remote project and OFF otherwise.
   */
  remote: boolean | null;
  /** Legacy "Maximum skill match": rank candidates with more of the chosen skills first. */
  skillPriority: boolean;
  /** "list" is the full-width cards (the default); "grid" the compact ones, two across, three on wide screens; "rows" one line each. */
  view: ListView;
  pageSize: number;
  page: number;
  project?: string;
  /** False when the employer chose "show everyone" over the project's defaults. */
  projectDefaults: boolean;
  /** "Saved" tab: only this project's shortlisted candidates, other filters set aside. */
  saved: boolean;
  /** Candidates ticked for Compare. Carried on every link so paging keeps them. */
  ids: string[];
  /** `ids` was in the URL (even empty): it wins over the remembered picks. */
  idsSet: boolean;
};

export const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "score", label: "Findtern Score" },
  ...RATING_META.map((meta) => ({ value: meta.key, label: meta.label })),
];

/** Query keys that are filters; anything else (project, ids, fresh, and the retired `view`) is not. */
export const FILTER_KEYS = [
  "q",
  "skills",
  "city",
  "min",
  "laptop",
  "plan",
  "sort",
  "dir",
  "pageSize",
  ...PRO_PARAMS,
  "pf",
  "remote",
  "sm",
  "page",
  "saved",
  ...RATING_META.map((m) => `r_${m.key}`),
];

export type SearchParams = {
  q?: string | string[];
  skills?: string | string[];
  city?: string | string[];
  min?: string | string[];
  laptop?: string | string[];
  plan?: string | string[];
  sort?: string | string[];
  dir?: string | string[];
  view?: string | string[];
  pageSize?: string | string[];
  /** Findtern Pro: read by `loadCandidates` only for a subscriber. */
  cgpaMin?: string | string[];
  cgpaVerified?: string | string[];
  colleges?: string | string[];
  ids?: string | string[];
  page?: string | string[];
  project?: string | string[];
  pf?: string | string[];
  remote?: string | string[];
  sm?: string | string[];
  saved?: string | string[];
  /** "Reset": start clean instead of restoring the remembered filters. */
  fresh?: string | string[];
  /** Legacy deep link that opened the full-time offer for a hire (EMH-42). */
  ftInternId?: string | string[];
} & { [K in `r_${keyof Ratings}`]?: string | string[] };

export function readFilters(params: SearchParams): Filters {
  const min = Number(one(params.min) ?? "0");
  const page = Number(one(params.page) ?? "1");
  const pageSize = parsePageSize(one(params.pageSize));
  const view = parseView(one(params.view));
  const planRaw = (one(params.plan) ?? "").trim();
  const floor = (raw: string | string[] | undefined) => {
    const n = Number(one(raw) ?? "0");
    return Number.isFinite(n) && n > 0 ? Math.min(10, n) : 0;
  };
  const all = (raw: string | string[] | undefined) => (raw === undefined ? [] : Array.isArray(raw) ? raw : [raw]);
  const remoteValues = all(params.remote);
  const pro = proRequestOf(params);
  const sorts = parseSortFields(params.sort);

  return {
    q: (one(params.q) ?? "").trim().slice(0, 60),
    skills: dedupeSkills(one(params.skills) ?? ""),
    skillsSet: params.skills !== undefined,
    city: (one(params.city) ?? "").trim().slice(0, 160),
    citySet: params.city !== undefined,
    minScore: Number.isFinite(min) && min > 0 ? min : 0,
    laptop: (one(params.laptop) ?? "").trim().toLowerCase(),
    plan: BANDS.some((b) => b.id === planRaw) ? (planRaw as BandId) : "",
    minRatings: {
      communication: floor(params.r_communication),
      coding: floor(params.r_coding),
      aptitude: floor(params.r_aptitude),
      interview: floor(params.r_interview),
    },
    sorts,
    dir: parseSortDir(params.dir, sorts),
    cgpaMin: pro.cgpaMin,
    cgpaVerified: pro.cgpaVerified,
    colleges: pro.colleges,
    collegeSort: collegeSortWithDir(pro.collegeSort, params.dir),
    // The form sends remote=0, plus remote=1 when ticked; absent = default.
    remote: remoteValues.some((v) => ["1", "true", "on"].includes(v)) ? true : remoteValues.includes("0") ? false : null,
    // Absent = on (the default); the form sends sm=0, plus sm=1 when ticked.
    skillPriority: params.sm === undefined || all(params.sm).includes("1"),
    view,
    pageSize,
    page: Number.isFinite(page) && page > 0 ? Math.floor(page) : 1,
    project: (one(params.project) ?? "").trim(),
    projectDefaults: one(params.pf) !== "0",
    saved: one(params.saved) === "1",
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
 * The same view with no city: an explicit empty `city`, so the project's own city does not come back
 * (and the project's skills keep matching).
 */
export function withoutCity(filters: Filters, patch: Partial<Omit<Filters, "page">> = {}): string {
  return withFilters(filters, { ...patch, city: "", citySet: true, page: "" });
}

/** The query string for a set of filters. */
export function queryOf(merged: Filters): string {
  const filters = filterParams(merged);
  const next = new URLSearchParams(filters);
  // A link with no filter at all looks like a bare visit and restores the remembered
  // filters, so clearing the last chip could never stick: say "start clean" instead.
  if (!filters.toString() && !merged.q && !merged.saved && merged.view === "list" && merged.page <= 1) next.set("fresh", "1");
  if (merged.project) next.set("project", merged.project);
  // The view is a display choice: carried on links, never remembered with the filters.
  if (merged.view !== "list") next.set("view", merged.view);
  // The Saved tab is a view, not a filter: carried on links, never remembered.
  if (merged.saved) next.set("saved", "1");
  if (merged.ids.length > 0 || merged.idsSet) next.set("ids", merged.ids.join(","));
  if (merged.page > 1) next.set("page", String(merged.page));
  const query = next.toString();
  return query ? `?${query}` : "";
}

/** Just the filters: what is remembered per project (EMB-05). */
function filterParams(merged: Filters, withKeyword = true): URLSearchParams {
  const next = new URLSearchParams();
  if (withKeyword && merged.q) next.set("q", merged.q);
  if (merged.skillsSet) next.set("skills", merged.skills.join(","));
  if (merged.citySet || merged.city) next.set("city", merged.city);
  if (merged.minScore > 0) next.set("min", String(merged.minScore));
  if (merged.laptop) next.set("laptop", merged.laptop);
  if (merged.plan) next.set("plan", merged.plan);
  for (const meta of RATING_META) {
    const value = merged.minRatings[meta.key];
    if (value > 0) next.set(`r_${meta.key}`, String(value));
  }
  const sortTokens = [...merged.sorts, collegeSortToken(merged.collegeSort)].filter(Boolean);
  if (sortTokens.length > 0) next.set("sort", sortTokens.join(","));
  for (const [key, value] of proQueryPairs(merged)) next.append(key, value);
  if (merged.dir === "asc") next.set("dir", "asc");
  if (merged.remote !== null) next.set("remote", merged.remote ? "1" : "0");
  if (!merged.skillPriority) next.set("sm", "0");
  if (merged.pageSize && merged.pageSize !== DEFAULT_PAGE_SIZE) next.set("pageSize", String(merged.pageSize));
  if (!merged.projectDefaults) next.set("pf", "0");
  return next;
}

/** Structured filters only: a typed keyword is a one-off search, never restored on a fresh visit. */
export function rememberQueryOf(filters: Filters): string {
  return filterParams(filters, false).toString();
}

/**
 * The compare page reads `ids` and `project`; the rest of the filters ride
 * along so "Back to candidates" can return to the same view.
 */
export function compareHref(filters: Filters): string {
  return `/employer/compare${queryOf({ ...filters, page: 1 })}`;
}

/**
 * The number on the Filters button: one for every removable chip in the
 * "Active filters" row (Findtern Score and the sub-score floors included), one
 * for each required-skill chip under the search box, and one for the city a
 * project brings. Sorting is not a filter. The filter sheet says so too. The
 * Shortlist view sets the filters aside, so it counts none.
 */
export function activeFilterCount(filters: Filters, effectiveSkills: string[], projectCity = ""): number {
  return filterCount({ chips: activeChips(filters).length, skills: effectiveSkills.length, projectCity: Boolean(projectCity), shortlistView: filters.saved });
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
  if (filters.remote !== null) {
    chips.push({ key: "remote", label: filters.remote ? "Remote candidates included" : "Remote candidates left out", href: drop({ remote: null }) });
  }
  if (filters.laptop === "yes") chips.push({ key: "laptop", label: "Has a laptop", href: drop({ laptop: "" }) });
  const band = BANDS.find((b) => b.id === filters.plan);
  if (band) chips.push({ key: "plan", label: `Band: ${PLAN_NAME[band.id]}`, href: drop({ plan: "" }) });
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
  // Pro chips: only a subscriber has these set (the loader empties them for everyone else).
  for (const chip of proChips(filters)) chips.push({ key: chip.key, label: chip.label, href: drop({ cgpaMin: chip.without.cgpaMin, cgpaVerified: chip.without.cgpaVerified, colleges: chip.without.colleges }) });
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
  /** The selected project's own city, when it applies: what the city field starts with (see `cityField`). */
  cityDefault: string;
  nameUnlocked: Set<string>;
  plans: (typeof schema.pricingPlans.$inferSelect)[];
  relations: Map<string, CandidateRelation>;
  /** Presence label per candidate on this page; null = no label shown. */
  presence: Record<string, PresenceLabel | null>;
  /** Interns who saved the selected project's role (it raises them in the ranking). */
  saved: Set<string>;
  /** Shortlisted for the selected project and still in the pool: the "Saved (N)" tab. */
  savedCount: number;
  /** Findtern Pro: who may use the CGPA and college filters, and what they did to this list. */
  pro: ProData;
  /** An empty list only (see `_relax.ts`): how many candidates each one-click widening would return. Null: not counted or it failed. */
  relaxCounts: RelaxCounts | null;
};

export type ProData = {
  /** An active subscription (lookup failed or none = false). */
  active: boolean;
  /** The link asked for a Pro filter or sort this employer may not use; it was dropped. */
  ignored: boolean;
  /** Subscriptions are on sale (admin switch). */
  offered: boolean;
  /** Price per period in the employer's currency (excluding GST, the GST, the total); null when not offered or unreadable. */
  charge: SubscriptionCharge | null;
  /** How long one purchase lasts, in days. */
  periodDays: number | null;
  /** Colleges in the pool (subscribers only). */
  colleges: CollegeOption[];
  /** Left out of a CGPA-filtered list for having no score. */
  hiddenNoScore: number;
  /** Results that rest on a percentage converted to CGPA. */
  approxKept: number;
};

