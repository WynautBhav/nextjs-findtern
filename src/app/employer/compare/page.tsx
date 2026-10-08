import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, eq, inArray } from "drizzle-orm";
import {
  ArrowLeft,
  Briefcase,
  Check,
  CircleGauge,
  Minus,
  Scale,
  Send,
  X,
} from "lucide-react";

import { getDb, schema } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { bandFor } from "@/lib/score";
import { formatRate } from "@/lib/format";
import {
  RATING_META,
  toCandidateProfile,
  type CandidateProfile,
} from "@/lib/employer-candidates";
import { resolvePricing } from "@/lib/employer-pricing";
import { ShortlistToggle } from "@/components/employer/shortlist-toggle";
import { PageHeader, EmptyState } from "@/components/layout/page-header";

export const metadata: Metadata = {
  title: "Compare candidates",
  robots: { index: false, follow: false },
};

const MAX_COLUMNS = 4;

export default async function CompareCandidates({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string | string[]; project?: string | string[] }>;
}) {
  const session = await getSession();
  const { ids: idsParam, project: projectParamRaw } = await searchParams;
  const raw = Array.isArray(idsParam) ? idsParam.join(",") : (idsParam ?? "");
  const projectParam = Array.isArray(projectParamRaw) ? projectParamRaw[0] : projectParamRaw;

  const ids = Array.from(
    new Set(
      raw
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean),
    ),
  ).slice(0, MAX_COLUMNS);

  let candidates: CandidateProfile[] = [];
  let currency: "INR" | "USD" = "INR";
  let projects: { id: string; projectName: string; skills: unknown }[] = [];
  let activeProject: { id: string; projectName: string; skills: unknown } | null = null;
  let shortlisted = new Set<string>();

  if (session?.uid) {
    try {
      const db = getDb();

      // Fetch projects for project requirements comparison
      projects = await db
        .select({
          id: schema.projects.id,
          projectName: schema.projects.projectName,
          skills: schema.projects.skills,
        })
        .from(schema.projects)
        .where(eq(schema.projects.employerId, session.uid))
        .orderBy(asc(schema.projects.projectName));

      activeProject =
        (projectParam && projects.find((p) => p.id === projectParam)) ||
        projects[0] ||
        null;

      if (activeProject) {
        const cartRows = await db
          .select({ internId: schema.employerCartItems.internId })
          .from(schema.employerCartItems)
          .where(
            and(
              eq(schema.employerCartItems.employerId, session.uid),
              eq(schema.employerCartItems.projectId, activeProject.id),
              eq(schema.employerCartItems.listType, "cart"),
            ),
          );
        shortlisted = new Set(cartRows.map((r) => r.internId));
      }

      if (ids.length > 0) {
        const rows = await db
          .select()
          .from(schema.users)
          .where(and(inArray(schema.users.id, ids), eq(schema.users.isActive, true)));

        const byId = new Map(rows.map((row) => [row.id, row]));

        const onboardingRows = rows.length
          ? await db
              .select()
              .from(schema.internOnboarding)
              .where(inArray(schema.internOnboarding.userId, rows.map((row) => row.id)))
          : [];
        const onboardingByUser = new Map(
          onboardingRows.map((row) => [row.userId, row] as const),
        );

        candidates = ids
          .map((id) => byId.get(id))
          .filter((row): row is NonNullable<typeof row> => Boolean(row))
          .map((row) => toCandidateProfile(row, onboardingByUser.get(row.id)));

        const [employer] = await db
          .select({ phoneNumber: schema.employers.phoneNumber })
          .from(schema.employers)
          .where(eq(schema.employers.id, session.uid))
          .limit(1);
        currency = employer?.phoneNumber?.startsWith("91") ? "INR" : "USD";
      }
    } catch {
      // DB fallback
    }
  }

  if (candidates.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader title="Compare candidates" subtitle="Put up to four side by side." />
        <EmptyState
          title="Nothing to compare yet"
          body="Tick Compare on rows in the candidate browser and the selection arrives here as ?ids=…, so this page is shareable."
        />
        <Link
          href="/employer/candidates"
          className="inline-flex h-11 items-center gap-2 rounded-xl bg-brand-700 px-5 text-sm font-semibold text-white shadow-2xs transition-colors hover:bg-brand-600"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Browse candidates
        </Link>
      </div>
    );
  }

  const projectSkills = (Array.isArray(activeProject?.skills) ? activeProject.skills : []) as string[];

  function removeCandidateHref(idToRemove: string): string {
    const nextIds = ids.filter((id) => id !== idToRemove);
    const search = new URLSearchParams();
    if (nextIds.length > 0) search.set("ids", nextIds.join(","));
    if (activeProject) search.set("project", activeProject.id);
    const q = search.toString();
    return q ? `/employer/compare?${q}` : "/employer/compare";
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Link
          href="/employer/candidates"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 transition-colors hover:underline"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Back to candidates
        </Link>

        {/* Project Selector Form */}
        {projects.length > 0 ? (
          <form method="get" className="flex items-center gap-2">
            <input type="hidden" name="ids" value={ids.join(",")} />
            <label htmlFor="compare-project" className="text-xs font-medium text-ink-600">
              Benchmark against:
            </label>
            <select
              id="compare-project"
              name="project"
              defaultValue={activeProject?.id ?? ""}
              aria-label="Benchmark project"
              className="h-9 rounded-lg border border-ink-200 bg-white px-3 text-xs font-medium text-ink-800 shadow-2xs outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.projectName}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="inline-flex h-9 items-center rounded-lg bg-ink-100 px-3 text-xs font-semibold text-ink-800 transition-colors hover:bg-ink-200"
            >
              Apply
            </button>
          </form>
        ) : null}
      </div>

      <PageHeader
        title={`Comparing ${candidates.length} candidate${candidates.length === 1 ? "" : "s"}`}
        subtitle="Side-by-side competency scorecard and project requirements alignment. The leader in each category is highlighted."
      />

      {/* Compare Table */}
      <div className="overflow-x-auto rounded-2xl border border-ink-100 bg-white shadow-2xs">
        <table className="w-full min-w-[46rem] border-separate border-spacing-0 text-left">
          <caption className="sr-only">
            Candidate attributes compared side by side, with the highest value marked in each row.
          </caption>
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 top-0 z-30 w-48 bg-white/95 p-5 border-b border-r border-ink-100 backdrop-blur-md">
                <span className="text-2xs font-semibold uppercase tracking-[0.14em] text-text-subtle">
                  Candidate & Actions
                </span>
              </th>
              {candidates.map((candidate) => {
                const rate = resolvePricing(candidate.score, [], currency, null);
                return (
                  <th
                    key={candidate.id}
                    scope="col"
                    className="min-w-64 p-5 align-top border-b border-r border-ink-100 last:border-r-0 bg-white/95 backdrop-blur-md sticky top-0 z-20"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-3">
                        <span
                          aria-hidden
                          className="grid size-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand-950 via-brand-900 to-teal-950 font-bold text-white shadow-2xs text-sm ring-1 ring-white/10"
                        >
                          {candidate.initials}
                        </span>
                        <div className="min-w-0">
                          <Link
                            href={`/employer/intern/${encodeURIComponent(candidate.id)}`}
                            className="font-semibold text-ink-900 underline-offset-4 hover:underline text-sm block truncate"
                          >
                            {candidate.fullName}
                          </Link>
                          <p className="mt-0.5 text-xs text-text-subtle truncate">
                            {candidate.location || "Location not stated"}
                          </p>
                          <p className="mt-1 text-xs font-semibold tabular-nums text-brand-700">
                            {formatRate(rate.hourlyRateMinor, currency)}
                          </p>
                        </div>
                      </div>

                      <Link
                        href={removeCandidateHref(candidate.id)}
                        title="Remove from comparison"
                        className="rounded-md p-1 text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-700"
                      >
                        <X className="size-4" />
                      </Link>
                    </div>

                    {/* Quick Action Buttons in Column Header */}
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <Link
                        href={`/employer/send-proposal?intern=${encodeURIComponent(candidate.id)}`}
                        className="inline-flex h-8 items-center gap-1 rounded-lg bg-brand-700 px-3 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-brand-600"
                      >
                        <Send className="size-3" />
                        <span>Proposal</span>
                      </Link>
                      {activeProject ? (
                        <ShortlistToggle
                          internId={candidate.id}
                          projectId={activeProject.id}
                          shortlisted={shortlisted.has(candidate.id)}
                          size="sm"
                        />
                      ) : null}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody className="divide-y divide-ink-100 [&_tr>th]:border-t [&_tr>th]:border-ink-100 [&_tr>td]:border-t [&_tr>td]:border-ink-100">
            {/* Project Requirement Match (if active project has skills) */}
            {projectSkills.length > 0 ? (
              <ProjectRequirementRow
                project={activeProject!}
                candidates={candidates}
                requiredSkills={projectSkills}
              />
            ) : null}

            <NumericRow
              label="Findtern Score"
              icon
              candidates={candidates}
              render={(candidate) => candidate.score}
              format={(value, candidate) =>
                candidate.scored ? `${value.toFixed(1)} / 10` : "Not scored"
              }
              emphasised
            />

            <Row label="Talent Tier & Band">
              {candidates.map((candidate) => {
                const band = bandFor(candidate.score);
                return (
                  <Cell key={candidate.id}>
                    <span className="inline-flex items-center rounded-full bg-brand-50 px-2.5 py-0.5 text-2xs font-semibold text-brand-700 border border-brand-200/50">
                      {band.name}
                    </span>
                    <span className="mt-1 block text-xs text-text-subtle leading-relaxed">
                      {band.blurb}
                    </span>
                  </Cell>
                );
              })}
            </Row>

            <Row label="Published Rate">
              {candidates.map((candidate) => {
                const rate = resolvePricing(candidate.score, [], currency, null);
                return (
                  <Cell key={candidate.id}>
                    <span className="text-sm font-semibold tabular-nums text-brand-800">
                      {formatRate(rate.hourlyRateMinor, currency)}
                    </span>
                    <span className="mt-0.5 block text-xs text-text-subtle">
                      {rate.perHireMinor > 0 ? "plus one-time hire fee" : "zero placement surcharge"}
                    </span>
                  </Cell>
                );
              })}
            </Row>

            {/* Assessment Dimensions */}
            {RATING_META.map((meta) => (
              <NumericRow
                key={meta.key}
                label={meta.label}
                candidates={candidates}
                render={(candidate) => candidate.ratings[meta.key]}
                format={(value) => (value > 0 ? `${value.toFixed(1)} / 10` : "Not assessed")}
              />
            ))}

            <NumericRow
              label="Total Skills Verified"
              candidates={candidates}
              render={(candidate) => candidate.skills.length}
              format={(value) => `${value} skills`}
            />

            <Row label="Work Modes">
              {candidates.map((candidate) => (
                <Cell key={candidate.id}>
                  {candidate.workModes.length > 0 ? (
                    <span className="capitalize">{candidate.workModes.join(", ")}</span>
                  ) : (
                    "—"
                  )}
                </Cell>
              ))}
            </Row>

            <Row label="Preferred Locations">
              {candidates.map((candidate) => (
                <Cell key={candidate.id}>
                  {candidate.preferredLocations.length > 0
                    ? candidate.preferredLocations.join(", ")
                    : "—"}
                </Cell>
              ))}
            </Row>

            <Row label="Hardware Status">
              {candidates.map((candidate) => (
                <Cell key={candidate.id}>
                  {candidate.hasLaptop === null
                    ? "Not stated"
                    : candidate.hasLaptop
                    ? "Dedicated Work Laptop"
                    : "Requires Laptop Provisioning"}
                </Cell>
              ))}
            </Row>

            <Row label="Education & College">
              {candidates.map((candidate) => (
                <Cell key={candidate.id}>
                  <p className="font-semibold text-ink-900">
                    {candidate.academics?.institution || "—"}
                  </p>
                  <p className="mt-0.5 text-xs text-text-subtle">
                    {[candidate.academics?.degree, candidate.academics?.specialization]
                      .filter(Boolean)
                      .join(" - ") || "—"}
                  </p>
                  {candidate.academics?.score ? (
                    <p className="mt-1 text-xs tabular-nums text-ink-700">
                      Score: {candidate.academics.score} {candidate.academics.scoreType || ""}
                    </p>
                  ) : null}
                </Cell>
              ))}
            </Row>

            <SkillsMatrix candidates={candidates} />

            <Row label="Profile Last Updated">
              {candidates.map((candidate) => (
                <Cell key={candidate.id}>
                  {candidate.updatedAt
                    ? new Date(candidate.updatedAt).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })
                    : "Never"}
                </Cell>
              ))}
            </Row>
          </tbody>
        </table>
      </div>

      <p className="flex items-start gap-2 rounded-xl border border-ink-100 bg-ink-50 px-4 py-3 text-xs leading-relaxed text-ink-600">
        <Scale className="mt-0.5 size-3.5 shrink-0 text-ink-400" aria-hidden />
        <span>
          Candidates ranked with verified Findtern scoring benchmarks. Benchmark rates reflect standard platform tiers; custom proposals may be negotiated per project scope.
        </span>
      </p>
    </div>
  );
}

/* ── Table Components ────────────────────────────────────────────────────── */

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <tr>
      <th
        scope="row"
        className="sticky left-0 z-10 bg-white/95 backdrop-blur-xs p-4 text-left align-top text-xs font-semibold text-ink-700 border-r border-ink-100"
      >
        {label}
      </th>
      {children}
    </tr>
  );
}

