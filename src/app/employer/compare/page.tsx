import type { Metadata } from "next";
import Link from "next/link";
import { and, desc, eq, inArray } from "drizzle-orm";
import { ArrowLeft, Check, Minus, Send, X } from "lucide-react";

import { getDb, schema } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { requireEmployerSetup } from "@/lib/employer-setup";
import { formatDate, formatMoney, formatRate } from "@/lib/format";
import { RATING_META, displayNameOf, preferredCities, toCandidateProfile, type CandidateProfile } from "@/lib/employer-candidates";
import { shortlistProjectsByIntern } from "@/lib/employer-shortlist";
import { candidateRelations, hiredInternIds, type CandidateRelation } from "@/lib/employer-visibility";
import { attachPhotos, visibleInternIds } from "@/lib/employer-pool";
import { RowAvatar } from "@/components/employer/candidate-row-parts";
import { SendProposalHold } from "@/components/employer/send-proposal-hold";
import { planNameFor } from "@/lib/score";
import { SaveToggle } from "@/components/employer/candidate-card";
import { studyOf } from "@/components/employer/candidate-view";
import { SortSelect } from "../candidates/_sort-select";
import { candidateStatusPill, proposalActionLabel } from "@/components/employer/candidate-status";
import { employerRegion, resolvePricing, type Currency } from "@/lib/employer-pricing";
import { SkillFilter } from "@/components/employer/skill-filter";
import { RememberSelection } from "@/components/employer/remember-selection";
import { MAX_COMPARE, isOpenProject, parseIds, rememberedSelection } from "@/lib/employer-selection";
import { ButtonLink } from "@/components/ui/button";
import { EmptyScene, PageHead, Pill } from "@/components/app/primitives";
import { LoadError } from "@/components/app/load-error";
import { SITE } from "@/lib/content/site";
import { cn } from "@/lib/utils";
import { Cell, LeaderMark, MatrixRow, NumericRow, leaders } from "@/components/employer/compare/matrix";

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

  // Switching project re-benchmarks: its own skills apply, so typed ones are dropped.
  function projectHref(projectId: string): string {
    return `/employer/compare?${new URLSearchParams({ ids: ids.join(","), project: projectId }).toString()}`;
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
  // The lede promises marked leaders only when some row has one (all-tied values mark nobody).
  const anyLeader =
    (requiredSkills.length > 0 && leaders(candidates.map((c) => fit.get(c.id)!.pct)).size > 0) ||
    leaders(candidates.map((c) => (c.scored ? c.score : 0))).size > 0 ||
    RATING_META.some((m) => leaders(candidates.map((c) => c.ratings[m.key])).size > 0);
  const slotsLine = (
    <>
      <span className="nums block">{candidates.length} of {MAX_COMPARE} slots</span>
      {candidates.length < MAX_COMPARE ? (
        <Link href={backHref} className="-mx-1 inline-flex min-h-11 items-center px-1 text-sm font-medium text-ink-800 underline underline-offset-4 hover:text-ink-900 sm:mt-1">
          Add a candidate
        </Link>
      ) : null}
    </>
  );
  const anyPerHire = candidates.some((c) => (pricing.get(c.id)?.perHireMinor ?? 0) > 0);

  return (
    <div>
      <RememberSelection employerId={session.uid} compare={ids} project={activeProject?.id ?? null} />
      <ButtonLink href={backHref} variant="ghost" size="sm" className="mb-4 min-h-11">
        <ArrowLeft className="size-4" aria-hidden />
        Back to candidates
      </ButtonLink>

      <PageHead
        className="mb-4 lg:mb-6"
        title={`Comparing ${candidates.length} candidate${candidates.length === 1 ? "" : "s"}`}
        lede={candidates.length === 1 ? "Add one more from the candidate list to see who leads each row." : anyLeader ? "The leader of each row is marked." : undefined}
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

      <SkillFilter
        title="Skills to match"
        active={requiredSkills}
        projectSkills={projectSkills}
        fromProject={!skillsSet && projectSkills.length > 0}
        note="Up to 7. Add or remove skills to re-score the project fit below."
      />

      {/* Phone: the label column is hidden, so the slot count sits here once. */}
      <div className="mb-1 flex items-center justify-between gap-3 text-sm text-ink-600 sm:hidden">{slotsLine}</div>

      {/* The page scrolls vertically; only the width scrolls here, with the label column pinned (sm up). */}
      <div
        tabIndex={0}
        role="region"
        aria-label="Candidate comparison"
        className="relative -mx-4 overflow-x-auto border-y border-ink-100 max-sm:snap-x max-sm:snap-mandatory focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 sm:mx-0"
      >
        <table className="w-full border-separate border-spacing-0 text-left text-sm">
          <caption className="sr-only">Candidates compared side by side; the leader of each row is marked.</caption>
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky left-0 z-20 w-48 min-w-48 border-b border-r border-ink-100 bg-surface p-4 align-bottom text-xs font-medium text-ink-600 max-sm:hidden"
              >
                {slotsLine}
              </th>
              {candidates.map((c) => {
                const rel = relations.get(c.id);
                const status = candidateStatusPill(rel?.proposal ?? null);
                const name = displayNameOf(c, nameUnlocked.has(c.id));
                const savedTo = shortlistedFor.get(c.id) ?? [];
                const onActive = Boolean(activeProject && shortlisted.has(c.id));
                const others = savedTo.filter((n) => n !== activeProject?.projectName);
                return (
                  <th
                    key={c.id}
                    scope="col"
                    className="relative border-b border-r border-ink-100 p-3 align-top font-normal last:border-r-0 max-sm:w-[calc((100vw-2rem)/2)] max-sm:min-w-[calc((100vw-2rem)/2)] max-sm:snap-start sm:min-w-60 sm:p-4"
                  >
                    {/* Photo, name and city are one link to the profile: a big target on a phone. */}
                    <Link
                      href={`/employer/intern/${encodeURIComponent(c.id)}${activeProject ? `?project=${encodeURIComponent(activeProject.id)}` : ""}`}
                      className="group/id flex items-center gap-3 rounded-lg max-sm:flex-col max-sm:items-start max-sm:gap-1.5 sm:mr-8 outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                    >
                      <RowAvatar photoUrl={c.photoUrl} initials={c.initials} seed={c.id} className="size-10 sm:size-14" />
                      <span className="min-w-0 flex-1">
                        <span className="block break-words text-base font-semibold text-ink-900 underline-offset-4 group-hover/id:underline">{name}</span>
                        <span className="block break-words text-sm text-ink-600">{c.city || c.location || "City not stated"}</span>
                      </span>
                    </Link>
                    <Link
                      href={removeHref(c.id)}
                      aria-label={`Remove ${name} from the comparison`}
                      title="Remove from the comparison"
                      className="absolute right-1 top-1 grid size-11 place-items-center rounded-full text-ink-500 outline-none hover:bg-ink-100 hover:text-ink-900 focus-visible:ring-2 focus-visible:ring-brand-500 sm:right-2 sm:top-2"
                    >
                      <X className="size-4" aria-hidden />
                    </Link>
                    {/* EMB-08: the action follows what already exists with them. One filled button per column. */}
                    <div className="relative mt-3 flex items-center gap-2">
                      {rel?.proposal ? (
                        <ButtonLink href={`/employer/proposal/${encodeURIComponent(rel.proposal.id)}`} variant="outline" size="sm" className="min-h-11 min-w-0 flex-1 rounded-full sm:min-h-9 sm:touch:min-h-11">
                          {proposalActionLabel(rel.proposal)}
                        </ButtonLink>
                      ) : (
                        <>
                          {/* Phone: the heart joins the remove button on the top line. */}
                          {activeProject ? (
                            <span className="max-sm:absolute max-sm:right-12 max-sm:top-1">
                              <SaveToggle internId={c.id} projectId={activeProject.id} shortlisted={shortlisted.has(c.id)} name={name} />
                            </span>
                          ) : null}
{rel?.pendingMeetingAt ? (
                            <SendProposalHold pendingMeetingAt={rel.pendingMeetingAt} className="min-w-0 flex-1 items-stretch" controlClassName="w-full justify-center" />
                          ) : (
                                                      <ButtonLink
                              href={`/employer/send-proposal?intern=${encodeURIComponent(c.id)}${activeProject ? `&project=${encodeURIComponent(activeProject.id)}` : ""}`}
                              variant="primary"
                              size="sm"
                              className="min-h-11 w-full min-w-0 flex-1 rounded-full max-sm:px-3 max-sm:[&>svg]:hidden sm:min-h-9 sm:touch:min-h-11"
                            >
                              <Send className="size-4" aria-hidden />
                              Send proposal
                            </ButtonLink>
                          )}
                        </>
                      )}
                    </div>
                    {status || others.length > 0 ? (
                      <p className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-600">
                        {status ? <Pill tone={status.tone}>{status.label}</Pill> : null}
                        {others.length > 0 ? (
                          <span title={others.join(", ")}>
                            {onActive ? "Also on" : "On"} {others.length === 1 ? `the ${others[0]} shortlist` : `${others.length} ${onActive ? "other " : ""}shortlists`}
                          </span>
                        ) : null}
                      </p>
                    ) : null}
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody>
            {requiredSkills.length > 0 ? (
              <MatrixRow label="Project fit" hint={`${activeProject && !skillsSet ? activeProject.projectName : "Your skills"} · ${requiredSkills.length} skill${requiredSkills.length === 1 ? "" : "s"}`} accent>
                {candidates.map((c) => {
                  const f = fit.get(c.id)!;
                  const best = leaders(candidates.map((x) => fit.get(x.id)!.pct)).has(candidates.indexOf(c));
                  return (
                    <Cell key={c.id} leader={best}>
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="nums text-lg font-semibold text-brand-800">{f.pct}%</span>
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
                  <span className="nums text-2xl font-semibold text-brand-700">{c.scored ? c.score.toFixed(1) : "-"}</span>
                  <span className="text-sm text-text-subtle">/10</span>
                  {c.scored ? <span className="ml-1 text-sm font-medium text-ink-700">{planNameFor(c.score)}</span> : null}
                </>
              )}
            />

            <MatrixRow label="Hourly price">
              {candidates.map((c) => (
                <Cell key={c.id}>
                  <span className="nums text-base font-semibold text-ink-900">{formatRate(pricing.get(c.id)!.hourlyRateMinor, currency)}</span>
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
                render={(c) =>
                  c.ratings[meta.key] > 0 ? (
                    <>
                      <span className="nums text-base font-semibold text-ink-900">{c.ratings[meta.key].toFixed(1)}</span>
                      <span className="text-sm text-text-subtle">/10</span>
                      <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-ink-100" aria-hidden>
                        <span className="block h-full rounded-full bg-brand-600" style={{ width: `${c.ratings[meta.key] * 10}%` }} />
                      </span>
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
                // Matches first; a profile holds at most seven skills, so an older, longer list is cut to seven (+N).
                const all = [...skills.filter(isMatch), ...skills.filter((s) => !isMatch(s))];
                const ordered = all.slice(0, 7);
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
                        {all.length > ordered.length ? (
                          <li className="text-ink-700">
                            +{all.length - ordered.length}
                            <span className="sr-only"> more skills</span>
                          </li>
                        ) : null}
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
                    {studyOf(c.academics) || "Degree not stated"}
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
                      ? formatDate(c.updatedAt)
                      : "Never"}
                  </span>
                </Cell>
              ))}
            </MatrixRow>
          </tbody>
        </table>
      </div>
    </div>
  );
}
