import type { Metadata } from "next";
import Link from "next/link";
import {and, asc, desc, eq, sql } from "drizzle-orm";
import { Filter, MapPin, Scale, Search, SlidersHorizontal, X } from "lucide-react";

import { getDb, schema } from "@/lib/db";
import { getSession } from "@/lib/auth";
import {
  toCandidateProfile,
  type CandidateProfile,
} from "@/lib/employer-candidates";
import type { Currency } from "@/lib/employer-pricing";
import { SkillFilter } from "@/components/employer/skill-filter";
import { CandidateCard } from "@/components/employer/candidate-card";
import { PageHeader, EmptyState } from "@/components/layout/page-header";

export const metadata: Metadata = {
  title: "Candidates",
  robots: { index: false, follow: false },
};

/** Hard ceiling on a page of results. Beyond this the filter needs to be tighter. */
const PAGE_SIZE = 24;

type Filters = {
  q: string;
  skills: string[];
  city: string;
  mode: string;
  minScore: number;
  page: number;
  project?: string;
};

/**
 * Candidate browser.
 *
 * This is the feature the 5,761-line legacy `employer-dashboard.tsx` existed
 * for: rank the pool by Findtern Score and filter it. The legacy version held
 * the filters in component state, debounced a text query through a command
 * palette, and re-derived the price inline on every keystroke.
 *
 * Here the filters are URL search params, so a search is shareable, the back
 * button works, and the ranking happens once in SQL-adjacent code rather than on
 * every render. Three constraints shape the rest of it:
 *
 *   1. Ranking is by `extra_data.findternScore`, which lives in jsonb with no
 *      index, so the sort happens in memory after a bounded fetch. That is fine
 *      at this scale and would not be at 10x — the honest fix is a generated
 *      column, which is a migration, not a page.
 *   2. Unscored candidates are kept and sorted last. Dropping them would hide
 *      every intern who has not been assessed yet, which is most of a new pool.
 *   3. Skills are matched with `ILIKE` over the jsonb array text. Same caveat:
 *      correct, unindexed.
 *
 * This is a pool screen. It shows name, location, score, skills — the same slice
 * `CandidateSummary` describes. `/employer/intern/[id]` is the screen that opens
 * up, and it holds the stricter bar.
 */

