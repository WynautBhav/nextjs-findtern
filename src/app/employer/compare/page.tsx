import type { Metadata } from "next";
import Link from "next/link";
import { and, desc, eq, inArray } from "drizzle-orm";
import { ArrowLeft, Check, Minus, Plus } from "lucide-react";

import { getDb, schema } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { requireEmployerSetup } from "@/lib/employer-setup";
import { formatDate, formatMoney } from "@/lib/format";
import { RATING_META, displayNameOf, preferredCities, redactForEmployer, toCandidateProfile, type CandidateProfile } from "@/lib/employer-candidates";
import { shortlistProjectsByIntern } from "@/lib/employer-shortlist";
import { candidateRelations, hiredInternIds, type CandidateRelation } from "@/lib/employer-visibility";
import { attachPhotos, visibleInternIds } from "@/lib/employer-pool";
import { HOURS_PER_MONTH } from "@/lib/plan-offer";
import { bandFor, planNameFor } from "@/lib/score";
import { studyOf } from "@/components/employer/candidate-view";
import { SortSelect } from "../candidates/_sort-select";
import { candidateStatusPill } from "@/components/employer/candidate-status";
import { employerRegion, resolvePricing, type Currency } from "@/lib/employer-pricing";
import { SkillFilter } from "@/components/employer/skill-filter";
import { RememberSelection } from "@/components/employer/remember-selection";
import { MAX_COMPARE, isOpenProject, parseIds, rememberedSelection } from "@/lib/employer-selection";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import { hireFlowCounts } from "@/lib/employer-flow";
import { EmptyScene, PageHead } from "@/components/app/primitives";
import { LoadError } from "@/components/app/load-error";
import { SITE } from "@/lib/content/site";
import { BestBadge, Cell, MatrixRow, MetricCell, SectionRow } from "@/components/employer/compare/matrix";
import { CompareHeadCell } from "@/components/employer/compare/head-cell";
import { CompareTabs } from "@/components/employer/compare/compare-tabs";
import { isLevel, leaders } from "@/components/employer/compare/leaders";
import { ScrollRegion } from "./scroll-region";
import { skillAlignment } from "@/components/employer/compare/skill-rows";

export const metadata: Metadata = {
  title: "Compare candidates",
  robots: { index: false, follow: false },
};

/** The same heading size and spacing as the Candidates page. */
const HEAD_CLASS = "mb-3 sm:mb-4 lg:mb-5 [&_h1]:text-[32px] [&_h1]:leading-10";

type Search = { ids?: string | string[]; project?: string | string[]; skills?: string | string[] };