function Cell({ children }: { children: React.ReactNode }) {
  return (
    <td className="p-4 align-top text-xs leading-relaxed text-ink-800 border-r border-ink-100/60 last:border-r-0">{children}</td>
  );
}

function NumericRow({
  label,
  candidates,
  render,
  format,
  emphasised,
  icon,
}: {
  label: string;
  candidates: CandidateProfile[];
  render: (candidate: CandidateProfile) => number;
  format: (value: number, candidate: CandidateProfile) => string;
  emphasised?: boolean;
  icon?: boolean;
}) {
  const values = candidates.map(render);
  const max = Math.max(...values, 0);
  const contested = values.filter((value) => value === max).length === 1 && max > 0;

  return (
    <tr>
      <th
        scope="row"
        className="sticky left-0 z-10 bg-white/95 backdrop-blur-xs p-4 text-left align-top text-xs font-semibold text-ink-700 border-r border-ink-100"
      >
        <span className="flex items-center gap-1.5">
          {icon ? <CircleGauge className="size-3.5 shrink-0 text-brand-600" aria-hidden /> : null}
          {label}
        </span>
      </th>
      {candidates.map((candidate, i) => {
        const value = values[i];
        const leader = contested && value === max;
        return (
          <td
            key={candidate.id}
            className={`p-4 align-top transition-colors border-r border-ink-100/60 last:border-r-0 ${
              leader ? "bg-emerald-50/30" : ""
            }`}
          >
            <div className="flex items-center gap-2">
              <span
                className={[
                  "tabular-nums",
                  emphasised ? "text-base font-bold tracking-tight" : "text-xs font-semibold",
                  leader ? "text-emerald-800" : "text-ink-900",
                ].join(" ")}
              >
                {format(value, candidate)}
              </span>
              {leader ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-3xs font-semibold text-emerald-700 ring-1 ring-emerald-600/20">
                  <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Top
                </span>
              ) : null}
            </div>
          </td>
        );
      })}
    </tr>
  );
}

