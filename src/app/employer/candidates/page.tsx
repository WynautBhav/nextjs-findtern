import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { and, desc, eq, sql } from "drizzle-orm";
import {
  ArrowUpDown,
  ChevronDown,
  Laptop,
  LayoutGrid,
  List,
  MapPin,
  Plus,
  RotateCcw,
  Scale,
  Search,
  Star,
  Wallet,
} from "lucide-react";

import { getDb, schema } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import {
  RATING_META,
  displayNameOf,
  redactForEmployer,
  toCandidateProfile,
  type CandidateProfile,
  type Ratings,
} from "@/lib/employer-candidates";
import { candidateRelations, hiredInternIds, type CandidateRelation } from "@/lib/employer-visibility";
import { attachPhotos, candidatePoolClauses, scoreExpr } from "@/lib/employer-pool";
import { requireEmployerSetup } from "@/lib/employer-setup";
import { employerRegion, resolvePricing, type Currency } from "@/lib/employer-pricing";
import { BANDS, PLAN_NAME, bandFor, type BandId } from "@/lib/score";
import { formatRate } from "@/lib/format";
import { timezoneForLocation } from "@/lib/timezones";
import { CityFilter } from "@/components/employer/city-filter";
import { SkillFilter } from "@/components/employer/skill-filter";
import { CandidateCard, type FullTimeContext } from "@/components/employer/candidate-card";
import { FilterForm, RatingSlider } from "@/components/employer/candidate-filters";
import { CandidateAvatar } from "@/components/employer/candidate-avatar";
import { candidateStatusPill, proposalActionLabel } from "@/components/employer/candidate-status";
import { ShortlistToggle } from "@/components/employer/shortlist-toggle";
import { EmptyScene, PageHead, Pill, Surface } from "@/components/app/primitives";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { compareBySortFields, parseSortFields } from "@/lib/candidate-sort";
import { MAX_COMPARE, isOpenProject, parseIds, rememberedFilters, rememberedSelection } from "@/lib/employer-selection";
import { RememberSelection } from "@/components/employer/remember-selection";

/** Candidate · skills · score · AI interview · actions. */
const CANDIDATE_GRID =
  "grid-cols-[minmax(0,1fr)_auto] lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_6.5rem_10rem] 2xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_6.5rem_5.5rem_10rem]";

export const metadata: Metadata = {
  title: "Candidates",
  robots: { index: false, follow: false },
};

type SortKey = "score" | keyof Ratings;

type Filters = {
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
  /** "table" is the dense ranked rows (the default); "grid" the cards. */
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

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "score", label: "Findtern Score" },
  ...RATING_META.map((meta) => ({ value: meta.key, label: meta.label })),
];

const SELECT =
  "apple-spring mt-2 min-h-11 w-full rounded-apple-sm border border-ink-200/90 bg-white px-3 text-sm text-ink-900 shadow-xs outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20";

/** Query keys that are filters; anything else (project, ids, fresh) is not. */
const FILTER_KEYS = [
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
  /** "Reset": start clean instead of restoring the remembered filters. */
  fresh?: string | string[];
  /** Legacy deep link that opened the full-time offer for a hire (EMH-42). */
  ftInternId?: string | string[];
} & { [K in `r_${keyof Ratings}`]?: string | string[] };

/** A safety ceiling, not a page size: the pool is ranked in memory (EMB-06). */
const POOL_CEILING = 5000;