export default async function CandidatesPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string | string[];
    skills?: string | string[];
    city?: string | string[];
    mode?: string | string[];
    min?: string | string[];
    ids?: string | string[];
    page?: string | string[];
    project?: string | string[];
  }>;
}) {
  const session = await getSession();
  const uid = session!.uid;
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

  try {
    const db = getDb();

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
      .select({ phoneNumber: schema.employers.phoneNumber })
      .from(schema.employers)
      .where(eq(schema.employers.id, uid))
      .limit(1);
    region = employer?.phoneNumber?.startsWith("91") ? "IN" : null;
    currency = region === "IN" ? "INR" : "USD";

    // `extra_data->>'findternScore'` is what the sort runs on. Casting is safe
    // for anything the jsonb writer put there; a non-numeric value yields null
    // and sorts last with the unscored.
    const clauses = [eq(schema.users.isActive, true)];

    if (filters.q) {
      const needle = `%${filters.q}%`;
      clauses.push(
        sql`(${schema.users.firstName} || ' ' || ${schema.users.lastName}) ILIKE ${needle}`,
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
    // server read only the newest row per intern — so a duplicate would render
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

    // Score first, then name — a stable order matters when two candidates share
    // a score and pagination would otherwise reshuffle them between pages.
    profiles.sort((a, b) => b.score - a.score || a.fullName.localeCompare(b.fullName));

    total = profiles.length;
    pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const start = (Math.min(filters.page, pages) - 1) * PAGE_SIZE;
    candidates = profiles.slice(start, start + PAGE_SIZE);
  } catch {
    // DB unavailable — the filter form still renders and the list shows its
    // empty state, which is what a missing DATABASE_URL should look like.
    loadFailed = true;
  }

  return (
    <div>
      <PageHeader
        title="Candidates"
        subtitle={`${total === 0 ? "No" : total} intern${total === 1 ? "" : "s"} in the pool, ranked by Findtern Score.`}
      />

      <form method="get" className="mb-6 rounded-2xl border border-ink-200/80 bg-white/90 p-5 shadow-xs backdrop-blur-sm">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.2fr)_11rem_9rem_8.5rem_11rem_auto]">
          <TextQuery defaultValue={filters.q} />
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
            <div />
          )}
          <div className="flex items-end gap-2">
            <button
              type="submit"
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-brand-700 px-5 text-sm font-semibold text-white shadow-xs transition-[background-color,transform] hover:bg-brand-600 active:scale-[0.98]"
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
            className="text-xs font-medium text-ink-500 underline-offset-4 hover:text-ink-900 hover:underline"
          >
            Clear
          </Link>
          <Link
            href={compareHref(filters, compareIds)}
            className="inline-flex h-8 items-center gap-1.5 rounded-full bg-brand-700 px-4 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-brand-600"
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
              ? "The database is not reachable from this page. Nothing is wrong with the filter — try again once the connection is back."
              : "Widen the score floor, drop a skill, or clear the city. New interns appear as soon as they finish onboarding."
          }
        />
      ) : (
        <>
          <p className="mb-3 flex items-center gap-1.5 text-xs text-text-subtle">
            <Filter className="size-3.5" aria-hidden />
            Showing {(Math.min(filters.page, pages) - 1) * PAGE_SIZE + 1}–
            {(Math.min(filters.page, pages) - 1) * PAGE_SIZE + candidates.length} of {total}.
          </p>

          <ul className="grid gap-3 lg:grid-cols-2">
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
              />
            ))}
          </ul>

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
                        "inline-flex size-9 items-center justify-center rounded-lg text-sm font-medium transition-colors",
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

      <p className="mt-6 text-xs leading-relaxed text-text-subtle">
        The pool is capped at 500 rows per request and ranked in memory, because{" "}
        <code className="font-mono">extra_data-&gt;&gt;&apos;findternScore&apos;</code> has no index.
        That is the right trade at this size and the wrong one at ten times it — the fix is a
        generated column and an index, which is a migration rather than a page.
      </p>
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
  page?: string | string[];
  project?: string | string[];
}): Filters {
  const min = Number(one(params.min) ?? "0");
  const page = Number(one(params.page) ?? "1");
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
 * that filter — otherwise there would be no way to clear one from a chip link.
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
    filters.q || filters.city || filters.mode || filters.minScore > 0 || filters.skills.length > 0;
  if (!active) return null;
  return (
    <Link
      href="/employer/candidates"
      className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-3.5 text-sm font-medium text-ink-700 transition-colors hover:bg-ink-50"
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
    <div>
      <label htmlFor={`filter-${name}`} className="block text-xs font-semibold text-ink-700">
        {label ?? "Name or keyword"}
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
          className="h-11 w-full rounded-xl border border-ink-200/90 bg-white/90 pl-10 pr-3.5 text-sm text-ink-900 shadow-2xs outline-none transition-[border-color,box-shadow] placeholder:text-ink-400 focus-visible:border-brand-600 focus-visible:ring-2 focus-visible:ring-brand-600/20"
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
    <div>
      <label htmlFor={`filter-${name}`} className="block text-xs font-semibold text-ink-700">
        {label}
      </label>
      <div className="relative mt-2">
        <select
          id={`filter-${name}`}
          name={name}
          defaultValue={defaultValue}
          className="h-11 w-full appearance-none rounded-xl border border-ink-200/90 bg-white/90 px-3.5 pr-8 text-sm text-ink-900 shadow-2xs outline-none transition-[border-color,box-shadow] focus-visible:border-brand-600 focus-visible:ring-2 focus-visible:ring-brand-600/20"
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