function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/**
 * Up to four candidates as a real comparison matrix: one column each, a
 * header with the candidate and their next action, a sticky first column of
 * row labels (the page scrolls down, the table scrolls sideways), and the
 * leader of every numeric row marked.
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
  const remembered = await rememberedSelection(session.uid, one(sp.project));
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
  let profileUpdated = new Map<string, CandidateProfile["updatedAt"]>();
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
          takenDownAt: schema.projects.takenDownAt,
        })
        .from(schema.projects)
        .where(eq(schema.projects.employerId, session.uid))
        .orderBy(desc(schema.projects.createdAt))
    ).filter((p) => isOpenProject(p.status, p.takenDownAt));
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
        candidateRelations(db, session.uid, ids, activeProject?.id ?? null),
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
      const profiles = ids
        .map((id) => byId.get(id))
        .filter((row): row is NonNullable<typeof row> => Boolean(row))
        .map((row) => toCandidateProfile(row, onboardingByUser.get(row.id)));
      // Only the redacted profile leaves this block (no email, LinkedIn, recording; name only once hired), so
      // no child, server or client, can ever be handed the unredacted one. The "Profile updated" row is the one
      // thing redaction drops that compare has always shown, so it is carried on its own.
      profileUpdated = new Map(profiles.map((p) => [p.id, p.updatedAt]));
      candidates = profiles.map((p) => redactForEmployer(p, nameUnlocked.has(p.id)));
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

  // The tab row's Shortlist figure: the same count the Shortlist page's strip shows.
  const shortlistCount = (await hireFlowCounts(session.uid, 0).catch(() => null))?.shortlisted ?? 0;

  if (candidates.length === 0) {
    return (
      <div>
        <RememberSelection employerId={session.uid} compare={ids} project={activeProject?.id ?? null} />
        <PageHead title="Compare candidates" lede={`Put up to ${MAX_COMPARE} candidates side by side.`} className={HEAD_CLASS} />
        <CompareTabs shortlist={shortlistCount} compare={0} />
        <EmptyScene
          title="Nothing to compare yet"
          body="Tick Compare on two to four candidates in the candidate list, then open them here side by side."
          next={{ label: "Browse candidates", href: "/employer/candidates" }}
          who="You - pick at least two"
        />
      </div>
    );
  }

  // Switching project shows that project's own picks and its own skills (typed ones are dropped).
  function projectHref(projectId: string): string {
    return `/employer/compare?${new URLSearchParams({ project: projectId }).toString()}`;
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
  const skillGrid = skillAlignment(requiredSkills, candidates);
  const nameOf = (skill: string) => skill.split(" · ")[0].trim();
  const fit = new Map(
    candidates.map((c) => {
      const have = new Set(c.skills.map((s) => nameOf(s).toLowerCase()));
      const matched = requiredSkills.filter((s) => have.has(s.toLowerCase()));
      return [c.id, { matched, pct: requiredSkills.length ? Math.round((matched.length / requiredSkills.length) * 100) : 0 }];
    }),
  );
  // The lede promises marked leaders only when some row has one (an all-level board marks nobody).
  const scoreValues = candidates.map((c) => (c.scored ? c.score : 0));
  const fitValues = candidates.map((c) => fit.get(c.id)!.pct);
  const rateValues = candidates.map((c) => pricing.get(c.id)!.hourlyRateMinor);
  const hireValues = candidates.map((c) => pricing.get(c.id)!.perHireMinor);
  const anyLeader =
    (requiredSkills.length > 0 && leaders(fitValues).size > 0) ||
    leaders(scoreValues).size > 0 ||
    RATING_META.some((m) => leaders(candidates.map((c) => c.ratings[m.key])).size > 0);
  const anyPerHire = candidates.some((c) => (pricing.get(c.id)?.perHireMinor ?? 0) > 0);
  // Label column + one column per candidate: the width a section band spans.
  const span = candidates.length + 1;
  const chip = "inline-flex min-h-7 items-center gap-1 rounded-lg px-2.5 py-0.5 text-[13px] font-medium";
  const chipHit = `${chip} bg-brand-100 text-brand-900`;
  const chipOther = `${chip} bg-ink-50 text-ink-700 ring-1 ring-inset ring-ink-200`;
  const muted = "text-sm text-ink-600";

  return (
    <div>
      <RememberSelection employerId={session.uid} compare={ids} project={activeProject?.id ?? null} />
      <ButtonLink href={backHref} variant="ghost" size="sm" className="-ml-3.5 mb-4 min-h-11">
        <ArrowLeft className="size-4" aria-hidden />
        Back to candidates
      </ButtonLink>

      <PageHead
        className={HEAD_CLASS}
        title={`Comparing ${candidates.length} candidate${candidates.length === 1 ? "" : "s"}`}
        lede={
          candidates.length === 1
            ? "Add one more from the candidate list to see who leads each row."
            : anyLeader
              ? "The best value in each row is marked. A row where everyone is level has no mark."
              : undefined
        }
        action={
          projects.length > 0 ? (
            // Applies on choice, like the project picker on Candidates: no Apply button.
            <span className="flex min-w-0 items-center gap-2 text-sm text-ink-600 max-sm:w-full">
              <span aria-hidden className="shrink-0">Benchmark</span>
              <SortSelect
                id="compare-project"
                label="Benchmark against project"
                prefix=""
                value={activeProject?.id ?? ""}
                options={projects.map((p) => ({ value: p.id, label: p.projectName, href: projectHref(p.id) }))}
                className="min-w-0 font-medium text-ink-900 max-sm:flex-1 sm:max-w-64"
              />
            </span>
          ) : null
        }
      />
      <CompareTabs shortlist={shortlistCount} compare={candidates.length} />

      <SkillFilter
        className="mb-4 lg:mb-5"
        title="Skills to match"
        active={requiredSkills}
        projectSkills={projectSkills}
        fromProject={!skillsSet && projectSkills.length > 0}
        note="Up to 7. Add or remove skills to re-score the project fit below."
      />

      {/* The count and the one way to add, above the card: the same place Candidates keeps its result count. */}
      <div className="mb-3 flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2 className="min-w-0 text-sm text-ink-600">
          <span role="status" className="nums font-semibold text-ink-900">
            {candidates.length} of {MAX_COMPARE} slots used
          </span>
        </h2>
        {candidates.length < MAX_COMPARE ? (
          <Link href={backHref} className={buttonClass({ variant: "outline", size: "sm", className: "h-11 rounded-xl sm:h-10 sm:touch:h-11" })}>
            <Plus className="size-4" aria-hidden />
            Add a candidate
          </Link>
        ) : null}
      </div>

      {/* The page scrolls down; only the width scrolls here, with the label column pinned at every width. */}
      <ScrollRegion label="Candidate comparison" className="rounded-2xl border border-ink-200 bg-white shadow-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600">
        {/* Fixed layout: every candidate column is the same width. The minimum width (label column + n columns) is what makes the region scroll sideways instead of squeezing. */}
        <table
          style={{ "--n": candidates.length } as React.CSSProperties}
          className="w-full table-fixed border-separate border-spacing-0 text-left text-sm min-w-[calc(8rem+var(--n)*11rem)] sm:min-w-[calc(10rem+var(--n)*13rem)] xl:min-w-[calc(11rem+var(--n)*13rem)]"
        >
          <caption className="sr-only">Candidates compared side by side; the best value in each row is marked Best.</caption>
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky left-0 z-20 w-32 min-w-32 border-b border-r border-ink-200 bg-white px-2.5 py-3 text-left align-bottom text-[11px] font-semibold uppercase tracking-wider text-ink-700 sm:w-40 sm:min-w-40 sm:p-4 xl:w-44 xl:min-w-44 xl:p-5"
              >
                Compared on
              </th>
              {candidates.map((c) => {
                const rel = relations.get(c.id);
                const savedTo = shortlistedFor.get(c.id) ?? [];
                const q = activeProject ? `?project=${encodeURIComponent(activeProject.id)}` : "";
                return (
                  <CompareHeadCell
                    key={c.id}
                    c={c}
                    name={displayNameOf(c, nameUnlocked.has(c.id))}
                    profileHref={`/employer/intern/${encodeURIComponent(c.id)}${q}`}
                    removeHref={removeHref(c.id)}
                    status={candidateStatusPill(rel?.proposal ?? null)}
                    proposal={rel?.proposal ?? null}
                    pendingMeetingAt={rel?.pendingMeetingAt ?? null}
                    sendHref={`/employer/send-proposal?intern=${encodeURIComponent(c.id)}${activeProject ? `&project=${encodeURIComponent(activeProject.id)}` : ""}`}
                    projectId={activeProject?.id ?? null}
                    shortlisted={shortlisted.has(c.id)}
                    otherShortlists={savedTo.filter((n) => n !== activeProject?.projectName)}
                    alsoOn={Boolean(activeProject && shortlisted.has(c.id))}
                  />
                );
              })}
            </tr>
          </thead>

          <tbody>
            <SectionRow label="Fit and score" span={span} />
            {requiredSkills.length > 0 ? (
              <MatrixRow
                label="Project fit"
                hint={`${activeProject && !skillsSet ? activeProject.projectName : "Your skills"} · ${requiredSkills.length} skill${requiredSkills.length === 1 ? "" : "s"}`}
                level={isLevel(fitValues)}
              >
                {candidates.map((c, i) => {
                  const f = fit.get(c.id)!;
                  const best = leaders(fitValues).has(i);
                  return (
                    <Cell key={c.id} leader={best}>
                      <MetricCell value={f.pct} max={100} unit="%" leader={best} empty="" note={`${f.matched.length} of ${requiredSkills.length} skills`} />
                    </Cell>
                  );
                })}
              </MatrixRow>
            ) : null}

            <MatrixRow label="Findtern Score" level={isLevel(scoreValues)}>
              {candidates.map((c, i) => {
                const best = leaders(scoreValues).has(i);
                return (
                  <Cell key={c.id} leader={best}>
                    <MetricCell
                      value={c.scored ? Math.round(c.score * 10) / 10 : null}
                      max={10}
                      unit="/ 10"
                      leader={best}
                      empty="Not scored yet"
                      note={`${planNameFor(c.score)} · ${bandFor(c.score).name}`}
                    />
                  </Cell>
                );
              })}
            </MatrixRow>

            <SectionRow label="Price" span={span} />
            <MatrixRow label="Hourly price" hint="Lowest is marked" level={isLevel(rateValues)}>
              {candidates.map((c, i) => {
                const minor = pricing.get(c.id)!.hourlyRateMinor;
                const lowest = leaders(rateValues, { lowerIsBetter: true }).has(i);
                return (
                  <Cell key={c.id} leader={lowest}>
                    <div className="flex flex-col gap-2">
                      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                        <span className="nums flex items-baseline gap-1 text-[22px] font-semibold leading-none text-ink-900 sm:text-2xl">
                          {formatMoney(minor, currency)}
                          <span className="text-xs font-normal text-text-subtle">/ hr</span>
                        </span>
                        {lowest ? <BestBadge label="Lowest" /> : null}
                      </div>
                      {minor > 0 ? (
                        <p className="nums text-xs leading-4 text-text-subtle" title={`${formatMoney(minor, currency)} x ${HOURS_PER_MONTH} hours a month (Mon-Fri)`}>
                          <span aria-hidden>≈ {formatMoney(minor * HOURS_PER_MONTH, currency)}/mo</span>
                          <span className="sr-only">About {formatMoney(minor * HOURS_PER_MONTH, currency)} a month at {HOURS_PER_MONTH} hours</span>
                        </p>
                      ) : null}
                    </div>
                  </Cell>
                );
              })}
            </MatrixRow>

            {/* A zero per-hire charge is not worth a row (bug sheet r96). */}
            {anyPerHire ? (
              <MatrixRow label="Per-hire charge" hint="One-time charge" level={isLevel(hireValues)}>
                {candidates.map((c, i) => {
                  const minor = pricing.get(c.id)!.perHireMinor;
                  const lowest = leaders(hireValues, { lowerIsBetter: true }).has(i);
                  return (
                    <Cell key={c.id} leader={lowest}>
                      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                        <span className="nums text-lg font-semibold leading-none text-ink-900">{minor > 0 ? formatMoney(minor, currency) : "None"}</span>
                        {lowest ? <BestBadge label="Lowest" /> : null}
                      </div>
                    </Cell>
                  );
                })}
              </MatrixRow>
            ) : null}

            <SectionRow label="Ratings" span={span} />
            {RATING_META.map((meta) => {
              const values = candidates.map((c) => c.ratings[meta.key]);
              const lead = leaders(values);
              return (
                <MatrixRow key={meta.key} label={meta.label} level={isLevel(values)}>
                  {candidates.map((c, i) => (
                    <Cell key={c.id} leader={lead.has(i)}>
                      <MetricCell value={c.ratings[meta.key] > 0 ? c.ratings[meta.key] : null} max={10} unit="/ 10" leader={lead.has(i)} empty="Not rated" />
                    </Cell>
                  ))}
                </MatrixRow>
              );
            })}

            <SectionRow label="Skills" span={span} />
            {/* One row per skill asked for, so a skill sits at the same height in every column; then whatever else each lists. */}
            {skillGrid.rows.map((row, r) => (
              <MatrixRow key={row.skill} label={row.skill} hint={r === 0 ? "Skill you asked for" : undefined}>
                {candidates.map((c, i) => (
                  <Cell key={c.id}>
                    {row.has[i] ? (
                      <span className={chipHit}>
                        <Check className="size-3.5 text-brand-700" strokeWidth={2.5} aria-hidden />
                        Has it
                      </span>
                    ) : (
                      <span className={`${chipOther} text-ink-700`}>
                        <Minus className="size-3.5 text-ink-600" aria-hidden />
                        Not listed
                      </span>
                    )}
                  </Cell>
                ))}
              </MatrixRow>
            ))}

            <MatrixRow label={skillGrid.rows.length > 0 ? "Other skills" : "Skills"} hint={skillGrid.rows.length > 0 ? undefined : "From their profile"}>
              {candidates.map((c, i) => {
                const { skills, more } = skillGrid.other[i];
                return (
                  <Cell key={c.id}>
                    {skills.length === 0 && more === 0 ? (
                      <span className={muted}>{skillGrid.rows.length > 0 ? "None" : "None listed"}</span>
                    ) : (
                      <ul className="flex flex-wrap gap-1.5" aria-label="Skills">
                        {skills.map((skill) => (
                          <li key={skill} className={chipOther}>
                            {skill}
                          </li>
                        ))}
                        {more > 0 ? (
                          <li className="inline-flex min-h-7 items-center px-2 text-[13px] font-medium text-ink-600">
                            +{more}
                            <span className="sr-only"> more skills</span>
                          </li>
                        ) : null}
                      </ul>
                    )}
                  </Cell>
                );
              })}
            </MatrixRow>

            <SectionRow label="Availability" span={span} />
            <MatrixRow label="Work mode">
              {candidates.map((c) => (
                <Cell key={c.id}>
                  {c.workModes.length > 0 ? <span className="font-medium text-ink-900">{c.workModes.join(", ")}</span> : <span className={muted}>Not stated</span>}
                </Cell>
              ))}
            </MatrixRow>

            <MatrixRow label="Preferred cities">
              {candidates.map((c) => (
                <Cell key={c.id}>
                  {c.preferredLocations.length > 0 ? (
                    <span className="text-ink-900">{preferredCities(c.preferredLocations).join(", ")}</span>
                  ) : (
                    <span className={muted}>{c.workModes.length === 1 && c.workModes[0] === "Remote" ? "Remote only" : "Not stated"}</span>
                  )}
                </Cell>
              ))}
            </MatrixRow>

            <MatrixRow label="Laptop">
              {candidates.map((c) => (
                <Cell key={c.id}>
                  {c.hasLaptop === null ? <span className={muted}>Not stated</span> : <span className={c.hasLaptop ? "font-medium text-ink-900" : "text-ink-800"}>{c.hasLaptop ? "Has a laptop" : "Needs one provided"}</span>}
                </Cell>
              ))}
            </MatrixRow>

            <SectionRow label="Background" span={span} />
            <MatrixRow label="Education">
              {candidates.map((c) => (
                <Cell key={c.id}>
                  <p className="break-words font-medium text-ink-900">{c.academics?.institution || "-"}</p>
                  <p className="mt-0.5 break-words text-ink-600">{studyOf(c.academics) || "Degree not stated"}</p>
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
                <Cell key={c.id} last>
                  <span className="nums text-ink-800">{profileUpdated.get(c.id) ? formatDate(profileUpdated.get(c.id)!) : "Never"}</span>
                </Cell>
              ))}
            </MatrixRow>
          </tbody>
        </table>
      </ScrollRegion>
    </div>
  );
}
