import { and, desc, eq, inArray, not, sql } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { getEmployerRows } from "@/lib/employer-request";
import { RATING_META, toCandidateProfile } from "@/lib/employer-candidates";
import { candidateRelations, heldElsewhereSql, hiredAmong, hiredInternIds, notHiredByEmployerSql } from "@/lib/employer-visibility";
import { attachPhotos, candidatePoolClauses, scoreExpr } from "@/lib/employer-pool";
import { projectDefaultCity } from "@/lib/project-locations";
import { likePattern } from "@/lib/admin/palette-search";
import { employerRegion } from "@/lib/employer-pricing";
import { BANDS } from "@/lib/score";
import { EMPTY_PRO_REQUEST, enforcePro, hasProRequest, proAccess } from "@/lib/candidate-pro-access";
import { proFactsOf } from "@/lib/candidate-pro-filters";
import { getEmployerSubscriptionConfig } from "@/lib/platform-settings";
import { subscriptionChargeMinor } from "@/lib/employer-subscription";
import { isOpenProject, rememberedFilters } from "@/lib/employer-selection";
import { restorableFilters, singleCity, withoutProParams, withoutSavedCity } from "@/lib/employer-filter-restore";
import { presenceOf } from "@/lib/presence";
import { savedInternIds } from "@/lib/saved-roles";
import { rankProfiles } from "@/components/employer/candidate-rank";
import { pageWindow } from "@/components/employer/candidate-view";
import { getActivePricingPlans } from "@/lib/cached-reads";

export * from "@/lib/candidates-params";
import { FILTER_KEYS, cityTerms, type CandidatesData, type Filters, type ProData } from "@/lib/candidates-params";

/** A safety ceiling, not a page size: the pool is ranked in memory (EMB-06). */
const POOL_CEILING = 5000;

const NO_PRO: ProData = { active: false, ignored: false, offered: false, charge: null, periodDays: null, colleges: [], hiddenNoScore: 0, approxKept: 0 };

/**
 * Everything the candidates page reads. `filters.project` is corrected in
 * place to the project actually in use.
 */
