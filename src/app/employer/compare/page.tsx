import type { Metadata } from "next";
import { and, desc, eq, inArray } from "drizzle-orm";
import { ArrowLeft, Check, Minus } from "lucide-react";

import { getDb, schema } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { requireEmployerSetup } from "@/lib/employer-setup";
import { bandFor } from "@/lib/score";
import { formatDmy, formatMoney, formatRate } from "@/lib/format";
import { RATING_META, displayNameOf, preferredCities, toCandidateProfile, type CandidateProfile } from "@/lib/employer-candidates";
import { shortlistProjectsByIntern } from "@/lib/employer-shortlist";
import { candidateRelations, hiredInternIds, type CandidateRelation } from "@/lib/employer-visibility";
import { attachPhotos, visibleInternIds } from "@/lib/employer-pool";
import { Callout } from "@/components/app/layout-kit";
import { ScrollRegion } from "./scroll-region";
import { candidateStatusPill } from "@/components/employer/candidate-status";
import { employerRegion, resolvePricing, type Currency } from "@/lib/employer-pricing";
import { CompareHeadCell } from "@/components/employer/compare/head-cell";
import { CompareHero } from "@/components/employer/compare/compare-hero";
import { Cell, LeaderMark, MatrixRow, NumericRow, RatingBar, leaders } from "@/components/employer/compare/matrix";
import { SkillFilter } from "@/components/employer/skill-filter";
import { RememberSelection } from "@/components/employer/remember-selection";
import { MAX_COMPARE, isOpenProject, parseIds, rememberedSelection } from "@/lib/employer-selection";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import { EmptyScene, PageHead } from "@/components/app/primitives";
import { LoadError } from "@/components/app/load-error";
import { SITE } from "@/lib/content/site";
import { cn } from "@/lib/utils";
import { fieldClass } from "@/components/employer/ui-tokens";

export const metadata: Metadata = {
  title: "Compare candidates",
  robots: { index: false, follow: false },
};

type Search = { ids?: string | string[]; project?: string | string[]; skills?: string | string[] };

function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/**
 * Up to four candidates as a real comparison matrix: one column each, a
 * sticky header with the candidate and their next action, a sticky first
 * column of row labels, and the leader of every numeric row marked.
 *
 * Benchmarked against an open project (newest first, as the candidates page),
 * whose skills can be swapped here to re-score the match (EMB-25).
 */