export default async function CandidatesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await requireRole("employer");
  const uid = session.uid;
  await requireEmployerSetup(uid);
  const params = await searchParams;

  // Legacy `?ftInternId=` opened the full-time offer for a hire: the offer
  // lives on the candidate's profile now.
  const ftIntern = one(params.ftInternId);
  if (ftIntern) redirect(`/employer/intern/${encodeURIComponent(ftIntern)}`);

  const filters = readFilters(params);
  // The project and compare picks carry over from the last visit (cookie)
  // unless the URL names them.
  const remembered = await rememberedSelection(uid);
  if (!filters.idsSet) filters.ids = remembered.compare;
  if (!filters.project && remembered.project) filters.project = remembered.project;
  const compareIds = filters.ids;
  const hasFilterParams = FILTER_KEYS.some((key) => params[key as keyof SearchParams] !== undefined);

  let candidates: CandidateProfile[] = [];
  let total = 0;
  let pages = 1;
  let currency: Currency = "INR";
  let region: "IN" | null = null;
  let loadFailed = false;
  /** Set when this visit should restore the project's saved filters (EMB-05). */
  let restoreTo: string | null = null;

  let projects: { id: string; projectName: string }[] = [];
  let shortlisted = new Set<string>();
  let activeProjectId: string | null = null;
  let activeProjectSkills: string[] = [];
  /** The skills the list is filtered by: the employer's, or the project's. */
  let effectiveSkills: string[] = filters.skills;
  /** What the selected project filled in (row 61), for the note above the list. */
  let projectApplied: { name: string; skills: string[]; city: string } | null = null;
  let includeRemote = false;
  let cityList: string[] = [];
  let nameUnlocked = new Set<string>();
  let plans: (typeof schema.pricingPlans.$inferSelect)[] = [];
  let relations = new Map<string, CandidateRelation>();
  let fullTime: FullTimeContext | null = null;

  try {
    const db = getDb();

    // Names stay redacted until this employer hires the intern.
    nameUnlocked = await hiredInternIds(db, uid);

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
          locationType: schema.projects.locationType,
          status: schema.projects.status,
        })
        .from(schema.projects)
        .where(eq(schema.projects.employerId, uid))
        .orderBy(desc(schema.projects.createdAt))
    ).filter((p) => isOpenProject(p.status));
    projects = projectRows.map((p) => ({ id: p.id, projectName: p.projectName }));
    activeProjectId = (filters.project && projects.find((p) => p.id === filters.project)?.id) || projects[0]?.id || null;
    // A remembered project that was since closed or deleted is not carried on links.
    if (filters.project !== activeProjectId) filters.project = activeProjectId ?? "";

    // A bare visit (sidebar, "Back to candidates", a new project picked)
    // restores what this employer last applied on the project.
    if (!hasFilterParams && one(params.fresh) !== "1" && activeProjectId) {
      const saved = await rememberedFilters(uid, activeProjectId);
      if (saved) {
        const next = new URLSearchParams(saved);
        next.set("project", activeProjectId);
        if (compareIds.length > 0) next.set("ids", compareIds.join(","));
        restoreTo = `/employer/candidates?${next.toString()}`;
      }
    }

    if (!restoreTo) {
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
          state: schema.employers.state,
          countryCode: schema.employers.countryCode,
          phoneNumber: schema.employers.phoneNumber,
          fteStatus: schema.employers.internationalFteStatus,
        })
        .from(schema.employers)
        .where(eq(schema.employers.id, uid))
        .limit(1);
      region = employerRegion(employer ?? {});
      currency = region === "IN" ? "INR" : "USD";
      fullTime = { employerId: uid, fteStatus: employer?.fteStatus ?? "none", timezone: timezoneForLocation(employer ?? {}) };

      // The pool rule (active, live, open to work, AI-interviewed, approved)
      // lives in lib/employer-pool so the dashboard applies the same one.
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
      // skills and city when the employer has not typed any. "Show everyone"
      // (pf=0) switches that off; typed filters always win.
      const project = projectRows.find((p) => p.id === activeProjectId);
      const projectRemote = !project?.locationType || project.locationType === "remote";
      activeProjectSkills = (Array.isArray(project?.skills) ? project.skills : []).filter(Boolean).slice(0, 7);
      let skillTerms = filters.skills;
      effectiveSkills = filters.skills;
      let cityText = filters.city;
      if (project && filters.projectDefaults) {
        if (!filters.skillsSet) skillTerms = activeProjectSkills;
        effectiveSkills = skillTerms;
        if (!cityText && !projectRemote && project.city) cityText = project.city;
        if (skillTerms !== filters.skills || cityText !== filters.city) {
          projectApplied = {
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
      includeRemote =
        filters.remote ?? (projectRemote || !filters.projectDefaults || filters.mode === "remote");
      if (filters.mode === "remote") includeRemote = true;
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
      // home city does not count, and "Include remote" never waives it.
      cityList = cityTerms(cityText);
      if (cityList.length > 0) {
        const preferred = schema.internOnboarding.preferredLocations;
        clauses.push(
          sql`EXISTS (SELECT 1 FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(${preferred}) = 'array' THEN ${preferred} ELSE '[]'::jsonb END) AS p(v)
            WHERE lower(btrim(split_part(v, ',', 1))) IN (${sql.join(
              cityList.map((c) => sql`${c}`),
              sql`, `,
            )}))`,
        );
      }

      if (filters.laptop === "yes") {
        clauses.push(eq(schema.internOnboarding.hasLaptop, true));
      } else if (filters.laptop === "no") {
        clauses.push(eq(schema.internOnboarding.hasLaptop, false));
      }

      if (filters.mode) {
        clauses.push(sql`(${schema.internOnboarding.locationTypes})::text ILIKE ${`%${filters.mode}%`}`);
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

      // `intern_onboarding` has no unique index on `user_id`: one card per intern.
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

      const cityMatches = (p: CandidateProfile) => {
        if (cityList.length < 2) return 0;
        const prefs = new Set(p.preferredLocations.map((l) => l.split(",")[0].trim().toLowerCase()));
        return cityList.filter((c) => prefs.has(c)).length;
      };
      const lowered = skillTerms.map((t) => t.trim().toLowerCase());
      const skillMatches = (p: CandidateProfile) => {
        if (!filters.skillPriority || lowered.length < 2) return 0;
        // `readSkills` appends " · level" to object skills; match the name.
        const have = new Set(p.skills.map((x) => x.split(" · ")[0].trim().toLowerCase()));
        return lowered.filter((t) => have.has(t)).length;
      };
      // A sort the employer picked leads; skill and city matches then break
      // ties (bug sheet 21 Oct). Initials, never the name: the pool is redacted.
      const chosen = filters.sorts.length > 0;
      profiles.sort(
        (a, b) =>
          (chosen ? compareBySortFields(a, b, filters.sorts, filters.dir) : 0) ||
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
      await attachPhotos(db, candidates, nameUnlocked);

      plans = await db.select().from(schema.pricingPlans).where(eq(schema.pricingPlans.isActive, true));
      relations = await candidateRelations(
        db,
        uid,
        candidates.map((c) => c.id),
      );
    }
  } catch (err) {
    console.error("[employer/candidates] load failed", err);
    loadFailed = true;
  }

  if (restoreTo) redirect(restoreTo);

  const filterQuery = rememberQueryOf(filters);
  const firstShown = (Math.min(filters.page, pages) - 1) * filters.pageSize + 1;
  const compareFull = compareIds.length >= MAX_COMPARE;
  const compareLink = (id: string) =>
    compareIds.includes(id) || !compareFull ? withFilters(filters, { ids: toggle(compareIds, id) }) : null;

  return (
    <div>
      <PageHead
        title="Candidates"
        lede={
          loadFailed
            ? "Ranked by Findtern Score."
            : `${total === 0 ? "No" : total} intern${total === 1 ? "" : "s"} match, ranked by Findtern Score.`
        }
      />

      <div className="lg:grid lg:grid-cols-[17.5rem_minmax(0,1fr)] lg:items-start lg:gap-8">
        {/* ── Filter rail (legacy employer dashboard layout) ─────────── */}
        <aside className="mb-6 lg:sticky lg:top-20 lg:mb-0 lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto lg:pb-2">
          <FilterForm key={queryOf(filters)} activeCount={activeFilterCount(filters)}>
            {compareIds.length > 0 ? <input type="hidden" name="ids" value={compareIds.join(",")} /> : null}
            {filters.view !== "table" ? <input type="hidden" name="view" value={filters.view} /> : null}
            {filters.pageSize !== 24 ? <input type="hidden" name="pageSize" value={filters.pageSize} /> : null}
            {!filters.projectDefaults ? <input type="hidden" name="pf" value="0" /> : null}
            {filters.q ? <input type="hidden" name="q" value={filters.q} /> : null}
            {filters.skillsSet ? <input type="hidden" name="skills" value={filters.skills.join(",")} /> : null}
            {filters.mode ? <input type="hidden" name="mode" value={filters.mode} /> : null}

            <Surface className="p-5">
              {/* Project: not a filter, but it sets the defaults below (legacy sidebar top). */}
              <div className="pb-4">
                <div className="flex items-center justify-between">
                  <label htmlFor="filter-project" className="text-sm font-semibold text-ink-900">
                    Project
                  </label>
                  <Link href="/employer/projects" className={buttonClass({ variant: "ghost", size: "sm", className: "-mr-2" })}>
                    <Plus className="size-4" aria-hidden />
                    New
                  </Link>
                </div>
                {projects.length > 0 ? (
                  <select id="filter-project" name="project" defaultValue={activeProjectId ?? ""} className={SELECT}>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.projectName}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="mt-2 text-sm text-ink-600">No open projects. Create one to shortlist and match candidates.</p>
                )}
              </div>

              <FilterSection title="Location" icon={<MapPin className="size-4" />} open>
                <CityFilter key={filters.city} defaultValue={filters.city} label="Preferred work city" autoApply />
                <label className="mt-3 flex min-h-11 cursor-pointer items-start gap-2.5 text-sm text-ink-700">
                  {/* Unchecked sends only the hidden 0; checked adds remote=1 after it. */}
                  <input type="hidden" name="remote" value="0" />
                  <input
                    type="checkbox"
                    name="remote"
                    value="1"
                    defaultChecked={includeRemote}
                    className="mt-0.5 size-4 rounded-apple-sm border-ink-300 accent-brand-700"
                  />
                  <span>
                    <span className="font-medium text-ink-900">Include remote candidates</span>
                    <span className="mt-0.5 block text-xs text-ink-600">Also show interns who only work remotely.</span>
                  </span>
                </label>
              </FilterSection>

              <FilterSection title="Laptop" icon={<Laptop className="size-4" />} open={filters.laptop === "yes"}>
                <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-sm font-medium text-ink-800">
                  <input
                    type="checkbox"
                    name="laptop"
                    value="yes"
                    defaultChecked={filters.laptop === "yes"}
                    className="size-4 rounded-apple-sm border-ink-300 accent-brand-700"
                  />
                  Has a laptop
                </label>
              </FilterSection>

              <FilterSection title="Hourly price" icon={<Wallet className="size-4" />} open={Boolean(filters.plan)}>
                <label htmlFor="filter-plan" className="sr-only">
                  Hourly price
                </label>
                <select id="filter-plan" name="plan" defaultValue={filters.plan} className={SELECT}>
                  <option value="">Any price</option>
                  {BANDS.map((band) => (
                    <option key={band.id} value={band.id}>
                      {formatRate(resolvePricing(band.min, plans, currency, region).hourlyRateMinor, currency)} · {band.name}
                    </option>
                  ))}
                </select>
              </FilterSection>

              <FilterSection title="Ratings" icon={<Star className="size-4" />} open>
                <RatingSlider name="min" label="Findtern Score" defaultValue={filters.minScore} />
                {RATING_META.map((meta) => (
                  <RatingSlider
                    key={meta.key}
                    name={`r_${meta.key}`}
                    label={meta.label}
                   
                    defaultValue={filters.minRatings[meta.key]}
                  />
                ))}
              </FilterSection>

              <FilterSection title="Sorting" icon={<ArrowUpDown className="size-4" />} open={filters.sorts.length > 0 || filters.dir === "asc"}>
                <div className="space-y-2">
                  <label htmlFor="filter-sort" className="sr-only">
                    Sort by
                  </label>
                  <select id="filter-sort" name="sort" defaultValue={filters.sorts[0] ?? ""} className={SELECT}>
                    <option value="">Best match</option>
                    {SORT_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <label htmlFor="filter-dir" className="sr-only">
                    Order
                  </label>
                  <select id="filter-dir" name="dir" defaultValue={filters.dir === "asc" ? "asc" : ""} className={SELECT}>
                    <option value="">High to low</option>
                    <option value="asc">Low to high</option>
                  </select>
                  <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 pt-1 text-sm text-ink-800">
                    Most skills matched first
                    {/* Unchecked sends only the hidden 0; checked adds sm=1 after it. */}
                    <input type="hidden" name="sm" value="0" />
                    <input type="checkbox" role="switch" name="sm" value="1" defaultChecked={filters.skillPriority} className="peer sr-only" />
                    <span
                      aria-hidden
                      className="relative h-6 w-10 shrink-0 rounded-full bg-ink-200 transition-colors after:absolute after:left-0.5 after:top-0.5 after:size-5 after:rounded-full after:bg-white after:shadow-xs after:transition-transform peer-checked:bg-brand-700 peer-checked:after:translate-x-4 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500/40 motion-reduce:after:transition-none"
                    />
                  </label>
                </div>
              </FilterSection>

              <div className="mt-4 flex gap-2 border-t border-ink-100 pt-4">
                <Link
                  href={`/employer/candidates?fresh=1${activeProjectId ? `&project=${encodeURIComponent(activeProjectId)}` : ""}`}
                  className={buttonClass({ variant: "outline", size: "sm", className: "min-h-11 flex-1" })}
                >
                  <RotateCcw className="size-4" aria-hidden />
                  Reset
                </Link>
                <button type="submit" className={buttonClass({ variant: "primary", size: "sm", className: "min-h-11 flex-1" })}>
                  Apply
                  {activeFilterCount(filters) > 0 ? <span className="nums">({activeFilterCount(filters)})</span> : null}
                </button>
              </div>
            </Surface>
          </FilterForm>
        </aside>

        <div className="min-w-0">
          <RememberSelection employerId={uid} project={activeProjectId} compare={compareIds} filters={loadFailed ? undefined : filterQuery} />
          <SkillFilter
            active={effectiveSkills}
            projectSkills={activeProjectSkills}
            fromProject={!filters.skillsSet && filters.projectDefaults && activeProjectSkills.length > 0}
          />

          {projectApplied ? (
            <p className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-apple-lg border border-brand-200/80 bg-brand-50/70 px-4 py-3 text-sm text-ink-700">
              <span>
                Matched to <span className="font-semibold text-ink-900">{projectApplied.name}</span>
                {projectApplied.skills.length > 0 ? `: any of ${projectApplied.skills.join(", ")}` : ""}
                {projectApplied.city ? `, open to working in ${projectApplied.city}` : ""}. Best matches first.
              </span>
              <Link href={withFilters(filters, { projectDefaults: false, page: "" })} className="font-medium text-brand-700 underline-offset-4 hover:underline">
                Show everyone
              </Link>
            </p>
          ) : !filters.projectDefaults && activeProjectId ? (
            <p className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-apple-lg border border-ink-200/80 bg-white px-4 py-3 text-sm text-ink-700">
              Showing the whole pool.
              <Link href={withFilters(filters, { projectDefaults: true, page: "" })} className="font-medium text-brand-700 underline-offset-4 hover:underline">
                Match to the selected project
              </Link>
            </p>
          ) : null}

          {compareIds.length >= 1 ? (
            <div
              role="region"
              aria-label="Compare selection"
              className="fixed inset-x-4 bottom-24 z-40 mx-auto flex max-w-md flex-wrap items-center justify-center gap-x-4 gap-y-2 rounded-apple-xl border border-brand-200/80 bg-white/95 px-5 py-3 shadow-lg backdrop-blur-md sm:inset-x-auto sm:right-44 sm:w-max sm:max-w-none lg:bottom-6"
            >
              <span className="text-sm font-medium text-ink-900">
                {compareIds.length === 1
                  ? "1 selected · pick one more to compare"
                  : `${compareIds.length} of ${MAX_COMPARE} selected${compareFull ? " · limit reached" : ""}`}
              </span>
              <Link href={withFilters(filters, { ids: [] })} scroll={false} className="text-sm font-medium text-ink-600 underline-offset-4 hover:text-ink-900 hover:underline">
                Clear
              </Link>
              {compareIds.length >= 2 ? (
                <ButtonLink href={compareHref(filters)} variant="primary" size="sm" className="min-h-10">
                  <Scale className="size-4" aria-hidden />
                  Compare side by side
                </ButtonLink>
              ) : null}
            </div>
          ) : null}

          <div className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b border-ink-100 pb-4">
            <div className="min-w-0">
              <p className="nums text-base font-semibold text-ink-900">
                {total} candidate{total === 1 ? "" : "s"}
              </p>
              {candidates.length > 0 ? (
                <p className="nums mt-0.5 text-sm text-ink-600">
                  Showing {firstShown}–{firstShown + candidates.length - 1}
                </p>
              ) : null}
            </div>

            <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
              {/* Keyword search: skills, bio or city - never a name (the pool is redacted). */}
              <form method="get" role="search" className="relative w-full sm:w-60">
                {Array.from(new URLSearchParams(queryOf({ ...filters, q: "", page: 1 }).slice(1)).entries()).map(([k, v], i) => (
                  <input key={`${k}-${i}`} type="hidden" name={k} value={v} />
                ))}
                <label htmlFor="candidate-search" className="sr-only">
                  Search by skill, city or bio
                </label>
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" aria-hidden />
                <input
                  id="candidate-search"
                  name="q"
                  type="search"
                  defaultValue={filters.q}
                  placeholder="Skill, city or keyword"
                  className="apple-spring min-h-11 w-full rounded-apple-sm border border-ink-200 bg-white pl-9 pr-3 text-sm text-ink-900 outline-none placeholder:text-text-subtle focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                />
              </form>
              <Segmented label="Per page">
                {[12, 24, 48].map((size) => (
                  <SegmentLink key={size} href={withFilters(filters, { pageSize: size, page: 1 })} active={filters.pageSize === size} label={`${size} per page`}>
                    <span className="nums">{size}</span>
                  </SegmentLink>
                ))}
              </Segmented>
              <Segmented label="View">
                <SegmentLink href={withFilters(filters, { view: "table" })} active={filters.view === "table"} label="Rows">
                  <List className="size-4" aria-hidden />
                </SegmentLink>
                <SegmentLink href={withFilters(filters, { view: "grid" })} active={filters.view === "grid"} label="Cards">
                  <LayoutGrid className="size-4" aria-hidden />
                </SegmentLink>
              </Segmented>
            </div>
          </div>

          {loadFailed ? (
            <EmptyScene
              art
              title="Couldn't load the candidate pool"
              body="Something went wrong on our side while loading candidates. Your filters are fine; try again in a moment."
              next={{ label: "Try again", href: withFilters(filters) }}
              who="Us - we're on it"
            />
          ) : candidates.length === 0 ? (
            cityList.length > 0 ? (
              // EMB-21: legacy offered "Clear location" and "Include remote
              // candidates" right on the empty result.
              <div>
                <EmptyScene
                  art
                  title={`No candidates for ${cityList.map(titleCase).join(", ")}`}
                  body="Nobody in the pool has picked this city as a place to work yet. Clear the location, or include candidates who work remotely."
                  next={{ label: "Clear location", href: withoutCity(filters, effectiveSkills) }}
                  who="You - widen the search"
                />
                {!includeRemote ? (
                  <p className="mt-3 text-center">
                    <Link
                      href={withoutCity(filters, effectiveSkills, { remote: true })}
                      className={buttonClass({ variant: "outline", size: "sm", className: "min-h-11" })}
                    >
                      Include remote candidates
                    </Link>
                  </p>
                ) : null}
              </div>
            ) : (
              <EmptyScene
                art
                title="No candidates match"
                body="Lower a score floor, drop a skill or turn on remote candidates. New interns join the pool as soon as their AI interview is scored."
                next={{ label: "Reset filters", href: `/employer/candidates?fresh=1${activeProjectId ? `&project=${encodeURIComponent(activeProjectId)}` : ""}` }}
                who="You - adjust the filters"
              />
            )
          ) : (
            <>
              {filters.view === "table" ? (
                <Surface className="overflow-hidden">
                  {/* Column labels for scanning; each row also names its figures. */}
                  <div aria-hidden className={cn(CANDIDATE_GRID, "hidden gap-x-6 border-b border-ink-100 px-5 py-2.5 text-xs font-medium text-text-subtle lg:grid")}>
                    <span>Candidate</span>
                    <span>Skills</span>
                    <span className="text-right">Findtern Score</span>
                    <span className="hidden text-right 2xl:block">AI interview</span>
                    <span />
                  </div>
                  <ul className="divide-y divide-ink-100">
                    {candidates.map((c) => {
                      const rel = relations.get(c.id);
                      const status = candidateStatusPill(rel?.proposal ?? null);
                      const selected = compareIds.includes(c.id);
                      const link = compareLink(c.id);
                      const rate = resolvePricing(c.score, plans, currency, region);
                      const name = displayNameOf(c, nameUnlocked.has(c.id));
                      const wanted = new Set(effectiveSkills.map((k) => k.toLowerCase()));
                      // The project's skills first, so the match is what you read.
                      const skills = [...c.skills].sort((a, b) => Number(wanted.has(b.toLowerCase())) - Number(wanted.has(a.toLowerCase())));
                      const meta = [c.city, c.workModes.join(", "), c.hasLaptop === false ? "Needs a laptop" : c.hasLaptop ? "Own laptop" : ""].filter(Boolean).join(" · ");
                      return (
                        <li key={c.id} className={cn(CANDIDATE_GRID, "relative grid items-center gap-x-6 gap-y-2 px-5 py-3.5 transition-colors hover:bg-ink-50/70")}>
                          <div className="flex min-w-0 items-center gap-3">
                            <CandidateAvatar photoUrl={c.photoUrl} initials={c.initials} className="size-10 shrink-0 rounded-full text-xs" />
                            <div className="min-w-0">
                              <div className="flex min-w-0 items-center gap-2">
                                {/* The row opens the profile; the link is stretched over it. */}
                                <Link
                                  href={`/employer/intern/${c.id}${activeProjectId ? `?project=${encodeURIComponent(activeProjectId)}` : ""}`}
                                  className="truncate text-[0.9375rem] font-semibold text-ink-900 outline-none after:absolute after:inset-0 after:content-[''] focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-brand-500"
                                >
                                  {name}
                                </Link>
                                {status ? <Pill tone={status.tone} className="shrink-0 whitespace-nowrap">{status.label}</Pill> : null}
                              </div>
                              <p className="truncate text-sm text-ink-600">{meta || "Location not stated"}</p>
                            </div>
                          </div>
                          <p className="min-w-0 truncate text-sm text-ink-600 max-lg:col-span-2 max-lg:pl-[3.25rem]" title={c.skills.join(", ")}>
                            {skills.length === 0 ? (
                              "No skills listed"
                            ) : (
                              <>
                                {skills.slice(0, 3).map((k, i) => (
                                  <span key={k}>
                                    {i > 0 ? " · " : ""}
                                    <span className={wanted.has(k.toLowerCase()) ? "font-semibold text-ink-900" : undefined}>{k}</span>
                                  </span>
                                ))}
                                {skills.length > 3 ? <span className="text-text-subtle"> +{skills.length - 3}</span> : null}
                              </>
                            )}
                          </p>
                          <div className="text-right max-lg:col-start-2 max-lg:row-start-1">
                            <p className="nums text-xl font-semibold tracking-[-0.01em] text-ink-900">
                              {c.scored ? c.score.toFixed(1) : "-"}
                              <span className="sr-only"> Findtern Score</span>
                            </p>
                            <p className="nums whitespace-nowrap text-xs text-ink-600">
                              {PLAN_NAME[bandFor(c.score).id]} · {formatRate(rate.hourlyRateMinor, currency)}
                            </p>
                          </div>
                          <p className="nums hidden text-right text-sm font-medium text-ink-900 2xl:block">
                            {c.ratings.interview > 0 ? c.ratings.interview.toFixed(1) : <span className="text-text-subtle">-</span>}
                            <span className="sr-only"> AI interview rating</span>
                          </p>
                          <div className="relative z-10 flex items-center justify-end gap-1.5 max-lg:col-span-2 max-lg:justify-start max-lg:pl-[3.25rem]">
                            {rel?.proposal ? (
                              <ButtonLink
                                href={`/employer/proposal/${encodeURIComponent(rel.proposal.id)}`}
                                variant="outline"
                                size="sm"
                                aria-label={proposalActionLabel(rel.proposal)}
                              >
                                {rel.proposal.status === "hired" ? "Placement" : "Proposal"}
                              </ButtonLink>
                            ) : activeProjectId ? (
                              <ShortlistToggle internId={c.id} projectId={activeProjectId} shortlisted={shortlisted.has(c.id)} size="sm" emphasis="primary" />
                            ) : null}
                            {rel?.hired ? null : link ? (
                              <Link
                                href={link}
                                scroll={false}
                                aria-label={selected ? `Remove ${name} from compare` : `Add ${name} to compare`}
                                className={buttonClass({
                                  variant: "ghost",
                                  size: "sm",
                                  className: selected ? "bg-brand-50 text-brand-800" : "text-ink-600",
                                })}
                              >
                                <Scale className="size-4" aria-hidden />
                                {/* Icon-only beside the row's main action at desktop; named on phones. */}
                                <span className="lg:sr-only">{selected ? "In compare" : "Compare"}</span>
                              </Link>
                            ) : null}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </Surface>
              ) : (
                <ul className="grid gap-4 xl:grid-cols-2">
                  {candidates.map((candidate) => {
                    const rel = relations.get(candidate.id);
                    return (
                      <CandidateCard
                        key={candidate.id}
                        // The AI interview recording stays hidden until hire; only the
                        // written report is shown before (legacy detail:1578).
                        candidate={redactForEmployer(candidate, nameUnlocked.has(candidate.id))}
                        currency={currency}
                        region={region}
                        selected={compareIds.includes(candidate.id)}
                        compareHref={compareLink(candidate.id)}
                        comparable={!rel?.hired}
                        projectId={activeProjectId}
                        shortlisted={shortlisted.has(candidate.id)}
                        nameUnlocked={nameUnlocked.has(candidate.id)}
                        pricing={resolvePricing(candidate.score, plans, currency, region)}
                        proposal={rel?.proposal ?? null}
                        fullTimeFrom={rel?.fullTimeFrom ?? null}
                        fullTime={fullTime}
                        wantedSkills={effectiveSkills}
                      />
                    );
                  })}
                </ul>
              )}

              {pages > 1 ? (
                <nav aria-label="Pagination" className="mt-8 flex flex-wrap items-center justify-center gap-2">
                  {Array.from({ length: pages }, (_, i) => i + 1)
                    .filter((page) => page === 1 || page === pages || Math.abs(page - filters.page) <= 1)
                    .map((page, i, visible) => (
                      <span key={page} className="flex items-center gap-2">
                        {i > 0 && visible[i - 1] !== page - 1 ? <span className="px-1 text-ink-400">…</span> : null}
                        <Link
                          href={withFilters(filters, { page: page === 1 ? "" : page })}
                          aria-current={page === filters.page ? "page" : undefined}
                          aria-label={`Page ${page}`}
                          className={buttonClass({
                            variant: page === filters.page ? "primary" : "outline",
                            size: "icon",
                            className: "nums text-sm",
                          })}
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
      </div>
    </div>
  );
}

/* ── Toolbar pieces ──────────────────────────────────────────────────────── */

function Segmented({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="group" aria-label={label} className="inline-flex items-center gap-0.5 rounded-apple-md border border-ink-200/80 bg-white p-1">
      {children}
    </div>
  );
}

function SegmentLink({ href, active, label, children }: { href: string; active: boolean; label: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-label={label}
      aria-current={active ? "true" : undefined}
      title={label}
      className={cn(
        "apple-spring inline-flex min-h-9 min-w-9 items-center justify-center rounded-apple-sm px-2 text-sm font-medium",
        active ? "bg-brand-50 text-brand-800" : "text-ink-600 hover:bg-ink-100 hover:text-ink-900",
      )}
    >
      {children}
    </Link>
  );
}

/* ── Filters ─────────────────────────────────────────────────────────────── */

function readFilters(params: SearchParams): Filters {
  const min = Number(one(params.min) ?? "0");
  const page = Number(one(params.page) ?? "1");
  const ps = Number(one(params.pageSize) ?? "24");
  const pageSize = ps === 12 || ps === 48 ? ps : 24;
  const viewRaw = (one(params.view) ?? "").trim().toLowerCase();
  // Rows by default: results are scanned and compared, and two-up cards made
  // 24 results 6,400px tall. "list" (old full-width cards) folds into rows.
  const view: "grid" | "table" = viewRaw === "grid" ? "grid" : "table";
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

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function titleCase(value: string): string {
  return value.replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Tick or untick a candidate for Compare. Never silently drops an earlier
 * pick: the caller offers no link once four are chosen (EMB-13).
 */
function toggle(list: string[], value: string): string[] {
  const hit = list.some((entry) => entry.toLowerCase() === value.toLowerCase());
  if (hit) return list.filter((entry) => entry.toLowerCase() !== value.toLowerCase());
  return list.length >= MAX_COMPARE ? list : [...list, value];
}

/**
 * Rebuild the query string from a filter change, on top of the current
 * filters (a skill chip has to keep the city and the score floor). A `""` or
 * `0` value removes that filter.
 */
function withFilters(base: Filters, patch: Partial<Omit<Filters, "page">> & { page?: number | "" } = {}): string {
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
function withoutCity(filters: Filters, effectiveSkills: string[], patch: Partial<Omit<Filters, "page">> = {}): string {
  return filters.city
    ? withFilters(filters, { ...patch, city: "", page: "" })
    : withFilters(filters, { ...patch, projectDefaults: false, skills: effectiveSkills, skillsSet: true, page: "" });
}

/** The query string for a set of filters. */
function queryOf(merged: Filters): string {
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
  if (merged.view && merged.view !== "table") next.set("view", merged.view);
  if (merged.pageSize && merged.pageSize !== 24) next.set("pageSize", String(merged.pageSize));
  if (!merged.projectDefaults) next.set("pf", "0");
  return next;
}

function rememberQueryOf(filters: Filters): string {
  return filterParams(filters).toString();
}

/**
 * The compare page reads `ids` and `project`; the rest of the filters ride
 * along so "Back to candidates" can return to the same view.
 */
function compareHref(filters: Filters): string {
  return `/employer/compare${queryOf({ ...filters, page: 1 })}`;
}

/** How many filters are set beyond the defaults (the rail's "Apply (N)"). */
function activeFilterCount(filters: Filters): number {
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

function FilterSection({
  title,
  icon,
  open,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  open?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details open={open || undefined} className="group border-t border-ink-100">
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2.5 rounded-apple-sm text-sm font-semibold text-ink-900 [&::-webkit-details-marker]:hidden">
        <span className="text-brand-700" aria-hidden>
          {icon}
        </span>
        <span className="flex-1">{title}</span>
        <ChevronDown className="size-4 text-ink-400 transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden />
      </summary>
      <div className="pb-4">{children}</div>
    </details>
  );
}

/** Up to five lower-cased city names from the comma-separated filter. */
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
