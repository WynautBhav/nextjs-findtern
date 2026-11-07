import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { and, desc, eq, sql } from "drizzle-orm";
import { Info, LayoutGrid, List, RotateCcw, Search, X } from "lucide-react";

import { getDb, schema } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { RATING_META, redactForEmployer, toCandidateProfile, type CandidateProfile } from "@/lib/employer-candidates";
import { candidateRelations, hiredInternIds, type CandidateRelation } from "@/lib/employer-visibility";
import { attachPhotos, candidatePoolClauses, scoreExpr } from "@/lib/employer-pool";
import { projectCities } from "@/lib/project-locations";
import { likePattern } from "@/lib/admin/palette-search";
import { requireEmployerSetup } from "@/lib/employer-setup";
import { employerRegion, resolvePricing, type Currency } from "@/lib/employer-pricing";
import { BANDS, PLAN_NAME } from "@/lib/score";
import { formatRate } from "@/lib/format";
import { timezoneForLocation } from "@/lib/timezones";
import { CityFilter } from "@/components/employer/city-filter";
import { SkillFilter } from "@/components/employer/skill-filter";
import { CandidateCard, type FullTimeContext } from "@/components/employer/candidate-card";
import { FilterForm, RatingSlider, SortSelect } from "@/components/employer/candidate-filters";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { EmptyScene } from "@/components/app/primitives";
import { LoadError } from "@/components/app/load-error";
import { SITE } from "@/lib/content/site";
import { buttonClass } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { compareBySortFields } from "@/lib/candidate-sort";
import { MAX_COMPARE, isOpenProject, rememberedFilters, rememberedSelection } from "@/lib/employer-selection";
import { RememberSelection } from "@/components/employer/remember-selection";
import { fieldClass } from "@/components/employer/ui-tokens";
import { CandidatesHero } from "@/components/employer/candidates/hero";
import { FilterSection, PillRadios, SwitchField } from "@/components/employer/candidates/filter-parts";
import { Segmented, SegmentLink } from "@/components/employer/candidates/toolbar-parts";
import { CompareBar } from "@/components/employer/candidates/compare-bar";
import { CandidateRow } from "@/components/employer/candidates/candidate-row";
import { Pagination } from "@/components/employer/candidates/pagination";
import {
  FILTER_KEYS,
  SORT_OPTIONS,
  activeChipsOf,
  activeFilterCount,
  cityTerms,
  compareHref,
  one,
  queryOf,
  readFilters,
  rememberQueryOf,
  titleCase,
  toggle,
  withFilters,
  withoutCity,
  type SearchParams,
} from "./_filters";

export const metadata: Metadata = {
  title: "Candidates",
  robots: { index: false, follow: false },
};

