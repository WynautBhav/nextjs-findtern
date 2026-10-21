import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import {
  ArrowUpRight,
  Filter,
  Laptop,
  LayoutGrid,
  List,
  MapPin,
  Scale,
  Search,
  SlidersHorizontal,
  Table as TableIcon,
  X,
} from "lucide-react";

import { getDb, schema } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import {
  RATING_META,
  redactForEmployer,
  toCandidateProfile,
  type CandidateProfile,
  type Ratings,
} from "@/lib/employer-candidates";
import { hiredInternIds, hiredProposalSql } from "@/lib/employer-visibility";
import { attachPhotos, candidatePoolClauses, scoreExpr } from "@/lib/employer-pool";
import { requireEmployerSetup } from "@/lib/employer-setup";
import { employerRegion, resolvePricing, type Currency } from "@/lib/employer-pricing";
import { BANDS, PLAN_NAME, type BandId } from "@/lib/score";
import { CityFilter } from "@/components/employer/city-filter";
import { SkillFilter } from "@/components/employer/skill-filter";
import { CandidateCard } from "@/components/employer/candidate-card";
import { CandidateAvatar } from "@/components/employer/candidate-avatar";
import { PageHeader, EmptyState } from "@/components/layout/page-header";
import { cn } from "@/lib/utils";
import { MAX_SORT_FIELDS, compareBySortFields, parseSortFields } from "@/lib/candidate-sort";

export const metadata: Metadata = {
  title: "Candidates",
  robots: { index: false, follow: false },
};

type SortKey = "score" | keyof Ratings;

type Filters = {
  q: string;
  skills: string[];
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
   * Legacy "Include remote candidates": with a city filter (typed or from an
   * on-site project) remote-willing candidates from anywhere are included,
   * ranked after the city matches; the on-site project's onsite/hybrid-only
   * default is dropped too.
   */
  remote: boolean;
  /** Legacy "Maximum skill match": rank candidates with more of the chosen skills first. */
  skillPriority: boolean;
  view: "grid" | "list" | "table";
  pageSize: number;
  page: number;
  project?: string;
  /** False when the employer chose "show everyone" over the project's defaults. */
  projectDefaults: boolean;
  /** Candidates ticked for Compare. Carried on every link so paging keeps them. */
  ids: string[];
};

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "score", label: "Findtern Score" },
  ...RATING_META.map((meta) => ({ value: meta.key, label: meta.label })),
];

// Any whole-number floor 1-9, like the legacy 0-10 sliders.
const RATING_FLOORS = [
  { value: "", label: "Any" },
  ...Array.from({ length: 9 }, (_, i) => ({ value: String(i + 1), label: `${i + 1}+` })),
];
const SCORE_HINT: Record<number, string> = { 4: " Top 70%", 6: " Top 40%", 8: " Top 10%" };
const SCORE_FLOORS = [
  { value: "", label: "Any score" },
  ...Array.from({ length: 9 }, (_, i) => ({ value: String(i + 1), label: `${i + 1}.0+${SCORE_HINT[i + 1] ?? ""}` })),
];

type SearchParams = {
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
} & { [K in `r_${keyof Ratings}`]?: string | string[] };