function ProjectRequirementRow({
  project,
  candidates,
  requiredSkills,
}: {
  project: { projectName: string };
  candidates: CandidateProfile[];
  requiredSkills: string[];
}) {
  const matches = candidates.map((candidate) => {
    const candidateSkillsLower = new Set(
      candidate.skills.map((s) => s.split("·")[0].trim().toLowerCase()),
    );
    const matched = requiredSkills.filter((req) =>
      candidateSkillsLower.has(req.toLowerCase()),
    );
    const pct = Math.round((matched.length / requiredSkills.length) * 100);
    return { matched, pct };
  });

  const bestPct = Math.max(...matches.map((m) => m.pct), 0);

  return (
    <tr className="bg-brand-50/30">
      <th
        scope="row"
        className="sticky left-0 z-10 bg-brand-50/70 backdrop-blur-xs p-4 text-left align-top text-xs font-semibold text-brand-900 border-r border-ink-100"
      >
        <span className="flex items-center gap-1.5">
          <Briefcase className="size-3.5 text-brand-600 shrink-0" />
          <span>Project Fit</span>
        </span>
        <span className="mt-1 block text-2xs font-normal text-brand-700">
          {project.projectName} ({requiredSkills.length} required)
        </span>
      </th>
      {candidates.map((candidate, i) => {
        const { matched, pct } = matches[i];
        const isBest = pct === bestPct && bestPct > 0;
        return (
          <td key={candidate.id} className="p-4 align-top border-r border-ink-100/60 last:border-r-0">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-bold tabular-nums text-brand-800">
                {pct}% Match
              </span>
              <span className="text-2xs font-medium text-text-subtle">
                {matched.length}/{requiredSkills.length} skills
              </span>
            </div>
            <div className="mt-1.5 h-2 w-full rounded-full bg-ink-200 overflow-hidden">
              <div
                className="h-full rounded-full bg-brand-600 transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
            {matched.length > 0 ? (
              <ul className="mt-2 flex flex-wrap gap-1">
                {matched.map((skill) => (
                  <li
                    key={skill}
                    className="rounded-xs bg-brand-100/80 px-1.5 py-0.5 text-3xs font-medium text-brand-800 border border-brand-200/60"
                  >
                    ✓ {skill}
                  </li>
                ))}
              </ul>
            ) : null}
            {isBest ? (
              <span className="mt-1.5 inline-block text-2xs font-semibold text-brand-700">
                Best Project Match
              </span>
            ) : null}
          </td>
        );
      })}
    </tr>
  );
}