const SELECT = cn(fieldClass, "mt-2");


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
          preferredLocations: schema.projects.preferredLocations,
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
        // query matches skills and city. Matching on name would let anyone
        // probe whether a specific person is on the platform.
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
      activeProjectSkills = (Array.isArray(project?.skills) ? project.skills : []).filter(Boolean).slice(0, 7);
      let skillTerms = filters.skills;
      effectiveSkills = filters.skills;
      let cityText = filters.city;
      if (project && filters.projectDefaults) {
        if (!filters.skillsSet) skillTerms = activeProjectSkills;
        effectiveSkills = skillTerms;
        if (!cityText) cityText = projectCities(project).join(", ");
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
      // home city does not count. "Include remote" lets in candidates who take
      // remote work: they store no preferred city, so the city test would hide
      // them (`matchesPlace` in lib/employer-candidates is the same rule).
      cityList = cityTerms(cityText);
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
      await attachPhotos(db, candidates);

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
  const resetHref = `/employer/candidates?fresh=1${activeProjectId ? `&project=${encodeURIComponent(activeProjectId)}` : ""}`;
  const activeChips = activeChipsOf(filters, (patch) => withFilters(filters, { ...patch, page: "" }));
  // The filter most likely to have emptied the list: the narrowest one set.
  const likelyCause = activeChips.find((c) => c.cause)?.cause ?? null;
  const sortOptions = [
    { label: "Best match", href: withFilters(filters, { sorts: [], dir: "desc", page: "" }) },
    { label: "Highest score", href: withFilters(filters, { sorts: ["score"], dir: "desc", page: "" }) },
    { label: "Lowest rate", href: withFilters(filters, { sorts: ["score"], dir: "asc", page: "" }) },
    // Set from the rail (another axis, or several): shown so the control never lies.
    ...(filters.sorts.length > 1 || (filters.sorts.length === 1 && filters.sorts[0] !== "score")
      ? [{ label: "Custom (rail)", href: withFilters(filters) }]
      : []),
  ];
  const sortValue =
    filters.sorts.length === 0 ? 0 : filters.sorts.length === 1 && filters.sorts[0] === "score" ? (filters.dir === "asc" ? 2 : 1) : 3;
  const compareLink = (id: string) =>
    compareIds.includes(id) || !compareFull ? withFilters(filters, { ids: toggle(compareIds, id) }) : null;

  const ratingsSet = (filters.minScore > 0 ? 1 : 0) + RATING_META.filter((m) => filters.minRatings[m.key] > 0).length;

  return (
    <div>
      <CandidatesHero
        total={total}
        shownFrom={firstShown}
        shownTo={firstShown + Math.max(candidates.length, 1) - 1}
        projectName={projects.find((p) => p.id === activeProjectId)?.projectName ?? null}
        wholePool={!filters.projectDefaults}
        shortlistedCount={shortlisted.size}
        loadFailed={loadFailed}
      />

      <div className="lg:grid lg:grid-cols-[18rem_minmax(0,1fr)] lg:items-start lg:gap-7">
        {/* ── Filter rail ─────────────────────────────────────────────── */}
        <aside aria-label="Filters" className="mb-6 lg:sticky lg:top-20 lg:mb-0 lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto lg:overscroll-contain lg:pb-2 lg:[scrollbar-width:thin]">
          <FilterForm key={queryOf(filters)} activeCount={activeFilterCount(filters)}>
            {compareIds.length > 0 ? <input type="hidden" name="ids" value={compareIds.join(",")} /> : null}
            {filters.view !== "grid" ? <input type="hidden" name="view" value={filters.view} /> : null}
            {filters.pageSize !== 24 ? <input type="hidden" name="pageSize" value={filters.pageSize} /> : null}
            {!filters.projectDefaults ? <input type="hidden" name="pf" value="0" /> : null}
            {filters.q ? <input type="hidden" name="q" value={filters.q} /> : null}
            {filters.skillsSet ? <input type="hidden" name="skills" value={filters.skills.join(",")} /> : null}
            {filters.mode ? <input type="hidden" name="mode" value={filters.mode} /> : null}

            <div className="rounded-[24px] bg-white p-5 shadow-tile lg:p-6">
              {/* Project: not a filter, but it sets the defaults below (legacy sidebar top). */}
              <div className="mb-4 rounded-[18px] bg-brand-50 p-4">
                <label htmlFor="filter-project" className="text-sm font-medium text-brand-900">
                  Project
                </label>
                {projects.length > 0 ? (
                  <select id="filter-project" name="project" defaultValue={activeProjectId ?? ""} className={cn(SELECT, "mt-2 border-transparent shadow-xs")}>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.projectName}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="mt-2 text-sm text-ink-700">No open projects. Create one to shortlist and match candidates.</p>
                )}
              </div>

              <FilterSection title="Location" summary={filters.city || "Any"} open>
                <CityFilter key={filters.city} defaultValue={filters.city} label="Preferred work city" autoApply />
                <div className="mt-2">
                  <SwitchField name="remote" value="1" zeroValue="0" defaultChecked={includeRemote} label="Include remote candidates" hint="Also show interns who only work remotely." />
                </div>
              </FilterSection>

              <FilterSection title="Laptop" summary={filters.laptop === "yes" ? "Has one" : "Any"} open={filters.laptop === "yes"}>
                <SwitchField name="laptop" value="yes" defaultChecked={filters.laptop === "yes"} label="Has a laptop" />
              </FilterSection>

              <FilterSection title="Hourly price" summary={filters.plan ? PLAN_NAME[filters.plan] : "Any"} open>
                <PillRadios
                  name="plan"
                  value={filters.plan}
                  options={[
                    { value: "", label: "Any price" },
                    ...BANDS.map((band) => ({
                      value: band.id,
                      label: formatRate(resolvePricing(band.min, plans, currency, region).hourlyRateMinor, currency),
                      sub: band.name,
                    })),
                  ]}
                />
              </FilterSection>

              <FilterSection
                title="Ratings"
                summary={ratingsSet > 0 ? `${ratingsSet} set` : "Any"}
                open={ratingsSet > 0}
              >
                <RatingSlider name="min" label="Findtern Score" defaultValue={filters.minScore} />
                {RATING_META.map((meta) => (
                  <RatingSlider key={meta.key} name={`r_${meta.key}`} label={meta.label} defaultValue={filters.minRatings[meta.key]} />
                ))}
              </FilterSection>

              <FilterSection title="Sorting" summary={filters.sorts.length > 0 || filters.dir === "asc" ? "Custom" : "Best match"} open={filters.sorts.length > 0 || filters.dir === "asc"}>
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
                  <SwitchField name="sm" value="1" zeroValue="0" defaultChecked={filters.skillPriority} label="Most skills matched first" />
                </div>
              </FilterSection>

              {/* Filters apply as they change (QA-125): no Apply. On a phone the
                  panel folds out, so "Done" closes it; Reset is a quiet link. */}
              <div className="mt-4 flex items-center gap-2 border-t border-ink-100 pt-4">
                <Link href={resetHref} className={buttonClass({ variant: "ghost", size: "sm", className: "min-h-11 rounded-full" })}>
                  <RotateCcw className="size-4" aria-hidden />
                  Reset filters
                </Link>
                <button type="submit" className={buttonClass({ variant: "primary", size: "sm", className: "ml-auto min-h-11 rounded-full lg:hidden" })}>
                  Done
                </button>
              </div>
            </div>
          </FilterForm>
        </aside>

        {/* Phones: the compare bar sits ~13rem up (over the bottom nav, wrapping at 320px), so the last card needs room to scroll clear of it. */}
        <div className={cn("min-w-0", compareIds.length >= 1 && "max-lg:pb-32")}>
          <RememberSelection employerId={uid} project={activeProjectId} compare={compareIds} filters={loadFailed ? undefined : filterQuery} />
          <div className="mb-4 lg:rounded-[24px] lg:bg-white lg:p-5 lg:shadow-tile">
            <SkillFilter
              active={effectiveSkills}
              projectSkills={activeProjectSkills}
              fromProject={!filters.skillsSet && filters.projectDefaults && activeProjectSkills.length > 0}
              context={
                projectApplied ? (
                  <span className="flex flex-wrap items-center gap-x-2">
                    <span>
                      Matched to <span className="font-semibold text-ink-900">{projectApplied.name}</span>
                      {projectApplied.city ? `, open to ${projectApplied.city}` : ""}
                    </span>
                    <Link href={withFilters(filters, { projectDefaults: false, page: "" })} className="font-medium text-brand-700 underline-offset-4 hover:underline touch:inline-flex touch:min-h-11 touch:items-center">
                      Ignore project, show whole pool
                    </Link>
                  </span>
                ) : !filters.projectDefaults && activeProjectId ? (
                  <span className="flex flex-wrap items-center gap-x-2">
                    Showing the whole pool.
                    <Link href={withFilters(filters, { projectDefaults: true, page: "" })} className="font-medium text-brand-700 underline-offset-4 hover:underline touch:inline-flex touch:min-h-11 touch:items-center">
                      Match to the selected project
                    </Link>
                  </span>
                ) : null
              }
            />
          </div>

          {compareIds.length >= 1 ? (
            <CompareBar count={compareIds.length} max={MAX_COMPARE} clearHref={withFilters(filters, { ids: [] })} compareHref={compareHref(filters)} />
          ) : null}

          {activeChips.length > 0 ? (
            <div className="mb-4 flex flex-wrap items-center gap-2" aria-label="Active filters" role="group">
              {activeChips.map((chip) => (
                <Link
                  key={chip.label}
                  href={chip.href}
                  scroll={false}
                  className="apple-spring inline-flex min-h-9 items-center gap-1.5 rounded-full bg-white px-3.5 text-sm font-medium text-ink-800 shadow-tile hover:bg-brand-50 touch:min-h-11"
                >
                  {chip.label}
                  <X className="size-3.5 text-text-subtle" aria-hidden />
                  <span className="sr-only">: remove</span>
                </Link>
              ))}
              <Link href={resetHref} className="inline-flex min-h-9 items-center px-2 text-sm font-medium text-brand-700 underline-offset-4 hover:underline touch:min-h-11">
                Clear all
              </Link>
            </div>
          ) : null}

          {/* Floating toolbar: glass is allowed on sticky controls. */}
          <div className="z-20 mb-5 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-[22px] bg-white/80 px-4 py-2.5 shadow-tile backdrop-blur-xl lg:sticky lg:top-[4.5rem]">
            <div className="flex min-w-0 items-center gap-1.5">
              {/* A live count: filters apply on change, so this is how a screen reader hears the result. */}
              {loadFailed ? null : (
                <p role="status" className="whitespace-nowrap text-sm font-medium text-text-subtle">
                  <span className="nums mr-1.5 text-lg font-semibold tabular-nums text-ink-900">{total}</span>
                  candidate{total === 1 ? "" : "s"}
                  {candidates.length > 0 ? (
                    <span className="ml-2 text-sm font-normal text-text-subtle">
                      {firstShown}–{firstShown + candidates.length - 1}
                    </span>
                  ) : null}
                </p>
              )}
              {!loadFailed && candidates.length > 0 ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button" aria-label="About masked identities" className="inline-flex size-8 items-center justify-center rounded-full text-text-subtle outline-none hover:bg-ink-100 focus-visible:ring-[3px] focus-visible:ring-brand-600/30 touch:size-11">
                      <Info className="size-4" aria-hidden />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Names and photos unlock after you hire. Until then candidates show as initials.</TooltipContent>
                </Tooltip>
              ) : null}
            </div>

            <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
              {/* Keyword search: skills or city - never a name (the pool is redacted). */}
              <form method="get" role="search" className="relative w-full sm:w-48">
                {Array.from(new URLSearchParams(queryOf({ ...filters, q: "", page: 1 }).slice(1)).entries()).map(([k, v], i) => (
                  <input key={`${k}-${i}`} type="hidden" name={k} value={v} />
                ))}
                <label htmlFor="candidate-search" className="sr-only">
                  Search by skill or city
                </label>
                <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-text-subtle" aria-hidden />
                <input
                  id="candidate-search"
                  name="q"
                  type="search"
                  defaultValue={filters.q}
                  placeholder="Keyword search"
                  className={cn(fieldClass, "rounded-full border-transparent bg-ink-100/80 pl-10 hover:bg-ink-100 focus-visible:bg-white lg:min-h-10")}
                />
              </form>
              <SortSelect options={sortOptions} value={sortValue} />
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
            <LoadError what="the candidate pool" retryHref={withFilters(filters)} email={SITE.adminEmail} />
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
                    <Link href={withoutCity(filters, effectiveSkills, { remote: true })} className={buttonClass({ variant: "outline", size: "sm", className: "min-h-11 rounded-full" })}>
                      Include remote candidates
                    </Link>
                  </p>
                ) : null}
              </div>
            ) : (
              <EmptyScene
                art
                title="No candidates match"
                body={`${likelyCause ? `Most likely ${likelyCause}. Remove it above, or ` : "Lower a score floor, drop a skill or turn on remote candidates, or "}reset everything. New interns join the pool as soon as their AI interview is scored.`}
                next={{ label: filters.projectDefaults || activeChips.length === 0 ? "Reset filters" : "Clear all filters", href: resetHref }}
                who="You - adjust the filters"
              />
            )
          ) : (
            <>
              {filters.view === "table" ? (
                <div>
                  <ul className="space-y-3">
                    {candidates.map((c, i) => {
                      const rel = relations.get(c.id);
                      return (
                        <CandidateRow
                          key={c.id}
                          index={i}
                          rank={firstShown + i}
                          candidate={c}
                          nameUnlocked={nameUnlocked.has(c.id)}
                          proposal={rel?.proposal ?? null}
                          hired={Boolean(rel?.hired)}
                          pricing={resolvePricing(c.score, plans, currency, region)}
                          currency={currency}
                          projectId={activeProjectId}
                          shortlisted={shortlisted.has(c.id)}
                          selected={compareIds.includes(c.id)}
                          compareHref={compareLink(c.id)}
                          wantedSkills={effectiveSkills}
                        />
                      );
                    })}
                  </ul>
                </div>
              ) : (
                <ul className="grid gap-5 md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                  {candidates.map((candidate, i) => {
                    const rel = relations.get(candidate.id);
                    return (
                      <CandidateCard
                        key={candidate.id}
                        index={i}
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

              <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 sm:justify-between">
                <Segmented label="Per page" className="max-sm:hidden">
                  {[12, 24, 48].map((size) => (
                    <SegmentLink key={size} href={withFilters(filters, { pageSize: size, page: 1 })} active={filters.pageSize === size} label={`${size} per page`}>
                      <span className="nums">{size}</span>
                    </SegmentLink>
                  ))}
                </Segmented>
                <Pagination pages={pages} current={filters.page} hrefFor={(page) => withFilters(filters, { page: page === 1 ? "" : page })} />
                <span aria-hidden className="w-[7.5rem] max-sm:hidden" />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