export default async function CandidatesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await requireRole("employer");
  const uid = session.uid;
  await requireEmployerSetup(uid);
  const params = await searchParams;

  const filters = readFilters(params);
  const compareIds = filters.ids;

  let candidates: CandidateProfile[] = [];
  let total = 0;
  let pages = 1;
  let currency: Currency = "INR";
  let region: "IN" | null = null;
  let loadFailed = false;

  let projects: { id: string; projectName: string }[] = [];
  let shortlisted = new Set<string>();
  let activeProjectId: string | null = null;
  /** What the selected project filled in (row 61), for the note above the list. */
  let projectApplied: { name: string; skills: string[]; city: string; onsite: boolean } | null = null;
  let nameUnlocked = new Set<string>();
  let plans: (typeof schema.pricingPlans.$inferSelect)[] = [];
  /** This employer's latest open-or-hired proposal per candidate on the page. */
  const proposalFor = new Map<string, { id: string; status: string }>();
  // Hired by this employer: compare drops them (legacy employer-compare.tsx:
  // 550), so the toggle is not offered. A plain query, not `hiredInternIds`,
  // which reports everyone as hired under admin "View as".
  let hiredHere = new Set<string>();

  try {
    const db = getDb();

    // Names stay redacted until this employer hires the intern.
    try {
      nameUnlocked = await hiredInternIds(db, uid);
    } catch {
      nameUnlocked = new Set<string>();
    }
    try {
      const rows = await db
        .select({ internId: schema.proposals.internId })
        .from(schema.proposals)
        .where(and(eq(schema.proposals.employerId, uid), hiredProposalSql()));
      hiredHere = new Set(rows.map((r) => r.internId));
    } catch {
      hiredHere = new Set<string>();
    }

    // A shortlist is keyed on (project, candidate), so the page needs a project
    // to shortlist against. This mirrors the legacy page's project selector.
    const projectRows = await db
      .select({
        id: schema.projects.id,
        projectName: schema.projects.projectName,
        skills: schema.projects.skills,
        city: schema.projects.city,
        locationType: schema.projects.locationType,
      })
      .from(schema.projects)
      .where(eq(schema.projects.employerId, uid))
      .orderBy(asc(schema.projects.projectName));
    projects = projectRows.map((p) => ({ id: p.id, projectName: p.projectName }));
    activeProjectId =
      (one(params.project) && projects.find((p) => p.id === one(params.project))?.id) ||
      projects[0]?.id ||
      null;
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
      shortlisted = new Set(rows.map((r) => r.internId));
    }

    const [employer] = await db
      .select({
        country: schema.employers.country,
        countryCode: schema.employers.countryCode,
        phoneNumber: schema.employers.phoneNumber,
      })
      .from(schema.employers)
      .where(eq(schema.employers.id, uid))
      .limit(1);
    region = employerRegion(employer ?? {});
    currency = region === "IN" ? "INR" : "USD";

    // The pool rule (active, live, open to work, AI-interviewed) lives in
    // lib/employer-pool so the dashboard's "matches" list applies the same one.
    const clauses = candidatePoolClauses();

    if (filters.q) {
      // Keyword only - never a name. Employers browse a redacted pool, so the
      // query matches skills, bio and city. Matching on name would let anyone
      // probe whether a specific person is on the platform.
      const needle = `%${filters.q}%`;
      clauses.push(
        sql`(${schema.internOnboarding.skills}::text ILIKE ${needle} OR ${schema.internOnboarding.bio} ILIKE ${needle} OR ${schema.internOnboarding.city} ILIKE ${needle})`,
      );
    }

    // Row 61 / legacy dashboard:1528: the selected project fills in its own
    // skills and city when the employer has not typed any, and a non-remote
    // project leaves out remote-only candidates. "Show everyone" (pf=0)
    // switches that off; typed filters always win.
    const project = projectRows.find((p) => p.id === activeProjectId);
    let skillTerms = filters.skills;
    let cityText = filters.city;
    // Picking the Remote work mode means "remote candidates": a remote hire's
    // home city does not matter, so it behaves as "include remote" too.
    const includeRemote = filters.remote || filters.mode === "remote";
    if (project && filters.projectDefaults) {
      const projectSkills = (Array.isArray(project.skills) ? project.skills : []).filter(Boolean).slice(0, 7);
      const onsite = Boolean(project.locationType && project.locationType !== "remote");
      if (skillTerms.length === 0) skillTerms = projectSkills;
      if (!cityText && onsite && project.city) cityText = project.city;
      if (onsite && !filters.mode && !includeRemote) {
        clauses.push(
          sql`((${schema.internOnboarding.locationTypes})::text ILIKE '%onsite%' OR (${schema.internOnboarding.locationTypes})::text ILIKE '%hybrid%')`,
        );
      }
      if (skillTerms !== filters.skills || cityText !== filters.city || onsite) {
        projectApplied = {
          name: project.projectName,
          skills: skillTerms === filters.skills ? [] : skillTerms,
          city: cityText === filters.city ? "" : cityText,
          onsite: onsite && !filters.mode && !includeRemote,
        };
      }
    }

    // Any of the chosen skills (legacy rule): "React + Node" finds people with
    // either, and those with more of them rank first.
    if (skillTerms.length > 0) {
      clauses.push(
        sql`(${sql.join(
          skillTerms.map((skill) => sql`(${schema.internOnboarding.skills})::text ILIKE ${`%${skill}%`}`),
          sql` OR `,
        )})`,
      );
    }

    // The city they live in, or one they said they would work from. Several
    // cities (comma-separated) match any of them; candidates matching more
    // rank higher, as legacy did (dashboard:2639).
    const cityList = cityTerms(cityText);
    if (cityList.length > 0) {
      const inCity = cityList.map(
        (c) =>
          sql`(lower(${schema.internOnboarding.city}) LIKE ${`%${c}%`} OR lower((${schema.internOnboarding.preferredLocations})::text) LIKE ${`%${c}%`})`,
      );
      // "Include remote": anyone open to remote work qualifies wherever they
      // live; the city matches still rank first (cityMatches below).
      if (includeRemote) inCity.push(sql`(${schema.internOnboarding.locationTypes})::text ILIKE '%remote%'`);
      clauses.push(sql`(${sql.join(inCity, sql` OR `)})`);
    }

    if (filters.laptop === "yes") {
      clauses.push(eq(schema.internOnboarding.hasLaptop, true));
    } else if (filters.laptop === "no") {
      clauses.push(eq(schema.internOnboarding.hasLaptop, false));
    }

    if (filters.mode) {
      clauses.push(
        sql`(${schema.internOnboarding.locationTypes})::text ILIKE ${`%${filters.mode}%`}`,
      );
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

    // Bounded fetch: the ranking happens in memory, so the ceiling has to be
    // here rather than after the sort. Inner join: a candidate with no
    // onboarding row has no score, so the pool rule excludes them anyway.
    const rows = await db
      .select({ user: schema.users, onboarding: schema.internOnboarding })
      .from(schema.users)
      .innerJoin(
        schema.internOnboarding,
        eq(schema.internOnboarding.userId, schema.users.id),
      )
      .where(and(...clauses))
      // `users` has no created_at column. Ordering by the onboarding row's
      // updated_at, then by id so the order is total and pagination is stable.
      .orderBy(desc(schema.internOnboarding.updatedAt), desc(schema.users.id))
      .limit(500);

    // `intern_onboarding` has no unique index on `user_id`, and the legacy
    // server read only the newest row per intern - so a duplicate would render
    // the same person twice. The ORDER BY puts the newest row first, so
    // keeping the first sighting per id is that same rule.
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

    // The chosen axis first, then score, then initials - a stable order matters
    // when two candidates tie and pagination would otherwise reshuffle them.
    // (Initials, never the name: the pool is redacted until hire.)
    const cityMatches = (p: CandidateProfile) => {
      // One city only ranks when remote candidates are mixed in with it.
      if (cityList.length < (includeRemote ? 1 : 2)) return 0;
      const hay = [p.city, ...p.preferredLocations].join("|").toLowerCase();
      return cityList.filter((c) => hay.includes(c)).length;
    };
    const lowered = skillTerms.map((t) => t.toLowerCase());
    const skillMatches = (p: CandidateProfile) => {
      if (!filters.skillPriority || lowered.length < 2) return 0;
      const have = p.skills.map((x) => x.toLowerCase());
      return lowered.filter((t) => have.some((h) => h.includes(t))).length;
    };
    profiles.sort(
      (a, b) =>
        skillMatches(b) - skillMatches(a) ||
        cityMatches(b) - cityMatches(a) ||
        compareBySortFields(a, b, filters.sorts, filters.dir) ||
        b.score - a.score ||
        a.initials.localeCompare(b.initials) ||
        a.id.localeCompare(b.id),
    );

    total = profiles.length;
    pages = Math.max(1, Math.ceil(total / filters.pageSize));
    const start = (Math.min(filters.page, pages) - 1) * filters.pageSize;
    candidates = profiles.slice(start, start + filters.pageSize);
    await attachPhotos(db, candidates, nameUnlocked).catch(() => undefined);

    plans = await db.select().from(schema.pricingPlans).where(eq(schema.pricingPlans.isActive, true));
    if (candidates.length > 0) {
      const rows = await db
        .select({ id: schema.proposals.id, internId: schema.proposals.internId, status: schema.proposals.status })
        .from(schema.proposals)
        .where(
          and(
            eq(schema.proposals.employerId, uid),
            inArray(
              schema.proposals.internId,
              candidates.map((c) => c.id),
            ),
            inArray(schema.proposals.status, ["sent", "accepted", "processing", "interview_scheduled", "hired"]),
          ),
        )
        .orderBy(desc(schema.proposals.createdAt));
      for (const row of rows) {
        if (!proposalFor.has(row.internId)) proposalFor.set(row.internId, { id: row.id, status: row.status });
      }
    }
  } catch {
    // DB unavailable - the filter form still renders and the list shows its
    // empty state, which is what a missing DATABASE_URL should look like.
    loadFailed = true;
  }

  return (
    <div>
      <PageHeader
        title="Candidates"
        subtitle={`${total === 0 ? "No" : total} intern${total === 1 ? "" : "s"} in the pool, ranked by Findtern Score.`}
      />

      <form method="get" className="mb-6 rounded-[20px] border border-ink-200/70 bg-white/90 p-5 shadow-[0_1px_2px_rgb(7_47_36/0.04),0_8px_24px_rgb(7_47_36/0.06)] backdrop-blur-sm">
        {compareIds.length > 0 ? <input type="hidden" name="ids" value={compareIds.join(",")} /> : null}
        {filters.view !== "grid" ? <input type="hidden" name="view" value={filters.view} /> : null}
        {!filters.projectDefaults ? <input type="hidden" name="pf" value="0" /> : null}
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-[minmax(0,1.2fr)_9.5rem_8rem_7.5rem_7.5rem_minmax(12rem,1fr)_auto]">
          <TextQuery
            defaultValue={filters.q}
            label="Keyword"
            placeholder="Skill, bio, or city…"
          />
          <CityFilter key={filters.city} defaultValue={filters.city} />
          <SelectQuery
            name="mode"
            label="Work mode"
            defaultValue={filters.mode}
            options={[
              { value: "", label: "Any mode" },
              { value: "remote", label: "Remote" },
              { value: "hybrid", label: "Hybrid" },
              { value: "onsite", label: "On-site" },
            ]}
          />
          <SelectQuery
            name="min"
            label="Min score"
            defaultValue={filters.minScore > 0 ? String(filters.minScore) : ""}
            options={SCORE_FLOORS}
          />
          <SelectQuery
            name="laptop"
            label="Laptop"
            defaultValue={filters.laptop}
            options={[
              { value: "", label: "Any" },
              { value: "yes", label: "Has laptop" },
              { value: "no", label: "No laptop" },
            ]}
          />
          {projects.length > 0 ? (
            <SelectQuery
              name="project"
              label="Hiring project"
              defaultValue={activeProjectId ?? ""}
              options={[
                { value: "", label: "Default Project" },
                ...projects.map((p) => ({ value: p.id, label: p.projectName })),
              ]}
            />
          ) : (
            <div className="min-w-0" />
          )}
          <div className="flex min-w-0 items-end gap-2">
            <button
              type="submit"
              className="apple-spring apple-pressable inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] bg-brand-700 px-5 text-sm font-semibold text-white shadow-xs hover:bg-brand-600"
            >
              <Search className="size-4" aria-hidden />
              Filter
            </button>
            <ActiveFilters filters={filters} />
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2">
          <label className="inline-flex min-h-11 cursor-pointer items-center gap-2.5 text-sm text-ink-700">
            <input
              type="checkbox"
              name="remote"
              value="1"
              defaultChecked={filters.remote}
              className="size-4 rounded border-ink-300 accent-brand-700"
            />
            <span>
              <span className="font-medium text-ink-900">Include remote candidates</span>
              <span className="block text-xs text-text-subtle">
                With a city or an on-site project, also show interns open to remote work from anywhere.
              </span>
            </span>
          </label>
          <label className="inline-flex min-h-11 cursor-pointer items-center gap-2.5 text-sm text-ink-700">
            {/* Unchecked boxes send nothing, so a hidden 0 marks "off"; a checked box adds sm=1 after it. */}
            <input type="hidden" name="sm" value="0" />
            <input
              type="checkbox"
              name="sm"
              value="1"
              defaultChecked={filters.skillPriority}
              className="size-4 rounded border-ink-300 accent-brand-700"
            />
            <span>
              <span className="font-medium text-ink-900">Maximum skill match first</span>
              <span className="block text-xs text-text-subtle">Rank interns with more of the chosen skills higher.</span>
            </span>
          </label>
        </div>

        <details
          className="group mt-4 border-t border-ink-100 pt-4"
          open={hasAdvancedFilters(filters) || undefined}
        >
          <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-2 text-sm font-semibold text-ink-700 hover:text-brand-700">
            <SlidersHorizontal className="size-4" aria-hidden />
            More filters
            <span className="text-xs font-normal text-text-subtle">Plan, AI interview ratings, multi-field sort</span>
          </summary>
          <div className="mt-3 grid gap-4 sm:grid-cols-2 md:grid-cols-4 xl:grid-cols-5">
            <SelectQuery
              name="plan"
              label="Plan"
              defaultValue={filters.plan}
              options={[
                { value: "", label: "Any plan" },
                ...BANDS.map((band) => ({
                  value: band.id,
                  label: `${PLAN_NAME[band.id]} (${band.min}-${band.max})`,
                })),
              ]}
            />
            {RATING_META.map((meta) => (
              <SelectQuery
                key={meta.key}
                name={`r_${meta.key}`}
                label={`Min ${meta.label.toLowerCase()}`}
                defaultValue={filters.minRatings[meta.key] > 0 ? String(filters.minRatings[meta.key]) : ""}
                options={RATING_FLOORS}
              />
            ))}
            {Array.from({ length: MAX_SORT_FIELDS }, (_, i) => (
              <SelectQuery
                key={i}
                name="sort"
                id={`filter-sort-${i}`}
                label={i === 0 ? "Sort by" : "Then by"}
                defaultValue={filters.sorts[i] ?? ""}
                options={[
                  { value: "", label: i === 0 ? "Findtern Score" : "None" },
                  ...SORT_OPTIONS.filter((o) => i > 0 || o.value !== "score"),
                ]}
              />
            ))}
            <SelectQuery
              name="dir"
              label="Order"
              defaultValue={filters.dir === "asc" ? "asc" : ""}
              options={[
                { value: "", label: "Highest first" },
                { value: "asc", label: "Lowest first" },
              ]}
            />
          </div>
        </details>

        <SkillFilter active={filters.skills} />
      </form>

      {projectApplied ? (
        <p className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[14px] border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-ink-700">
          <span>
            Matched to <span className="font-semibold text-ink-900">{projectApplied.name}</span>
            {projectApplied.skills.length > 0 ? `: any of ${projectApplied.skills.join(", ")}` : ""}
            {projectApplied.city ? `, in or open to ${projectApplied.city}` : ""}
            {projectApplied.onsite ? ", available on-site or hybrid" : ""}. Best matches first.
          </span>
          <Link
            href={withFilters(filters, { projectDefaults: false, page: "" })}
            className="font-medium text-brand-700 underline-offset-4 hover:underline"
          >
            Show everyone
          </Link>
        </p>
      ) : !filters.projectDefaults && activeProjectId ? (
        <p className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[14px] border border-ink-200 bg-white px-4 py-3 text-sm text-ink-700">
          Showing the whole pool.
          <Link
            href={withFilters(filters, { projectDefaults: true, page: "" })}
            className="font-medium text-brand-700 underline-offset-4 hover:underline"
          >
            Match to the selected project
          </Link>
        </p>
      ) : null}

      {compareIds.length >= 1 ? (
        <div className="fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3.5 rounded-full border border-brand-200/80 bg-white/95 px-5 py-2.5 shadow-2xl backdrop-blur-md">
          <div className="flex items-center gap-2">
            <span className="relative flex size-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-400 opacity-75" />
              <span className="relative inline-flex size-2.5 rounded-full bg-brand-600" />
            </span>
            <span className="text-xs font-semibold text-ink-900">
              {compareIds.length === 1
                ? "1 selected - pick one more to compare"
                : `${compareIds.length} candidates selected`}
            </span>
          </div>
          <div className="h-4 w-px bg-ink-200" />
          <Link
            href={withFilters(filters, { ids: [] })}
            scroll={false}
            className="apple-spring text-[13px] font-medium text-ink-600 underline-offset-4 hover:text-ink-900 hover:underline"
          >
            Clear
          </Link>
          {compareIds.length >= 2 ? (
            <Link
              href={compareHref(filters)}
              className="apple-spring apple-pressable inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full bg-brand-700 px-4 text-[13px] font-semibold text-white shadow-xs hover:bg-brand-600"
            >
              <Scale className="size-3.5" aria-hidden />
              Compare Side-by-Side
            </Link>
          ) : null}
        </div>
      ) : null}

      {candidates.length === 0 ? (
        <EmptyState
          title={loadFailed ? "Could not load the candidate pool" : "No candidates match"}
          body={
            loadFailed
              ? "We couldn't load candidates right now. Nothing is wrong with your filters - try again in a moment."
              : "Widen the score floor, drop a skill, or clear the city. New interns appear as soon as they finish onboarding."
          }
          action={{ label: "Clear all filters", href: "/employer/candidates" }}
          who={loadFailed ? "Us - connection issue" : "You - adjust the filters"}
        />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 pb-3">
            <p className="flex items-center gap-1.5 text-xs tabular-nums text-text-subtle">
              <Filter className="size-3.5" aria-hidden />
              Showing {(Math.min(filters.page, pages) - 1) * filters.pageSize + 1}–
              {(Math.min(filters.page, pages) - 1) * filters.pageSize + candidates.length} of {total}.
            </p>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1 text-xs text-text-subtle">
                <span>Per page:</span>
                {[12, 24, 48].map((size) => (
                  <Link
                    key={size}
                    href={withFilters(filters, { pageSize: size, page: 1 })}
                    className={cn(
                      "apple-spring inline-flex min-h-11 min-w-11 items-center justify-center rounded-md px-2 text-xs font-medium",
                      filters.pageSize === size
                        ? "bg-brand-50 text-brand-700 font-semibold ring-1 ring-brand-600/20"
                        : "text-ink-600 hover:bg-ink-100",
                    )}
                  >
                    {size}
                  </Link>
                ))}
              </div>

              <div className="flex items-center rounded-lg border border-ink-200/80 bg-white p-0.5">
                <Link
                  href={withFilters(filters, { view: "grid" })}
                  className={cn(
                    "apple-spring inline-flex size-11 items-center justify-center rounded-md",
                    filters.view === "grid"
                      ? "bg-brand-50 text-brand-700 font-semibold"
                      : "text-ink-600 hover:text-ink-900",
                  )}
                  title="Grid view"
                >
                  <LayoutGrid className="size-3.5" />
                </Link>
                <Link
                  href={withFilters(filters, { view: "list" })}
                  className={cn(
                    "apple-spring inline-flex size-11 items-center justify-center rounded-md",
                    filters.view === "list"
                      ? "bg-brand-50 text-brand-700 font-semibold"
                      : "text-ink-600 hover:text-ink-900",
                  )}
                  title="List view"
                >
                  <List className="size-3.5" />
                </Link>
                <Link
                  href={withFilters(filters, { view: "table" })}
                  className={cn(
                    "apple-spring inline-flex size-11 items-center justify-center rounded-md",
                    filters.view === "table"
                      ? "bg-brand-50 text-brand-700 font-semibold"
                      : "text-ink-600 hover:text-ink-900",
                  )}
                  title="Table view"
                >
                  <TableIcon className="size-3.5" />
                </Link>
              </div>
            </div>
          </div>

          {filters.view === "table" ? (
            <div className="overflow-x-auto rounded-[20px] border border-ink-200/70 bg-white shadow-sm">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-ink-100 bg-ink-50/70 font-semibold text-ink-700">
                  <tr>
                    <th className="px-5 py-3">Candidate</th>
                    <th className="px-5 py-3">Findtern Score</th>
                    <th className="px-5 py-3">Location & Mode</th>
                    <th className="px-5 py-3">Hardware</th>
                    <th className="px-5 py-3">Skills</th>
                    <th className="px-5 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {candidates.map((c) => {
                    const isSelected = compareIds.includes(c.id);
                    return (
                      <tr key={c.id} className="apple-spring hover:bg-ink-50/50">
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-3">
                            <CandidateAvatar
                              photoUrl={c.photoUrl}
                              initials={c.initials}
                              className="size-9 rounded-xl text-xs ring-1 ring-brand-600/20"
                            />
                            <div>
                              <Link
                                href={`/employer/intern/${c.id}`}
                                className="font-semibold text-ink-900 hover:text-brand-700 hover:underline"
                              >
                                {c.initials} {nameUnlocked.has(c.id) ? `(${c.fullName})` : ""}
                              </Link>
                              <span className="block text-2xs text-text-subtle font-normal">
                                {c.academics?.institution || "Verified Candidate"}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-3.5">
                          {c.score > 0 ? (
                            <span className="inline-flex items-baseline gap-0.5 font-bold tabular-nums text-brand-800">
                              <span className="text-sm">{c.score.toFixed(1)}</span>
                              <span className="text-2xs text-ink-600">/10</span>
                            </span>
                          ) : (
                            <span className="text-2xs text-ink-600">Unscored</span>
                          )}
                        </td>
                        <td className="px-5 py-3.5">
                          <span className="font-medium text-ink-800">{c.location || "Remote"}</span>
                          <span className="block text-2xs text-text-subtle capitalize">
                            {c.workModes?.join(", ") || "Flexible"}
                          </span>
                        </td>
                        <td className="px-5 py-3.5">
                          {c.hasLaptop === true ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-2xs font-semibold text-emerald-700 ring-1 ring-emerald-600/20">
                              <Laptop className="size-3" /> Laptop Ready
                            </span>
                          ) : c.hasLaptop === false ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-ink-100 px-2 py-0.5 text-2xs font-medium text-ink-600">
                              Needs Hardware
                            </span>
                          ) : (
                            <span className="text-2xs text-ink-600">-</span>
                          )}
                        </td>
                        <td className="px-5 py-3.5 min-w-[220px] max-w-[320px]">
                          {/* Every skill (at most seven), never "+N". */}
                          <div className="flex flex-wrap gap-1">
                            {c.skills.map((s) => (
                              <span key={s} className="rounded-md bg-ink-100 px-1.5 py-0.5 text-2xs font-medium text-ink-700">
                                {s}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {hiredHere.has(c.id) ? null : (
                            <Link
                              href={withFilters(filters, { ids: toggle(compareIds, c.id) })}
                              scroll={false}
                              // A link, so no aria-pressed: the label carries the state.
                              aria-label={isSelected ? "Remove from compare" : "Add to compare"}
                              className={cn(
                                "apple-spring inline-flex size-8 items-center justify-center rounded-lg border text-xs",
                                isSelected
                                  ? "border-brand-600 bg-brand-50 text-brand-700"
                                  : "border-ink-200 text-ink-600 hover:border-ink-300 hover:bg-ink-50",
                              )}
                              title="Compare"
                            >
                              <Scale className="size-3.5" />
                            </Link>
                            )}
                            <Link
                              href={`/employer/intern/${c.id}`}
                              className="apple-spring inline-flex min-h-8 items-center gap-1 rounded-lg bg-brand-700 px-2.5 text-xs font-semibold text-white shadow-xs hover:bg-brand-600"
                            >
                              <span>Profile</span>
                              <ArrowUpRight className="size-3" />
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <ul
              className={cn(
                "grid gap-3",
                filters.view === "list" ? "grid-cols-1" : "lg:grid-cols-2",
              )}
            >
              {candidates.map((candidate) => (
                <CandidateCard
                  key={candidate.id}
                  // The AI interview recording stays hidden until hire; only the
                  // written report is shown before (legacy detail:1578).
                  candidate={redactForEmployer(candidate, nameUnlocked.has(candidate.id))}
                  currency={currency}
                  region={region}
                  selected={compareIds.includes(candidate.id)}
                  compareHref={withFilters(filters, { ids: toggle(compareIds, candidate.id) })}
                  comparable={!hiredHere.has(candidate.id)}
                  projectId={activeProjectId}
                  shortlisted={shortlisted.has(candidate.id)}
                  nameUnlocked={nameUnlocked.has(candidate.id)}
                  pricing={resolvePricing(candidate.score, plans, currency, region)}
                  proposal={proposalFor.get(candidate.id) ?? null}
                />
              ))}
            </ul>
          )}

          {pages > 1 ? (
            <nav aria-label="Pagination" className="mt-6 flex items-center justify-center gap-2">
              {Array.from({ length: pages }, (_, i) => i + 1)
                .filter((page) => page === 1 || page === pages || Math.abs(page - filters.page) <= 1)
                .map((page, i, visible) => (
                  <span key={page} className="flex items-center gap-2">
                    {i > 0 && visible[i - 1] !== page - 1 ? (
                      <span className="px-1 text-ink-300">…</span>
                    ) : null}
                    <Link
                      href={withFilters(filters, { page: page === 1 ? "" : page })}
                      aria-current={page === filters.page ? "page" : undefined}
                      className={[
                        "apple-spring apple-pressable inline-flex min-h-11 min-w-11 items-center justify-center rounded-[10px] text-sm font-medium tabular-nums",
                        page === filters.page
                          ? "bg-brand-700 text-white"
                          : "border border-ink-200 bg-white text-ink-700 hover:bg-ink-50",
                      ].join(" ")}
                    >
                      {page}
                    </Link>
                  </span>
                ))}
            </nav>
          ) : null}
        </>
      )}

    </div>
  );
}

/* ── Filters ─────────────────────────────────────────────────────────────── */

function readFilters(params: SearchParams): Filters {
  const min = Number(one(params.min) ?? "0");
  const page = Number(one(params.page) ?? "1");
  const ps = Number(one(params.pageSize) ?? "24");
  const pageSize = ps === 12 || ps === 48 ? ps : 24;
  const viewRaw = (one(params.view) ?? "").trim().toLowerCase();
  const view: "grid" | "list" | "table" =
    viewRaw === "list" || viewRaw === "table" ? viewRaw : "grid";
  const planRaw = (one(params.plan) ?? "").trim();
  const floor = (raw: string | string[] | undefined) => {
    const n = Number(one(raw) ?? "0");
    return Number.isFinite(n) && n > 0 ? Math.min(10, n) : 0;
  };

  return {
    q: (one(params.q) ?? "").trim().slice(0, 60),
    skills: (one(params.skills) ?? "")
      .split(",")
      .map((skill) => skill.trim())
      .filter(Boolean)
      .slice(0, 7),
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
    remote: ["1", "true", "on"].includes(one(params.remote) ?? ""),
    // Absent = on (the default); the form sends sm=0, plus sm=1 when ticked.
    skillPriority: params.sm === undefined || (Array.isArray(params.sm) ? params.sm : [params.sm]).includes("1"),
    view,
    pageSize,
    page: Number.isFinite(page) && page > 0 ? Math.floor(page) : 1,
    project: (one(params.project) ?? "").trim(),
    projectDefaults: one(params.pf) !== "0",
    ids: Array.from(
      new Set(
        (Array.isArray(params.ids) ? params.ids.join(",") : (params.ids ?? ""))
          .split(",")
          .map((id) => id.trim())
          .filter(Boolean),
      ),
    ).slice(0, 4),
  };
}

function hasAdvancedFilters(filters: Filters): boolean {
  return (
    Boolean(filters.plan) ||
    filters.sorts.length > 0 ||
    filters.dir === "asc" ||
    RATING_META.some((meta) => filters.minRatings[meta.key] > 0)
  );
}

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Tick or untick a candidate for Compare. Four columns is the compare page's limit. */
function toggle(list: string[], value: string): string[] {
  const hit = list.some((entry) => entry.toLowerCase() === value.toLowerCase());
  if (hit) return list.filter((entry) => entry.toLowerCase() !== value.toLowerCase());
  return [...list, value].slice(-4);
}

/**
 * Rebuild the query string from a filter change.
 *
 * Takes the *current* filters as the base rather than reading module state:
 * a skill chip has to keep the city and the score floor, and a builder that
 * only saw the patch would silently drop them. A `""` or `0` value removes
 * that filter - otherwise there would be no way to clear one from a chip link.
 */
function withFilters(
  base: Filters,
  patch: Partial<Omit<Filters, "page">> & { page?: number | "" } = {},
): string {
  const page = patch.page === "" ? 1 : (patch.page ?? base.page);
  const merged: Filters = { ...base, ...patch, page };
  return `/employer/candidates${queryOf(merged)}`;
}

/**
 * The query string for a set of filters. The compare selection used to be
 * passed in as a patch key this builder never wrote back out, so every
 * Compare link dropped it and ticking a candidate did nothing.
 */
function queryOf(merged: Filters): string {
  const next = new URLSearchParams();

  if (merged.q) next.set("q", merged.q);
  if (merged.skills.length > 0) next.set("skills", merged.skills.join(","));
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
  if (merged.remote) next.set("remote", "1");
  if (!merged.skillPriority) next.set("sm", "0");
  if (merged.view && merged.view !== "grid") next.set("view", merged.view);
  if (merged.pageSize && merged.pageSize !== 24) next.set("pageSize", String(merged.pageSize));
  if (merged.project) next.set("project", merged.project);
  if (!merged.projectDefaults) next.set("pf", "0");
  if (merged.ids.length > 0) next.set("ids", merged.ids.join(","));
  if (merged.page > 1) next.set("page", String(merged.page));

  const query = next.toString();
  return query ? `?${query}` : "";
}

/**
 * The compare page reads `ids` and `project`; the rest of the filters ride
 * along so "Back to candidates" can return to the same view.
 */
function compareHref(filters: Filters): string {
  return `/employer/compare${queryOf({ ...filters, page: 1 })}`;
}

function ActiveFilters({ filters }: { filters: Filters }) {
  const active =
    filters.q ||
    filters.city ||
    filters.mode ||
    filters.minScore > 0 ||
    filters.skills.length > 0 ||
    filters.laptop ||
    filters.remote ||
    !filters.skillPriority ||
    hasAdvancedFilters(filters);
  if (!active) return null;
  return (
    <Link
      href="/employer/candidates"
      className="apple-spring apple-pressable inline-flex min-h-11 items-center justify-center gap-1.5 rounded-[10px] border border-ink-200 bg-white px-3.5 text-sm font-medium text-ink-700 hover:bg-ink-50"
    >
      <X className="size-4" aria-hidden />
      Clear
    </Link>
  );
}

function TextQuery({
  name = "q",
  label,
  defaultValue,
  placeholder,
}: {
  name?: string;
  label?: string;
  defaultValue: string;
  placeholder?: string;
}) {
  const isSearch = name === "q";
  return (
    <div className="min-w-0">
      <label htmlFor={`filter-${name}`} className="block text-xs font-semibold text-ink-700">
        {label ?? "Keyword"}
      </label>
      <div className="relative mt-2">
        <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-ink-600">
          {isSearch ? (
            <Search className="size-4" aria-hidden />
          ) : (
            <MapPin className="size-4" aria-hidden />
          )}
        </span>
        <input
          id={`filter-${name}`}
          name={name}
          type={isSearch ? "search" : "text"}
          defaultValue={defaultValue}
          placeholder={placeholder}
          className="apple-spring min-h-11 w-full rounded-[10px] border border-ink-200/90 bg-white/90 pl-10 pr-3.5 text-[14px] text-ink-900 shadow-2xs outline-none placeholder:text-ink-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
        />
      </div>
    </div>
  );
}

function SelectQuery({
  name,
  id = `filter-${name}`,
  label,
  defaultValue,
  options,
}: {
  name: string;
  id?: string;
  label: string;
  defaultValue: string;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="block text-xs font-semibold text-ink-700">
        {label}
      </label>
      <div className="relative mt-2">
        <select
          id={id}
          name={name}
          defaultValue={defaultValue}
          className="apple-spring min-h-11 w-full appearance-none rounded-[10px] border border-ink-200/90 bg-white/90 px-3.5 pr-8 text-[14px] text-ink-900 shadow-2xs outline-none placeholder:text-ink-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-ink-600">
          <SlidersHorizontal className="size-3.5" aria-hidden />
        </div>
      </div>
    </div>
  );
}

/** Up to five lower-cased city terms from the comma-separated filter. */
function cityTerms(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(",")
        .map((c) => c.trim().toLowerCase())
        .filter(Boolean),
    ),
  ).slice(0, 5);
}