export default async function CompareCandidates({ searchParams }: { searchParams: Promise<Search> }) {
  const session = await requireRole("employer");
  await requireEmployerSetup(session.uid);
  const sp = await searchParams;
  // Opened from the sidebar (no `ids`), compare shows the candidates ticked
  // on the candidates page, and benchmarks against the project picked there.
  const remembered = await rememberedSelection(session.uid);
  const projectParam = one(sp.project) || remembered.project || undefined;
  const ids = (sp.ids !== undefined ? parseIds(sp.ids) : remembered.compare).slice(0, MAX_COMPARE);
  const skillsSet = sp.skills !== undefined;
  const typedSkills = (one(sp.skills) ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 7);

  let candidates: CandidateProfile[] = [];
  let currency: Currency = "INR";
  let region: "IN" | null = null;
  let plans: (typeof schema.pricingPlans.$inferSelect)[] = [];
  let projects: { id: string; projectName: string; skills: unknown }[] = [];
  let activeProject: { id: string; projectName: string; skills: unknown } | null = null;
  let shortlisted = new Set<string>();
  let nameUnlocked = new Set<string>();
  let relations = new Map<string, CandidateRelation>();
  let shortlistedFor = new Map<string, string[]>();
  let loadFailed = false;

  try {
    const db = getDb();
    nameUnlocked = await hiredInternIds(db, session.uid);

    // Open projects only, newest first; the newest open one is the default
    // (EMB-04 / EMH-15).
    projects = (
      await db
        .select({
          id: schema.projects.id,
          projectName: schema.projects.projectName,
          skills: schema.projects.skills,
          status: schema.projects.status,
        })
        .from(schema.projects)
        .where(eq(schema.projects.employerId, session.uid))
        .orderBy(desc(schema.projects.createdAt))
    ).filter((p) => isOpenProject(p.status));
    activeProject = (projectParam && projects.find((p) => p.id === projectParam)) || projects[0] || null;

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
      // Only candidates this employer may open, minus anyone they already
      // hired - legacy dropped both from compare (employer-compare.tsx:550).
      const [visible, rel] = await Promise.all([
        visibleInternIds(db, session.uid, ids),
        candidateRelations(db, session.uid, ids),
      ]);
      relations = rel;
      // Compare is shared across projects but a shortlist is per project, so say where each one already sits.
      shortlistedFor = shortlistProjectsByIntern(
        await db
          .select({ internId: schema.employerCartItems.internId, projectName: schema.projects.projectName })
          .from(schema.employerCartItems)
          .innerJoin(schema.projects, eq(schema.projects.id, schema.employerCartItems.projectId))
          .where(
            and(
              eq(schema.employerCartItems.employerId, session.uid),
              eq(schema.employerCartItems.listType, "cart"),
              inArray(schema.employerCartItems.internId, ids),
            ),
          ),
      );
      const comparable = ids.filter((id) => visible.has(id) && !rel.get(id)?.hired);
      const rows = comparable.length
        ? await db
            .select()
            .from(schema.users)
            .where(and(inArray(schema.users.id, comparable), eq(schema.users.isActive, true), eq(schema.users.role, "intern")))
        : [];
      const onboardingRows = rows.length
        ? await db
            .select()
            .from(schema.internOnboarding)
            .where(inArray(schema.internOnboarding.userId, rows.map((row) => row.id)))
            .orderBy(desc(schema.internOnboarding.updatedAt))
        : [];
      // Newest onboarding row per intern (the table has no unique user index).
      const onboardingByUser = new Map<string, (typeof onboardingRows)[number]>();
      for (const row of onboardingRows) if (!onboardingByUser.has(row.userId)) onboardingByUser.set(row.userId, row);
      const byId = new Map(rows.map((row) => [row.id, row]));
      candidates = ids
        .map((id) => byId.get(id))
        .filter((row): row is NonNullable<typeof row> => Boolean(row))
        .map((row) => toCandidateProfile(row, onboardingByUser.get(row.id)));
      await attachPhotos(db, candidates);

      plans = await db.select().from(schema.pricingPlans).where(eq(schema.pricingPlans.isActive, true));
      const [employer] = await db
        .select({
          country: schema.employers.country,
          countryCode: schema.employers.countryCode,
          phoneNumber: schema.employers.phoneNumber,
        })
        .from(schema.employers)
        .where(eq(schema.employers.id, session.uid))
        .limit(1);
      region = employerRegion(employer ?? {});
      currency = region === "IN" ? "INR" : "USD";
    }
  } catch (err) {
    console.error("[employer/compare] load failed", err);
    loadFailed = true;
  }

  const projectSkills = ((Array.isArray(activeProject?.skills) ? activeProject.skills : []) as string[]).filter(Boolean).slice(0, 7);
  const requiredSkills = skillsSet ? typedSkills : projectSkills;
  const backHref = `/employer/candidates?ids=${encodeURIComponent(ids.join(","))}${activeProject ? `&project=${encodeURIComponent(activeProject.id)}` : ""}`;

  if (loadFailed) {
    const retryQs = new URLSearchParams();
    if (sp.ids !== undefined) retryQs.set("ids", one(sp.ids) ?? "");
    if (sp.project !== undefined) retryQs.set("project", one(sp.project) ?? "");
    if (sp.skills !== undefined) retryQs.set("skills", one(sp.skills) ?? "");
    const retryHref = `/employer/compare${retryQs.size ? `?${retryQs}` : ""}`;
    return (
      <div>
        <PageHead title="Compare candidates" />
        <LoadError what="the comparison" retryHref={retryHref} email={SITE.adminEmail} />
      </div>
    );
  }

  if (candidates.length === 0) {
    return (
      <div>
        <RememberSelection employerId={session.uid} compare={ids} />
        <PageHead title="Compare candidates" lede={`Put up to ${MAX_COMPARE} candidates side by side.`} />
        <EmptyScene
          title="Nothing to compare yet"
          body="Tick Compare on two to four candidates in the candidate list, then open them here side by side."
          next={{ label: "Browse candidates", href: "/employer/candidates" }}
          who="You - pick at least two"
        />
      </div>
    );
  }

  function removeHref(idToRemove: string): string {
    const search = new URLSearchParams();
    // Even empty: an emptied list must not fall back to the remembered one.
    search.set("ids", ids.filter((id) => id !== idToRemove).join(","));
    if (activeProject) search.set("project", activeProject.id);
    if (skillsSet) search.set("skills", typedSkills.join(","));
    return `/employer/compare?${search.toString()}`;
  }

  const pricing = new Map(candidates.map((c) => [c.id, resolvePricing(c.score, plans, currency, region)]));
  const wanted = new Set(requiredSkills.map((s) => s.trim().toLowerCase()).filter(Boolean));
  const nameOf = (skill: string) => skill.split(" · ")[0].trim();
  const fit = new Map(
    candidates.map((c) => {
      const have = new Set(c.skills.map((s) => nameOf(s).toLowerCase()));
      const matched = requiredSkills.filter((s) => have.has(s.toLowerCase()));
      return [c.id, { matched, pct: requiredSkills.length ? Math.round((matched.length / requiredSkills.length) * 100) : 0 }];
    }),
  );
  const anyPerHire = candidates.some((c) => (pricing.get(c.id)?.perHireMinor ?? 0) > 0);

  return (
    <div>
      <RememberSelection employerId={session.uid} compare={ids} project={activeProject?.id ?? null} />
      <ButtonLink href={backHref} variant="ghost" size="sm" className="mb-4 min-h-11">
        <ArrowLeft className="size-4" aria-hidden />
        Back to candidates
      </ButtonLink>

      <CompareHero
        count={candidates.length}
        max={MAX_COMPARE}
        lede={
          candidates.length === 1
            ? "Add at least one more from the candidate list to see who leads each row."
            : "The leader of each row is marked. Hires are left out. The compare list is shared across your projects."
        }
        people={candidates.map((c) => ({ id: c.id, initials: c.initials }))}
      />
      <div className="mb-6 rounded-[24px] bg-white p-4 shadow-tile ring-1 ring-ink-100 sm:p-5">
        {
          projects.length > 0 ? (
            <form method="get" className="flex w-full flex-wrap items-end gap-2 sm:w-auto">
              <input type="hidden" name="ids" value={ids.join(",")} />
              <label className="min-w-0 flex-1 text-sm font-medium text-ink-700 sm:flex-none">
                Benchmark against
                <select
                  name="project"
                  defaultValue={activeProject?.id ?? ""}
                  className={cn(fieldClass, "mt-1.5 block sm:w-64")}
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.projectName}
                    </option>
                  ))}
                </select>
              </label>
              <button type="submit" className={buttonClass({ variant: "outline", size: "sm", className: "min-h-11" })}>
                Apply
              </button>
            </form>
          ) : null
        }
      </div>

      <SkillFilter
        title="Skills to match"
        active={requiredSkills}
        projectSkills={projectSkills}
        fromProject={!skillsSet && projectSkills.length > 0}
        note="Up to 7. Add or remove skills to re-score the project fit below."
      />

      {/* Scrolls inside itself so the header row and the label column can both stick. */}
      {candidates.length >= MAX_COMPARE ? (
        <Callout tone="info" className="mb-4">
          You are comparing the most we show at once ({MAX_COMPARE}). Remove one candidate to add another from the candidate list.
        </Callout>
      ) : null}
      <ScrollRegion
        label="Candidate comparison"
        className="rise max-h-[calc(100dvh-8rem)] rounded-[24px] bg-white shadow-tile ring-1 ring-ink-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
      >
        <table className="w-full border-separate border-spacing-0 text-left text-sm">
          <caption className="sr-only">Candidates compared side by side; the leader of each row is marked.</caption>
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky left-0 top-0 z-30 w-24 min-w-24 border-b border-r border-ink-100 bg-white p-3 align-bottom text-xs font-medium text-ink-600 sm:w-48 sm:min-w-48 sm:p-4"
              >
                {candidates.length} of {MAX_COMPARE}
              </th>
              {candidates.map((c) => {
                const rel = relations.get(c.id);
                const status = candidateStatusPill(rel?.proposal ?? null);
                const name = displayNameOf(c, nameUnlocked.has(c.id));
                return (
                  <CompareHeadCell
                    key={c.id}
                    c={c}
                    name={name}
                    unlocked={nameUnlocked.has(c.id)}
                    status={status}
                    proposal={rel?.proposal ?? null}
                    removeHref={removeHref(c.id)}
                    project={activeProject ? { id: activeProject.id, name: activeProject.projectName } : null}
                    shortlisted={shortlisted.has(c.id)}
                    shortlistedFor={shortlistedFor.get(c.id) ?? []}
                  />
                );
              })}
            </tr>
          </thead>

          <tbody>
            {requiredSkills.length > 0 ? (
              <MatrixRow label="Project fit" hint={`${activeProject && !skillsSet ? activeProject.projectName : "Your skills"} · ${requiredSkills.length} skills`} accent>
                {candidates.map((c) => {
                  const f = fit.get(c.id)!;
                  const best = leaders(candidates.map((x) => fit.get(x.id)!.pct)).has(candidates.indexOf(c));
                  return (
                    <Cell key={c.id} leader={best}>
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="nums text-2xl font-light tracking-[-0.04em]">{f.pct}%</span>
                        <span className="nums text-sm text-ink-600">
                          {f.matched.length} of {requiredSkills.length}
                        </span>
                      </div>
                      <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-ink-100" aria-hidden>
                        <span className="block h-full rounded-full bg-brand-600" style={{ width: `${f.pct}%` }} />
                      </span>
                      {best ? <LeaderMark /> : null}
                    </Cell>
                  );
                })}
              </MatrixRow>
            ) : null}

            <NumericRow
              label="Findtern Score"
              values={candidates.map((c) => (c.scored ? c.score : 0))}
              candidates={candidates}
              render={(c) => (
                <>
                  <span className="nums text-4xl font-light tracking-[-0.04em]">{c.scored ? c.score.toFixed(1) : "-"}</span>
                  <span className="text-sm text-text-subtle">/10</span>
                  <span className="mt-0.5 block text-sm text-ink-600">{bandFor(c.score).name}</span>
                </>
              )}
            />

            <MatrixRow label="Hourly price">
              {candidates.map((c) => (
                <Cell key={c.id}>
                  <span className="nums text-base">{formatRate(pricing.get(c.id)!.hourlyRateMinor, currency)}</span>
                </Cell>
              ))}
            </MatrixRow>

            {/* A zero per-hire charge is not worth a row (bug sheet r96). */}
            {anyPerHire ? (
              <MatrixRow label="Per-hire charge">
                {candidates.map((c) => {
                  const minor = pricing.get(c.id)!.perHireMinor;
                  return (
                    <Cell key={c.id}>
                      <span className="nums font-medium text-ink-900">{minor > 0 ? formatMoney(minor, currency) : "-"}</span>
                    </Cell>
                  );
                })}
              </MatrixRow>
            ) : null}

            {RATING_META.map((meta) => (
              <NumericRow
                key={meta.key}
                label={meta.label}
                values={candidates.map((c) => c.ratings[meta.key])}
                candidates={candidates}
                render={(c, lead) =>
                  c.ratings[meta.key] > 0 ? (
                    <>
                      <span className="nums text-base">{c.ratings[meta.key].toFixed(1)}</span>
                      <span className="text-sm text-text-subtle">/10</span>
                      <RatingBar value={c.ratings[meta.key]} leader={lead} className="mt-2" />
                    </>
                  ) : (
                    <span className="text-text-subtle">Not rated</span>
                  )
                }
              />
            ))}

            <MatrixRow label="Skills" hint={wanted.size > 0 ? "Matches first, ticked" : "From their profile"}>
              {candidates.map((c) => {
                const skills = Array.from(new Set(c.skills.map(nameOf).filter(Boolean)));
                const isMatch = (s: string) => wanted.has(s.toLowerCase());
                const ordered = [...skills.filter(isMatch), ...skills.filter((s) => !isMatch(s))];
                return (
                  <Cell key={c.id}>
                    {ordered.length === 0 ? (
                      <span className="text-text-subtle">None listed</span>
                    ) : (
                      <ul className="space-y-1">
                        {ordered.map((skill) => (
                          <li key={skill} className={cn("flex items-center gap-1.5", isMatch(skill) ? "font-medium text-ink-900" : "text-ink-700")}>
                            {isMatch(skill) ? (
                              <Check className="size-3.5 shrink-0 text-brand-700" aria-label="Matches" />
                            ) : (
                              <Minus className="size-3.5 shrink-0 text-ink-300" aria-hidden />
                            )}
                            {skill}
                          </li>
                        ))}
                      </ul>
                    )}
                  </Cell>
                );
              })}
            </MatrixRow>

            <MatrixRow label="Work mode">
              {candidates.map((c) => (
                <Cell key={c.id}>{c.workModes.join(", ") || <span className="text-text-subtle">Not stated</span>}</Cell>
              ))}
            </MatrixRow>

            <MatrixRow label="Preferred cities">
              {candidates.map((c) => (
                <Cell key={c.id}>
                  {c.preferredLocations.length > 0 ? (
                    preferredCities(c.preferredLocations).join(", ")
                  ) : (
                    <span className="text-text-subtle">{c.workModes.length === 1 && c.workModes[0] === "Remote" ? "Remote only" : "Not stated"}</span>
                  )}
                </Cell>
              ))}
            </MatrixRow>

            <MatrixRow label="Laptop">
              {candidates.map((c) => (
                <Cell key={c.id}>
                  {c.hasLaptop === null ? <span className="text-text-subtle">Not stated</span> : c.hasLaptop ? "Has a laptop" : "Needs one provided"}
                </Cell>
              ))}
            </MatrixRow>

            <MatrixRow label="Education">
              {candidates.map((c) => (
                <Cell key={c.id}>
                  <p className="font-medium text-ink-900">{c.academics?.institution || "-"}</p>
                  <p className="mt-0.5 text-ink-600">
                    {[c.academics?.degree, c.academics?.specialization].filter(Boolean).join(", ") || "Degree not stated"}
                  </p>
                  {c.academics?.score ? (
                    <p className="nums mt-0.5 text-ink-600">
                      {c.academics.scoreType === "percentage" ? "Percentage" : "CGPA"} {c.academics.score}
                    </p>
                  ) : null}
                </Cell>
              ))}
            </MatrixRow>

            <MatrixRow label="Profile updated" last>
              {candidates.map((c) => (
                <Cell key={c.id}>
                  <span className="nums">
                    {c.updatedAt
                      ? formatDmy(c.updatedAt)
                      : "Never"}
                  </span>
                </Cell>
              ))}
            </MatrixRow>
          </tbody>
        </table>
      </ScrollRegion>
    </div>
  );
}