function SkillsMatrix({ candidates }: { candidates: CandidateProfile[] }) {
  const vocabulary = Array.from(
    new Set(
      candidates.flatMap((candidate) =>
        candidate.skills.map((skill) => skill.split("·")[0].trim()).filter(Boolean),
      ),
    ),
  ).sort((a, b) => a.localeCompare(b));

  if (vocabulary.length === 0) {
    return (
      <tr>
        <th
          scope="row"
          className="sticky left-0 z-10 bg-white p-4 text-left align-top text-xs font-medium text-text-subtle"
        >
          Skills
        </th>
        {candidates.map((candidate) => (
          <Cell key={candidate.id}>—</Cell>
        ))}
      </tr>
    );
  }

  const matched = candidates.map((candidate) =>
    new Set(candidate.skills.map((skill) => skill.split("·")[0].trim().toLowerCase())),
  );
  const counts = matched.map(
    (set) => vocabulary.filter((skill) => set.has(skill.toLowerCase())).length,
  );
  const best = Math.max(...counts, 0);
  const contested = counts.filter((count) => count === best).length === 1 && best > 0;

  return (
    <tr>
      <th
        scope="row"
        className="sticky left-0 z-10 bg-white/95 backdrop-blur-xs p-4 text-left align-top text-xs font-semibold text-ink-700 border-r border-ink-100"
      >
        <span>All Skills Coverage</span>
        <span className="mt-1 block text-2xs font-normal text-ink-400">
          {vocabulary.length} combined
        </span>
      </th>
      {candidates.map((candidate, i) => {
        const has = matched[i];
        const count = counts[i];
        const leader = contested && count === best;
        return (
          <td key={candidate.id} className="p-4 align-top border-r border-ink-100/60 last:border-r-0">
            <ul className="space-y-1">
              {vocabulary.map((skill) => {
                const on = has.has(skill.toLowerCase());
                return (
                  <li
                    key={skill}
                    className={[
                      "flex items-center gap-1.5 text-xs",
                      on ? "text-ink-800" : "text-ink-300",
                    ].join(" ")}
                  >
                    {on ? (
                      <Check className="size-3 shrink-0 text-brand-600" aria-hidden />
                    ) : (
                      <Minus className="size-3 shrink-0 text-ink-300" aria-hidden />
                    )}
                    <span className={on ? "font-medium" : "line-through decoration-ink-200"}>
                      {skill}
                    </span>
                  </li>
                );
              })}
            </ul>
            <span className="mt-2 block text-2xs text-text-subtle">
              {count} of {vocabulary.length}
              {leader ? " — widest coverage" : ""}
            </span>
          </td>
        );
      })}
    </tr>
  );
}