export async function loadCandidates(
  uid: string,
  filters: Filters,
  opts: {
    hasFilterParams: boolean;
    fresh: boolean;
    /** Only `total` is wanted (the zero-results counts): skip the page's photos, offers and presence. */
    countOnly?: boolean;
    /**
     * The results endpoint: only what depends on the filters. The page chrome (the employer row for currency and region, the
     * pricing plans, the Findtern Pro offer) is sent once with the page and is not read again per filter change; compare picks
     * are the browser's, so the hired-pick check is skipped too.
     */
    lean?: boolean;
    /** The endpoint knows this from the signed session, so the hired-set read does not wait for a session read first. */
    viewingAsAdmin?: boolean;
  },
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
    cityDefault: "",
    nameUnlocked: new Set(),
    plans: [],
    relations: new Map(),
    presence: {},
    saved: new Set(),
    savedCount: 0,
    pro: { ...NO_PRO },
    relaxCounts: null,
  };

  // Findtern Pro: the entitlement decides, never the URL. Whatever the link asked for is read once,
  // then emptied in place for an employer without an active subscription (a lapsed subscriber's stale
  // link, a hand-edited one), so no filter, sort, chip or remembered query carries it on.
  const requested = { cgpaMin: filters.cgpaMin, cgpaVerified: filters.cgpaVerified, colleges: filters.colleges, collegeSort: filters.collegeSort };
  let proConfig: Awaited<ReturnType<typeof getEmployerSubscriptionConfig>> | null = null;
  // One wave, not a chain: everything below that does not depend on the pro check or on another read starts now and is awaited
  // where it was awaited before (inside the try, so a failure still becomes `loadFailed`). The no-op catch only keeps a read that
  // is never reached (a redirect or an early throw) from becoming an unhandled rejection.
  const early = <T,>(p: PromiseLike<T>): Promise<T> => {
    const q = Promise.resolve(p);
    q.catch(() => undefined);
    return q;
  };
  const db0 = getDb();
  const hiredP = early(hiredInternIds(db0, uid, opts.viewingAsAdmin));
  const picksP = !opts.lean && filters.ids.length > 0 ? early(hiredAmong(db0, uid, filters.ids)) : null;
  const projectsP = early(
    db0
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
      .orderBy(desc(schema.projects.createdAt)),
  );
  const employerP = opts.lean ? null : early(getEmployerRows(uid));
  const plansP = opts.lean ? null : early(getActivePricingPlans());
  const proP = early(proAccess(uid));
  const configP = opts.lean ? null : early(getEmployerSubscriptionConfig());
  const proActive = await proP;
  data.pro.active = proActive;
  if (!proActive) {
    data.pro.ignored = hasProRequest(requested) && !filters.saved;
    Object.assign(filters, { ...EMPTY_PRO_REQUEST, colleges: [] });
    if (configP) {
      proConfig = await configP;
      data.pro.offered = proConfig.enabled;
    }
  }

  try {
    const db = getDb();

    // Names stay redacted until this employer hires the intern.
    data.nameUnlocked = await hiredP;

    // A hired candidate is not on this list (they live under Hired / Orders), so a compare pick
    // that was hired since (cookie or link) is dropped here: the tray never counts someone the
    // list cannot show. Corrected in place, like `filters.project`.
    if (picksP) {
      const hiredPicks = await picksP;
      if (hiredPicks.size > 0) filters.ids = filters.ids.filter((id) => !hiredPicks.has(id));
    }
    const compareIds = filters.ids;

    // A shortlist is keyed on (project, candidate), so the page needs a
    // project. Only open projects are offered, newest first, and the newest
    // open one is the default (EMB-04 / EMH-15, legacy picker).
    const projectRows = (
      await projectsP
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
      // Only real filters are restored. A cookie holding just the retired `view`
      // used to redirect to itself forever (see lib/employer-filter-restore).
      // One city only: an older remembered query that listed several keeps its first.
      const remembered = singleCity(restorableFilters(await rememberedFilters(uid, activeProjectId), FILTER_KEYS));
      // A project with a city of its own brings it back by default: a remembered city (or "no city") is not restored.
      const restorable = projectDefaultCity(projectRows.find((p) => p.id === activeProjectId) ?? {}) ? withoutSavedCity(remembered) : remembered;
      // A remembered query from before the subscription ended must not bring the Pro filters back.
      const savedFilters = proActive ? restorable : withoutProParams(restorable);
      if (savedFilters) {
        const next = new URLSearchParams(savedFilters);
        next.set("project", activeProjectId);
        if (compareIds.length > 0) next.set("ids", compareIds.join(","));
        data.restoreTo = `/employer/candidates?${next.toString()}`;
      }
    }
    if (data.restoreTo) return data;

    // The shortlist and the saved-roles read start now; the pool query below only needs the shortlist for the Saved tab.
    // One statement: this project's shortlist, kept to candidates still in the pool (pool rule, no hold elsewhere) and not hired.
    // Those are the only ones a card or the Saved tab can show, and their number is the "Saved (N)" tab (hired ones left every
    // shortlist, EMB-26). It was three chained reads.
    const shortlistP = early(
      (async () => {
        if (!activeProjectId) return;
        const rows = await db
          .selectDistinct({ internId: schema.employerCartItems.internId })
          .from(schema.employerCartItems)
          .innerJoin(schema.users, eq(schema.users.id, schema.employerCartItems.internId))
          .innerJoin(schema.internOnboarding, eq(schema.internOnboarding.userId, schema.users.id))
          .where(
            and(
              eq(schema.employerCartItems.employerId, uid),
              eq(schema.employerCartItems.projectId, activeProjectId),
              eq(schema.employerCartItems.listType, "cart"),
              ...candidatePoolClauses(),
              not(heldElsewhereSql(uid)),
              notHiredByEmployerSql(uid),
            ),
          );
        data.shortlisted = new Set(rows.map((r) => r.internId));
        data.savedCount = data.shortlisted.size;
      })(),
    );
    // Roles students saved for this project (OA3). Optional: a failed read only drops the "Interested in this role" boost, never the list.
    const savedP = activeProjectId
      ? early(
          savedInternIds(activeProjectId).catch((err) => {
            console.error("[employer/candidates] saved roles", err);
            return new Set<string>();
          }),
        )
      : null;

    if (employerP) {
      const [employer] = await employerP; // the request-scoped employer row the layout already reads
      data.region = employerRegion(employer ?? {});
      data.currency = data.region === "IN" ? "INR" : "USD";
    }
    if (proConfig?.enabled) {
      data.pro.charge = subscriptionChargeMinor(proConfig, data.currency);
      data.pro.periodDays = proConfig.durationDays;
    }

    // The pool rule (active, live, open to work, AI-interviewed, approved)
    // lives in lib/employer-pool so the dashboard applies the same one.
    const clauses = candidatePoolClauses();

    if (filters.q) {
      // Keyword only - never a name. Employers browse a redacted pool, so the
      // query matches skills and city. Matching on name would let anyone
      // probe whether a specific person is on the platform. Never the bio:
      // employers do not receive it, so a search must not reveal it either.
      // Skill NAMES only: the raw jsonb text also holds keys and hidden levels ("Advanced").
      const needle = likePattern(filters.q);
      const sk = schema.internOnboarding.skills;
      clauses.push(
        sql`(EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(${sk}) = 'array' THEN ${sk} ELSE '[]'::jsonb END) AS q(e)
          WHERE (CASE jsonb_typeof(e) WHEN 'string' THEN e #>> '{}' ELSE coalesce(e->>'name', e->>'skill', e->>'title') END) ILIKE ${needle} ESCAPE '\\')
          OR ${schema.internOnboarding.city} ILIKE ${needle} ESCAPE '\\')`,
      );
    }

    // Row 61 / legacy dashboard:1528: the selected project fills in its own
    // skills and city when the employer has not typed any. "Ignore project skills"
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
      // An explicit `city` (even empty) is the employer's choice; only an absent one takes the project's.
      if (!cityText && !filters.citySet) cityText = projectDefaultCity(project);
      data.cityDefault = projectDefaultCity(project);
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
    // candidates who only work remotely are left out.
    const includeRemote = filters.remote ?? (projectRemote || !filters.projectDefaults);
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
    const savedOnly = filters.saved && Boolean(activeProjectId);
    const readPool = () => db
      .select({ user: schema.users, onboarding: schema.internOnboarding })
      .from(schema.users)
      .innerJoin(schema.internOnboarding, eq(schema.internOnboarding.userId, schema.users.id))
      // The Saved tab: the pool rule and the shortlist only; the search filters are set aside.
      // Either way, never someone this employer has hired: the list, its count, the pages and
      // every sort are all built from these rows.
      .where(
        and(
          savedOnly
            ? and(...candidatePoolClauses(), data.shortlisted.size > 0 ? inArray(schema.users.id, [...data.shortlisted]) : sql`false`)
            : and(...clauses),
          notHiredByEmployerSql(uid),
          not(heldElsewhereSql(uid)),
        ),
      )
      // Newest onboarding row first, so the dedupe below keeps it (legacy
      // read only the newest row per intern); then id for a total order.
      .orderBy(desc(schema.internOnboarding.updatedAt), desc(schema.users.id))
      .limit(POOL_CEILING);
    let rows: Awaited<ReturnType<typeof readPool>>;
    if (savedOnly) {
      await shortlistP; // the Saved tab is built from the shortlist
      rows = await readPool();
    } else {
      [rows] = await Promise.all([readPool(), shortlistP]);
    }

    // `intern_onboarding` has no unique index on `user_id`: one row per intern.
    const seen = new Set<string>();
    // The raw onboarding bag per intern: the CGPA filter needs the college's verification status, which the
    // employer-facing profile does not carry.
    const extraById = new Map<string, unknown>();
    const pool = rows
      .filter((row) => {
        if (seen.has(row.user.id)) return false;
        seen.add(row.user.id);
        extraById.set(row.user.id, row.onboarding.extraData);
        return true;
      })
      .map((row) => toCandidateProfile(row.user, row.onboarding))
      // Rating floors run here: `ratings` is a nested jsonb object whose
      // values the legacy writer stored as numbers or numeric strings.
      .filter((p) => savedOnly || RATING_META.every((meta) => p.ratings[meta.key] >= filters.minRatings[meta.key]));

    // Findtern Pro, in the same in-memory pool the rating floors use, so the total, the pages and every sort
    // agree. A subscriber's CGPA and college filters narrow it; for anyone else this returns it untouched.
    // The Shortlist tab sets all filters aside, as it does for the others.
    const proOutcome = enforcePro(
      pool,
      savedOnly ? EMPTY_PRO_REQUEST : { cgpaMin: filters.cgpaMin, cgpaVerified: filters.cgpaVerified, colleges: filters.colleges, collegeSort: filters.collegeSort },
      proActive,
      (p) => proFactsOf(p.academics, extraById.get(p.id)),
    );
    const profiles = proOutcome.items;
    if (proActive) {
      data.pro.colleges = proOutcome.options;
      data.pro.hiddenNoScore = proOutcome.hiddenNoScore;
      data.pro.approxKept = proOutcome.approxKept;
    }

    // Roles students saved for this project (OA3). Optional: a failed read
    // only drops the "Interested in this role" boost, never the list.
    data.saved = savedP ? await savedP : new Set<string>();

    // A sort the employer picked leads; otherwise saved roles do. Skill and
    // city matches then break ties (bug sheet 21 Oct). Initials, never the name.
    const ranked = proOutcome.order(rankProfiles(profiles, {
      sorts: filters.sorts,
      dir: filters.dir,
      skillTerms,
      skillPriority: filters.skillPriority,
      cities: cityList,
      saved: data.saved,
      projectSkills: data.activeProjectSkills,
    }));

    data.total = ranked.length;
    if (opts.countOnly) return data;
    const paged = pageWindow(data.total, filters.page, filters.pageSize);
    data.pages = paged.pages;
    data.candidates = ranked.slice(paged.start, paged.end);
    // Photos, plans, offer relations and presence only need the page's candidates: one round trip, not four.
    const pageIds = data.candidates.map((c) => c.id);
    const [, plans, relations, presence] = await Promise.all([
      attachPhotos(db, data.candidates),
      plansP ?? Promise.resolve([] as typeof data.plans),
      candidateRelations(db, uid, pageIds, activeProjectId),
      // Labels like "Active now" / "Last seen 2h ago"; hidden candidates get null (lib/presence.ts). Optional, like the saved roles.
      presenceOf(pageIds).catch((err) => {
        console.error("[employer/candidates] presence", err);
        return {};
      }),
    ]);
    data.plans = plans;
    data.relations = relations;
    data.presence = presence;
  } catch (err) {
    console.error("[employer/candidates] load failed", err);
    data.loadFailed = true;
  }
  return data;
}

