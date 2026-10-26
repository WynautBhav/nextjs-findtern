import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import {
  ArrowUpDown,
  ArrowUpRight,
  CheckCircle2,
  ChevronDown,
  Filter,
  Laptop,
  LayoutGrid,
  List,
  MapPin,
  MessageSquare,
  Plus,
  RotateCcw,
  Scale,
  Search,
  Shield,
  ShoppingCart,
  Sparkles,
  Star,
  Table as TableIcon,
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
import { BANDS, type BandId } from "@/lib/score";
import { formatRate } from "@/lib/format";
import { CityFilter } from "@/components/employer/city-filter";
import { SkillFilter } from "@/components/employer/skill-filter";
import { CandidateCard } from "@/components/employer/candidate-card";
import { FilterForm, RatingSlider } from "@/components/employer/candidate-filters";
import { CandidateAvatar } from "@/components/employer/candidate-avatar";
import { PageHeader, EmptyState } from "@/components/layout/page-header";
import { cn } from "@/lib/utils";
import { compareBySortFields, parseSortFields } from "@/lib/candidate-sort";
import { parseIds, rememberedSelection } from "@/lib/employer-selection";
import { RememberSelection } from "@/components/employer/remember-selection";

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
  /** `ids` was in the URL (even empty): it wins over the remembered picks. */
  idsSet: boolean;
};

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "score", label: "Findtern Score" },
  ...RATING_META.map((meta) => ({ value: meta.key, label: meta.label })),
];

const RATING_ICON: Record<keyof Ratings, React.ReactNode> = {
  communication: <MessageSquare className="size-4" />,
  coding: <Star className="size-4" />,
  aptitude: <CheckCircle2 className="size-4" />,
  interview: <Sparkles className="size-4" />,
};

