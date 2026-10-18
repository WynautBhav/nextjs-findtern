import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, desc, eq, sql } from "drizzle-orm";
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
  toCandidateProfile,
  type CandidateProfile,
} from "@/lib/employer-candidates";
import { hiredInternIds } from "@/lib/employer-visibility";
import { employerRegion, type Currency } from "@/lib/employer-pricing";
import { SkillFilter } from "@/components/employer/skill-filter";
import { CandidateCard } from "@/components/employer/candidate-card";
import { PageHeader, EmptyState } from "@/components/layout/page-header";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Candidates",
  robots: { index: false, follow: false },
};

type Filters = {
  q: string;
  skills: string[];
  city: string;
  mode: string;
  minScore: number;
  laptop: string;
  view: "grid" | "list" | "table";
  pageSize: number;
  page: number;
  project?: string;
};

export default async function CandidatesPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string | string[];
    skills?: string | string[];
    city?: string | string[];
    mode?: string | string[];
    min?: string | string[];
    laptop?: string | string[];
    view?: string | string[];
    pageSize?: string | string[];
    ids?: string | string[];
    page?: string | string[];
    project?: string | string[];
  }>;
}) {
  const session = await requireRole("employer");
  const uid = session.uid;
  const params = await searchParams;

  const filters = readFilters(params);
  const compareIds = (one(params.ids) ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
    .slice(0, 4);

  let candidates: CandidateProfile[] = [];
  let total = 0;
  let pages = 1;
  let currency: Currency = "INR";
  let region: "IN" | null = null;
  let loadFailed = false;

  let projects: { id: string; projectName: string }[] = [];
  let shortlisted = new Set<string>();
  let activeProjectId: string | null = null;
  let nameUnlocked = new Set<string>();

  try {
    const db = getDb();

    // Names stay redacted until this employer hires the intern.
    try {
      nameUnlocked = await hiredInternIds(db, uid);
    } catch {
      nameUnlocked = new Set<string>();
    }

    // A shortlist is keyed on (project, candidate), so the page needs a project
    // to shortlist against. This mirrors the legacy page's project selector.
    projects = await db
      .select({ id: schema.projects.id, projectName: schema.projects.projectName })
      .from(schema.projects)
      .where(eq(schema.projects.employerId, uid))
      .orderBy(asc(schema.projects.projectName));
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

    // `extra_data->>'findternScore'` is what the sort runs on. Casting is safe
    // for anything the jsonb writer put there; a non-numeric value yields null
    // and sorts last with the unscored.
    const clauses = [eq(schema.users.isActive, true)];

    if (filters.q) {
      // Keyword only - never a name. Employers browse a redacted pool, so the
      // query matches skills, bio and city. Matching on name would let anyone
      // probe whether a specific person is on the platform.
      const needle = `%${filters.q}%`;
      clauses.push(
        sql`(${schema.internOnboarding.skills}::text ILIKE ${needle} OR ${schema.internOnboarding.bio} ILIKE ${needle} OR ${schema.internOnboarding.city} ILIKE ${needle})`,
      );
    }

    // Every required skill has to appear somewhere in the jsonb array. AND-ed
    // rather than OR-ed so "React + TypeScript" means both, not either.
    for (const skill of filters.skills) {
      clauses.push(
        sql`(${schema.internOnboarding.skills})::text ILIKE ${`%${skill}%`}`,
      );
    }

    if (filters.city) {
      clauses.push(
        sql`lower(${schema.internOnboarding.city}) LIKE ${`%${filters.city.toLowerCase()}%`}`,
      );
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
      clauses.push(
        sql`COALESCE((${schema.internOnboarding.extraData}->>'findternScore')::float8, 0) >= ${filters.minScore}`,
      );
    }

    // Hidden profiles stay out of the pool. A missing flag counts as visible,
    // so interns who never saw the toggle keep showing up.
    clauses.push(
      sql`(${schema.internOnboarding.userId} IS NULL OR COALESCE((${schema.internOnboarding.extraData}->>'openToWork'), 'true') <> 'false')`,
    );

    // Bounded fetch: the ranking happens in memory, so the ceiling has to be
    // here rather than after the sort.
    const rows = await db
      .select({ user: schema.users, onboarding: schema.internOnboarding })
      .from(schema.users)
      .leftJoin(
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
      .map((row) => toCandidateProfile(row.user, row.onboarding));

    // Score first, then initials - a stable order matters when two candidates share
    // a score and pagination would otherwise reshuffle them between pages.
    // (Initials, never the name: the pool is redacted until hire.)
    profiles.sort(
      (a, b) =>
        b.score - a.score || a.initials.localeCompare(b.initials) || a.id.localeCompare(b.id),
    );

    total = profiles.length;
    pages = Math.max(1, Math.ceil(total / filters.pageSize));
    const start = (Math.min(filters.page, pages) - 1) * filters.pageSize;
    candidates = profiles.slice(start, start + filters.pageSize);
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
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-[minmax(0,1.2fr)_9.5rem_8rem_7.5rem_7.5rem_minmax(12rem,1fr)_auto]">
          <TextQuery
            defaultValue={filters.q}
            label="Keyword"
            placeholder="Skill, bio, or city…"
          />
          <TextQuery name="city" label="City" defaultValue={filters.city} placeholder="Bengaluru" />
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
            options={[
              { value: "", label: "Any score" },
              { value: "4", label: "4.0+ Top 70%" },
              { value: "6", label: "6.0+ Top 40%" },
              { value: "8", label: "8.0+ Top 10%" },
            ]}
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

        <SkillFilter active={filters.skills} />
      </form>

      {compareIds.length >= 2 ? (
        <div className="fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3.5 rounded-full border border-brand-200/80 bg-white/95 px-5 py-2.5 shadow-2xl backdrop-blur-md">
          <div className="flex items-center gap-2">
            <span className="relative flex size-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-400 opacity-75" />
              <span className="relative inline-flex size-2.5 rounded-full bg-brand-600" />
            </span>
            <span className="text-xs font-semibold text-ink-900">
              {compareIds.length} candidates selected
            </span>
          </div>
          <div className="h-4 w-px bg-ink-200" />
          <Link
            href="/employer/candidates"
            className="apple-spring text-[13px] font-medium text-ink-500 underline-offset-4 hover:text-ink-900 hover:underline"
          >
            Clear
          </Link>
          <Link
            href={compareHref(filters, compareIds)}
            className="apple-spring apple-pressable inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full bg-brand-700 px-4 text-[13px] font-semibold text-white shadow-xs hover:bg-brand-600"
          >
            <Scale className="size-3.5" aria-hidden />
            Compare Side-by-Side
          </Link>
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
                      : "text-ink-500 hover:text-ink-900",
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
                      : "text-ink-500 hover:text-ink-900",
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
                      : "text-ink-500 hover:text-ink-900",
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
                            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-50 text-xs font-bold text-brand-700 ring-1 ring-brand-600/20">
                              {c.initials}
                            </span>
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
                              <span className="text-2xs text-ink-400">/10</span>
                            </span>
                          ) : (
                            <span className="text-2xs text-ink-400">Unscored</span>
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
                            <span className="text-2xs text-ink-400">-</span>
                          )}
                        </td>
                        <td className="px-5 py-3.5 max-w-[220px]">
                          <div className="flex flex-wrap gap-1">
                            {c.skills.slice(0, 3).map((s) => (
                              <span key={s} className="rounded-md bg-ink-100 px-1.5 py-0.5 text-2xs font-medium text-ink-700 truncate max-w-[100px]">
                                {s}
                              </span>
                            ))}
                            {c.skills.length > 3 ? (
                              <span className="text-2xs text-ink-400">+{c.skills.length - 3}</span>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Link
                              href={withFilters(filters, {
                                page: "",
                                ids: toggle(compareIds, c.id).join(","),
                              })}
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
                  candidate={candidate}
                  currency={currency}
                  region={region}
                  selected={compareIds.includes(candidate.id)}
                  compareHref={withFilters(filters, {
                    page: "",
                    ids: toggle(compareIds, candidate.id).join(","),
                  })}
                  projectId={activeProjectId}
                  shortlisted={shortlisted.has(candidate.id)}
                  nameUnlocked={nameUnlocked.has(candidate.id)}
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

function readFilters(params: {
  q?: string | string[];
  skills?: string | string[];
  city?: string | string[];
  mode?: string | string[];
  min?: string | string[];
  laptop?: string | string[];
  view?: string | string[];
  pageSize?: string | string[];
  page?: string | string[];
  project?: string | string[];
}): Filters {
  const min = Number(one(params.min) ?? "0");
  const page = Number(one(params.page) ?? "1");
  const ps = Number(one(params.pageSize) ?? "24");
  const pageSize = ps === 12 || ps === 48 ? ps : 24;
  const viewRaw = (one(params.view) ?? "").trim().toLowerCase();
  const view: "grid" | "list" | "table" =
    viewRaw === "list" || viewRaw === "table" ? viewRaw : "grid";

  return {
    q: (one(params.q) ?? "").trim().slice(0, 60),
    skills: (one(params.skills) ?? "")
      .split(",")
      .map((skill) => skill.trim())
      .filter(Boolean)
      .slice(0, 7),
    city: (one(params.city) ?? "").trim().slice(0, 60),
    mode: (one(params.mode) ?? "").trim(),
    minScore: Number.isFinite(min) && min > 0 ? min : 0,
    laptop: (one(params.laptop) ?? "").trim().toLowerCase(),
    view,
    pageSize,
    page: Number.isFinite(page) && page > 0 ? Math.floor(page) : 1,
    project: (one(params.project) ?? "").trim(),
  };
}

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function toggle(list: string[], value: string): string[] {
  const hit = list.some((entry) => entry.toLowerCase() === value.toLowerCase());
  return hit ? list.filter((entry) => entry.toLowerCase() !== value.toLowerCase()) : [...list, value];
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
  patch: Partial<Omit<Filters, "page">> & { page?: number | ""; ids?: string } = {},
): string {
  const page = patch.page === "" ? 1 : (patch.page ?? base.page);
  const merged: Filters = { ...base, ...patch, page };
  const next = new URLSearchParams();

  if (merged.q) next.set("q", merged.q);
  if (merged.skills.length > 0) next.set("skills", merged.skills.join(","));
  if (merged.city) next.set("city", merged.city);
  if (merged.mode) next.set("mode", merged.mode);
  if (merged.minScore > 0) next.set("min", String(merged.minScore));
  if (merged.laptop) next.set("laptop", merged.laptop);
  if (merged.view && merged.view !== "grid") next.set("view", merged.view);
  if (merged.pageSize && merged.pageSize !== 24) next.set("pageSize", String(merged.pageSize));
  if (merged.project) next.set("project", merged.project);
  if (merged.page > 1) next.set("page", String(merged.page));

  const query = next.toString();
  return query ? `/employer/candidates?${query}` : "/employer/candidates";
}

/** The compare selection rides along with the filters, not instead of them. */
function compareHref(filters: Filters, ids: string[]): string {
  const next = new URLSearchParams(withFilters(filters).split("?")[1] ?? "");
  if (ids.length > 0) next.set("ids", ids.join(","));
  const query = next.toString();
  return query ? `/employer/compare?${query}` : "/employer/compare";
}

function ActiveFilters({ filters }: { filters: Filters }) {
  const active =
    filters.q ||
    filters.city ||
    filters.mode ||
    filters.minScore > 0 ||
    filters.skills.length > 0 ||
    filters.laptop;
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
        <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-ink-400">
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
  label,
  defaultValue,
  options,
}: {
  name: string;
  label: string;
  defaultValue: string;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="min-w-0">
      <label htmlFor={`filter-${name}`} className="block text-xs font-semibold text-ink-700">
        {label}
      </label>
      <div className="relative mt-2">
        <select
          id={`filter-${name}`}
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
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-ink-400">
          <SlidersHorizontal className="size-3.5" aria-hidden />
        </div>
      </div>
    </div>
  );
}
