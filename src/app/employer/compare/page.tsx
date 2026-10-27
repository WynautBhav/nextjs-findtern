import type { Metadata } from "next";
import Link from "next/link";
import { and, desc, eq, inArray } from "drizzle-orm";
import { ArrowLeft, Check, Minus, Send, X } from "lucide-react";

import { getDb, schema } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { requireEmployerSetup } from "@/lib/employer-setup";
import { bandFor } from "@/lib/score";
import { formatMoney, formatRate } from "@/lib/format";
import { RATING_META, displayNameOf, toCandidateProfile, type CandidateProfile } from "@/lib/employer-candidates";
import { candidateRelations, hiredInternIds, type CandidateRelation } from "@/lib/employer-visibility";
import { attachPhotos, visibleInternIds } from "@/lib/employer-pool";
import { CandidateAvatar } from "@/components/employer/candidate-avatar";
import { candidateStatusPill, proposalActionLabel } from "@/components/employer/candidate-status";
import { employerRegion, resolvePricing, type Currency } from "@/lib/employer-pricing";
import { ShortlistToggle } from "@/components/employer/shortlist-toggle";
import { SkillFilter } from "@/components/employer/skill-filter";
import { RememberSelection } from "@/components/employer/remember-selection";
import { MAX_COMPARE, isOpenProject, parseIds, rememberedSelection } from "@/lib/employer-selection";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import { EmptyScene, PageHead, Pill } from "@/components/app/primitives";
import { cn } from "@/lib/utils";

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
      await attachPhotos(db, candidates, nameUnlocked);

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
    return (
      <div>
        <PageHead title="Compare candidates" />
        <EmptyScene
          art
          title="Couldn't load the comparison"
          body="Something went wrong on our side. Your picks are saved; try again in a moment."
          next={{ label: "Try again", href: "/employer/compare" }}
          who="Us - we're on it"
        />
      </div>
    );
  }

  if (candidates.length === 0) {
    return (
      <div>
        <RememberSelection employerId={session.uid} compare={ids} />
        <PageHead title="Compare candidates" lede={`Put up to ${MAX_COMPARE} candidates side by side.`} />
        <EmptyScene
          art
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
      <Link href={backHref} className="mb-4 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-brand-700 underline-offset-4 hover:underline">
        <ArrowLeft className="size-4" aria-hidden />
        Back to candidates
      </Link>

      <PageHead
        title={`Comparing ${candidates.length} candidate${candidates.length === 1 ? "" : "s"}`}
        lede={
          candidates.length === 1
            ? "Add at least one more from the candidate list to see who leads each row."
            : "The leader of each row is marked. Hires are left out."
        }
        action={
          projects.length > 0 ? (
            <form method="get" className="flex w-full flex-wrap items-end gap-2 sm:w-auto">
              <input type="hidden" name="ids" value={ids.join(",")} />
              <label className="min-w-0 flex-1 text-sm font-medium text-ink-700 sm:flex-none">
                Benchmark against
                <select
                  name="project"
                  defaultValue={activeProject?.id ?? ""}
                  className="apple-spring mt-1.5 block min-h-11 w-full rounded-apple-sm border border-ink-200 bg-white px-3 text-sm text-ink-900 shadow-xs outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 sm:w-64"
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.projectName}
                    </option>
                  ))}
                </select>
              </label>
              <button type="submit" className={buttonClass({ variant: "outline", size: "md" })}>
                Apply
              </button>
            </form>
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

      {/* Scrolls inside itself so the header row and the label column can both stick. */}
      <div className="max-h-[calc(100dvh-8rem)] overflow-auto rounded-apple-xl border border-ink-200/80 bg-white shadow-xs">
        <table className="w-full border-separate border-spacing-0 text-left text-sm">
          <caption className="sr-only">Candidates compared side by side; the leader of each row is marked.</caption>
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky left-0 top-0 z-30 w-32 min-w-32 border-b border-r border-ink-100 bg-white p-4 align-bottom text-xs font-medium text-ink-600 sm:w-48 sm:min-w-48"
              >
                {candidates.length} of {MAX_COMPARE}
              </th>
              {candidates.map((c) => {
                const rel = relations.get(c.id);
                const status = candidateStatusPill(rel?.proposal ?? null);
                const name = displayNameOf(c, nameUnlocked.has(c.id));
                return (
                  <th
                    key={c.id}
                    scope="col"
                    className="sticky top-0 z-20 min-w-60 border-b border-r border-ink-100 bg-white p-4 align-top font-normal last:border-r-0"
                  >
                    <div className="flex items-start gap-3">
                      <CandidateAvatar photoUrl={c.photoUrl} initials={c.initials} className="size-10 rounded-apple-md text-sm ring-1 ring-inset ring-brand-200/70" />
                      <div className="min-w-0 flex-1">
                        <Link href={`/employer/intern/${encodeURIComponent(c.id)}`} className="block truncate text-base font-semibold text-ink-900 underline-offset-4 hover:text-brand-700 hover:underline">
                          {name}
                        </Link>
                        <p className="truncate text-sm text-ink-600">{c.city || c.location || "City not stated"}</p>
                      </div>
                      <Link
                        href={removeHref(c.id)}
                        aria-label={`Remove ${name} from the comparison`}
                        title="Remove"
                        className={buttonClass({ variant: "ghost", size: "iconSm", className: "-mr-1 -mt-1 text-ink-500" })}
                      >
                        <X className="size-4" aria-hidden />
                      </Link>
                    </div>
                    {status ? (
                      <div className="mt-2">
                        <Pill tone={status.tone}>{status.label}</Pill>
                      </div>
                    ) : null}
                    {/* EMB-08: the action follows what already exists with them. */}
                    <div className="mt-3 flex flex-wrap gap-2">
                      {rel?.proposal ? (
                        <ButtonLink href={`/employer/proposal/${encodeURIComponent(rel.proposal.id)}`} variant="outline" size="sm" className="min-h-10">
                          {proposalActionLabel(rel.proposal)}
                        </ButtonLink>
                      ) : (
                        <>
                          {activeProject ? (
                            <ShortlistToggle internId={c.id} projectId={activeProject.id} shortlisted={shortlisted.has(c.id)} size="sm" emphasis="primary" />
                          ) : null}
                          <ButtonLink
                            href={`/employer/send-proposal?intern=${encodeURIComponent(c.id)}${activeProject ? `&project=${encodeURIComponent(activeProject.id)}` : ""}`}
                            variant={activeProject && !shortlisted.has(c.id) ? "outline" : "primary"}
                            size="sm"
                            className="min-h-10"
                          >
                            <Send className="size-4" aria-hidden />
                            Send proposal
                          </ButtonLink>
                        </>
                      )}
                    </div>
                  </th>
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
                  <span className="nums text-2xl font-semibold tracking-[-0.02em] text-brand-700">{c.scored ? c.score.toFixed(1) : "-"}</span>
                  <span className="text-sm text-ink-500">/10</span>
                  <span className="mt-0.5 block text-sm text-ink-600">{bandFor(c.score).name}</span>
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
                      <span className="text-sm text-ink-500">/10</span>
                      <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-ink-100" aria-hidden>
                        <span className="block h-full rounded-full bg-brand-600" style={{ width: `${c.ratings[meta.key] * 10}%` }} />
                      </span>
                    </>
                  ) : (
                    <span className="text-ink-500">Not rated</span>
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
                      <span className="text-ink-500">None listed</span>
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
                <Cell key={c.id}>{c.workModes.join(", ") || <span className="text-ink-500">Not stated</span>}</Cell>
              ))}
            </MatrixRow>

            <MatrixRow label="Preferred cities">
              {candidates.map((c) => (
                <Cell key={c.id}>
                  {c.preferredLocations.length > 0 ? (
                    c.preferredLocations.map((l) => l.split(",")[0].trim()).join(", ")
                  ) : (
                    <span className="text-ink-500">{c.workModes.length === 1 && c.workModes[0] === "Remote" ? "Remote only" : "Not stated"}</span>
                  )}
                </Cell>
              ))}
            </MatrixRow>

            <MatrixRow label="Laptop">
              {candidates.map((c) => (
                <Cell key={c.id}>
                  {c.hasLaptop === null ? <span className="text-ink-500">Not stated</span> : c.hasLaptop ? "Has a laptop" : "Needs one provided"}
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
                      ? new Date(c.updatedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" })
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

/* ── Matrix pieces ───────────────────────────────────────────────────────── */

/** Index of the single highest value, if one candidate leads outright. */
function leaders(values: number[]): Set<number> {
  const max = Math.max(...values, 0);
  const at = values.map((v, i) => (v === max ? i : -1)).filter((i) => i >= 0);
  return max > 0 && at.length === 1 && values.length > 1 ? new Set(at) : new Set();
}

function MatrixRow({
  label,
  hint,
  accent,
  last,
  children,
}: {
  label: string;
  hint?: string;
  accent?: boolean;
  last?: boolean;
  children: React.ReactNode;
}) {
  return (
    <tr className={cn("[&>td]:border-b [&>td]:border-ink-100", last && "[&>td]:border-b-0")}>
      <th
        scope="row"
        className={cn(
          "sticky left-0 z-10 border-r border-ink-100 p-4 text-left align-top text-sm font-semibold text-ink-900",
          last ? "" : "border-b",
          accent ? "bg-brand-50" : "bg-white",
        )}
      >
        {label}
        {hint ? <span className="mt-0.5 block text-xs font-normal text-ink-600">{hint}</span> : null}
      </th>
      {children}
    </tr>
  );
}

function Cell({ leader, children }: { leader?: boolean; children: React.ReactNode }) {
  return (
    <td className={cn("border-r border-ink-100 p-4 align-top text-sm text-ink-800 last:border-r-0", leader && "bg-brand-50/60")}>
      {children}
    </td>
  );
}

function LeaderMark() {
  return (
    <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-brand-800">
      <Check className="size-3.5" aria-hidden />
      Leads
    </span>
  );
}

function NumericRow({
  label,
  values,
  candidates,
  render,
}: {
  label: string;
  values: number[];
  candidates: CandidateProfile[];
  render: (candidate: CandidateProfile) => React.ReactNode;
}) {
  const lead = leaders(values);
  return (
    <MatrixRow label={label}>
      {candidates.map((c, i) => (
        <Cell key={c.id} leader={lead.has(i)}>
          {render(c)}
          {lead.has(i) ? (
            <span className="block">
              <LeaderMark />
            </span>
          ) : null}
        </Cell>
      ))}
    </MatrixRow>
  );
}