const SELECT =
  "apple-spring mt-2 min-h-11 w-full rounded-[10px] border border-ink-200/90 bg-white px-3 text-[14px] text-ink-900 shadow-2xs outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20";

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
  // The project and compare picks carry over from the last visit (cookie)
  // unless the URL names them.
  const remembered = await rememberedSelection(uid);
  if (!filters.idsSet) filters.ids = remembered.compare;
  if (!filters.project && remembered.project) filters.project = remembered.project;
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
  let activeProjectSkills: string[] = [];
  /** The skills the list is filtered by: the employer's, or the project's. */
  let effectiveSkills: string[] = filters.skills;
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
      (filters.project && projects.find((p) => p.id === filters.project)?.id) ||
      projects[0]?.id ||
      null;
    // A remembered project that was since deleted is not carried on links.
    if (filters.project !== activeProjectId) filters.project = activeProjectId ?? "";
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
    activeProjectSkills = (Array.isArray(project?.skills) ? project.skills : []).filter(Boolean).slice(0, 7);
    let skillTerms = filters.skills;
    effectiveSkills = filters.skills;
    let cityText = filters.city;
    // Picking the Remote work mode means "remote candidates": a remote hire's
    // home city does not matter, so it behaves as "include remote" too.
    const includeRemote = filters.remote || filters.mode === "remote";
    if (project && filters.projectDefaults) {
      const projectSkills = (Array.isArray(project.skills) ? project.skills : []).filter(Boolean).slice(0, 7);
      const onsite = Boolean(project.locationType && project.locationType !== "remote");
      // The employer's own pick (even "none") wins; otherwise the project's.
      if (!filters.skillsSet) skillTerms = projectSkills;
      effectiveSkills = skillTerms;
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
    // either, and those with more of them rank first. A skill matches by its
    // whole name, case-insensitively, as legacy did (dashboard:2716). This was
    // a substring match on the raw JSON, so "Java" pulled in every JavaScript
    // candidate and "C" or "R" matched nearly everyone (bug sheet 26 Oct).
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
    const lowered = skillTerms.map((t) => t.trim().toLowerCase());
    const skillMatches = (p: CandidateProfile) => {
      if (!filters.skillPriority || lowered.length < 2) return 0;
      // `readSkills` appends " · level" to object skills; match the name.
      const have = new Set(p.skills.map((x) => x.split(" · ")[0].trim().toLowerCase()));
      return lowered.filter((t) => have.has(t)).length;
    };
    // A sort the employer picked leads; project skill and city matches then
    // break ties. Before, a selected project's skill match always came first,
    // so the chosen sort looked ignored (bug sheet 21 Oct).
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

      <div className="lg:grid lg:grid-cols-[18rem_minmax(0,1fr)] lg:items-start lg:gap-6">
        {/* ── Filter sidebar (legacy employer dashboard layout) ─────────── */}
        <aside className="mb-6 lg:sticky lg:top-6 lg:mb-0 lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto lg:pb-2">
          <FilterForm key={queryOf(filters)} activeCount={activeFilterCount(filters)}>
            {compareIds.length > 0 ? <input type="hidden" name="ids" value={compareIds.join(",")} /> : null}
            {filters.view !== "grid" ? <input type="hidden" name="view" value={filters.view} /> : null}
            {filters.pageSize !== 24 ? <input type="hidden" name="pageSize" value={filters.pageSize} /> : null}
            {!filters.projectDefaults ? <input type="hidden" name="pf" value="0" /> : null}
            {filters.q ? <input type="hidden" name="q" value={filters.q} /> : null}
            {filters.skillsSet ? <input type="hidden" name="skills" value={filters.skills.join(",")} /> : null}
            {filters.mode ? <input type="hidden" name="mode" value={filters.mode} /> : null}

            <div className="rounded-[20px] border border-ink-200/70 bg-white/90 p-4 shadow-[0_1px_2px_rgb(7_47_36/0.04),0_8px_24px_rgb(7_47_36/0.06)]">
              {/* Project: not a filter, but it sets the defaults below (legacy sidebar top). */}
              <div className="mb-4 border-b border-ink-100 pb-4">
                <div className="flex items-center justify-between">
                  <label htmlFor="filter-project" className="text-sm font-semibold text-ink-800">
                    Project
                  </label>
                  <Link
                    href="/employer/projects"
                    className="apple-spring inline-flex min-h-9 items-center gap-1 rounded-[8px] px-2 text-xs font-semibold text-brand-700 hover:bg-brand-50"
                  >
                    <Plus className="size-3.5" aria-hidden />
                    New
                  </Link>
                </div>
                {projects.length > 0 ? (
                  <select
                    id="filter-project"
                    name="project"
                    defaultValue={activeProjectId ?? ""}
                    className={SELECT}
                  >
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.projectName}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="mt-2 text-xs text-text-subtle">No projects yet. Create one to shortlist and match candidates.</p>
                )}
                <Link
                  href="/employer/projects"
                  className="mt-1 inline-flex min-h-9 items-center text-xs font-medium text-ink-600 underline-offset-4 hover:text-brand-700 hover:underline"
                >
                  Manage all projects
                </Link>
              </div>

              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink-900">
                <Filter className="size-4 text-brand-700" aria-hidden />
                Candidate Filters
              </h2>

              <div className="space-y-2">
                <FilterSection title="Location" icon={<MapPin className="size-4" />} open>
                  <CityFilter key={filters.city} defaultValue={filters.city} label="Work location" autoApply />
                  <label className="mt-3 flex min-h-11 cursor-pointer items-start gap-2.5 text-sm text-ink-700">
                    <input
                      type="checkbox"
                      name="remote"
                      value="1"
                      defaultChecked={filters.remote}
                      className="mt-0.5 size-4 rounded border-ink-300 accent-brand-700"
                    />
                    <span>
                      <span className="font-medium text-ink-900">Include Remote Candidates</span>
                      <span className="block text-xs text-text-subtle">Also show interns open to remote work from anywhere.</span>
                    </span>
                  </label>
                </FilterSection>

                <FilterSection title="Device" icon={<Laptop className="size-4" />} open={filters.laptop === "yes"}>
                  <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-sm font-medium text-ink-800">
                    <input
                      type="checkbox"
                      name="laptop"
                      value="yes"
                      defaultChecked={filters.laptop === "yes"}
                      className="size-4 rounded border-ink-300 accent-brand-700"
                    />
                    Has Laptop
                  </label>
                </FilterSection>

                <FilterSection title="Price" icon={<ShoppingCart className="size-4" />} open={Boolean(filters.plan)}>
                  <label htmlFor="filter-plan" className="sr-only">
                    Hourly price
                  </label>
                  <select id="filter-plan" name="plan" defaultValue={filters.plan} className={SELECT}>
                    <option value="">Any</option>
                    {BANDS.map((band) => (
                      <option key={band.id} value={band.id}>
                        {formatRate(resolvePricing(band.min, plans, currency, region).hourlyRateMinor, currency)}
                      </option>
                    ))}
                  </select>
                </FilterSection>

                <FilterSection title="Ratings" icon={<Star className="size-4" />} open>
                  <div className="space-y-2.5">
                    {RATING_META.map((meta) => (
                      <RatingSlider
                        key={meta.key}
                        name={`r_${meta.key}`}
                        label={meta.key === "interview" ? "AI Interview" : meta.label}
                        icon={RATING_ICON[meta.key]}
                        defaultValue={filters.minRatings[meta.key]}
                      />
                    ))}
                    <RatingSlider
                      name="min"
                      label="Findtern Score"
                      icon={<Shield className="size-4" />}
                      defaultValue={filters.minScore}
                    />
                  </div>
                </FilterSection>

                <FilterSection
                  title="Sorting"
                  icon={<ArrowUpDown className="size-4" />}
                  open={filters.sorts.length > 0 || filters.dir === "asc"}
                >
                  <div className="space-y-2">
                    <label htmlFor="filter-sort" className="sr-only">
                      Sort by
                    </label>
                    <select id="filter-sort" name="sort" defaultValue={filters.sorts[0] ?? ""} className={SELECT}>
                      <option value="">Select field</option>
                      {SORT_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.value === "interview" ? "AI Interview" : o.label}
                        </option>
                      ))}
                    </select>
                    <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-[10px] border border-ink-200 px-3 py-2 text-sm text-ink-800">
                      Maximum skill match
                      {/* Unchecked sends only the hidden 0; checked adds sm=1 after it. */}
                      <input type="hidden" name="sm" value="0" />
                      <input
                        type="checkbox"
                        role="switch"
                        name="sm"
                        value="1"
                        defaultChecked={filters.skillPriority}
                        className="peer sr-only"
                      />
                      <span
                        aria-hidden
                        className="relative h-6 w-10 shrink-0 rounded-full bg-ink-200 transition-colors after:absolute after:left-0.5 after:top-0.5 after:size-5 after:rounded-full after:bg-white after:shadow-xs after:transition-transform peer-checked:bg-brand-700 peer-checked:after:translate-x-4 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500/40"
                      />
                    </label>
                    <label htmlFor="filter-dir" className="sr-only">
                      Order
                    </label>
                    <select id="filter-dir" name="dir" defaultValue={filters.dir === "asc" ? "asc" : ""} className={SELECT}>
                      <option value="">High → Low</option>
                      <option value="asc">Low → High</option>
                    </select>
                  </div>
                </FilterSection>
              </div>

              <div className="mt-4 flex gap-2 border-t border-ink-100 pt-4">
                <Link
                  href="/employer/candidates"
                  className="apple-spring apple-pressable inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-[10px] border border-ink-200 bg-white text-sm font-medium text-ink-700 hover:bg-ink-50"
                >
                  <RotateCcw className="size-3.5" aria-hidden />
                  Reset
                </Link>
                <button
                  type="submit"
                  className="apple-spring apple-pressable inline-flex min-h-11 flex-1 items-center justify-center rounded-[10px] bg-brand-700 text-sm font-semibold text-white shadow-xs hover:bg-brand-600"
                >
                  Applied ({activeFilterCount(filters)})
                </button>
              </div>
            </div>
          </FilterForm>
        </aside>

        <div className="min-w-0">
        <RememberSelection employerId={uid} project={activeProjectId} compare={compareIds} />
        <SkillFilter
          active={effectiveSkills}
          projectSkills={activeProjectSkills}
          fromProject={!filters.skillsSet && filters.projectDefaults && activeProjectSkills.length > 0}
        />


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

        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 pb-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-semibold text-brand-700">
              <span className="size-2 rounded-full bg-brand-600" aria-hidden />
              {total} candidate{total === 1 ? "" : "s"} found
            </p>
            {candidates.length > 0 ? (
              <p className="mt-0.5 text-xs tabular-nums text-text-subtle">
                Showing {(Math.min(filters.page, pages) - 1) * filters.pageSize + 1}–
                {(Math.min(filters.page, pages) - 1) * filters.pageSize + candidates.length}
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Keyword search: skills, bio or city - never a name (the pool is redacted). */}
            <form method="get" role="search" className="relative w-full sm:w-64">
              {Array.from(new URLSearchParams(queryOf({ ...filters, q: "", page: 1 }).slice(1)).entries()).map(([k, v], i) => (
                <input key={`${k}-${i}`} type="hidden" name={k} value={v} />
              ))}
              <label htmlFor="candidate-search" className="sr-only">
                Search candidates
              </label>
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" aria-hidden />
              <input
                id="candidate-search"
                name="q"
                type="search"
                defaultValue={filters.q}
                placeholder="Search candidates…"
                className="apple-spring min-h-11 w-full rounded-full border border-ink-200 bg-white pl-9 pr-4 text-[14px] text-ink-900 outline-none placeholder:text-ink-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
              />
            </form>
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
      </div>
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
    remote: ["1", "true", "on"].includes(one(params.remote) ?? ""),
    // Absent = on (the default); the form sends sm=0, plus sm=1 when ticked.
    skillPriority: params.sm === undefined || (Array.isArray(params.sm) ? params.sm : [params.sm]).includes("1"),
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
  // Changing the compare picks is explicit, so an emptied list stays empty
  // rather than falling back to the remembered one.
  const merged: Filters = { ...base, ...patch, page, idsSet: base.idsSet || patch.ids !== undefined };
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
  if (merged.remote) next.set("remote", "1");
  if (!merged.skillPriority) next.set("sm", "0");
  if (merged.view && merged.view !== "grid") next.set("view", merged.view);
  if (merged.pageSize && merged.pageSize !== 24) next.set("pageSize", String(merged.pageSize));
  if (merged.project) next.set("project", merged.project);
  if (!merged.projectDefaults) next.set("pf", "0");
  if (merged.ids.length > 0 || merged.idsSet) next.set("ids", merged.ids.join(","));
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

/** How many filters are set beyond the defaults (the sidebar's "Applied (N)"). */
function activeFilterCount(filters: Filters): number {
  return [
    Boolean(filters.q),
    Boolean(filters.city),
    Boolean(filters.mode),
    filters.remote,
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
    <details open={open || undefined} className="group rounded-[12px] border border-ink-200/80 px-3">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 py-2 text-sm font-medium text-ink-800 [&::-webkit-details-marker]:hidden">
        <span className="text-brand-600" aria-hidden>
          {icon}
        </span>
        <span className="flex-1">{title}</span>
        <ChevronDown className="size-4 text-ink-400 transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="pb-3">{children}</div>
    </details>
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
