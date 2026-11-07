import type { Metadata } from "next";

import Link from "next/link";
import { Search } from "lucide-react";

import { SignatureHero } from "@/components/intern/kit/hero";
import { CountUp } from "@/components/motion/count-up";
import { Stagger } from "@/components/intern/kit/motion";
import { EmptyScene, FilterTabs, PageHead } from "@/components/app/primitives";
import { Callout, Toolbar } from "@/components/app/layout-kit";
import { skillMatch } from "@/components/app/skill-match";
import { ButtonLink } from "@/components/ui/button";
import { sortRoles, type RoleSort } from "@/components/intern/offer/role-order";
import { controlClass } from "@/components/intern/onboarding/control-class";
import { InternRoleCard, MODE } from "@/components/intern/role-card";
import { proposalStatus } from "@/components/app/status";
import { isHiredProposal } from "@/lib/hire-status";
import { toArray } from "@/lib/journey";
import { readSkillRatings } from "@/lib/onboarding";
import { requireRole } from "@/lib/auth";
import { loadInternData, openProjects } from "@/lib/intern-data";

import { LockedRoles, rolesGate } from "./_gate";

export const metadata: Metadata = {
  title: "Open roles",
  robots: { index: false, follow: false },
};

/**
 * Open roles, signed in.
 *
 * The old version rendered six cards that were not links. Not one of them went
 * anywhere. A card that looks like a button and is not a link is worse than a
 * plain list, because it spends the reader's attention and gives nothing back.
 *
 * Every card is a link, and the cards themselves are the shared `RoleCard` the
 * public browser at /opportunities uses - the only difference a signed-in
 * candidate sees is which roles they have already been considered for. The
 * list is newest-first, because a role posted eight weeks ago is a weaker
 * offer than the same role posted yesterday.
 */
export default async function InternOpportunities({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[]; mode?: string | string[]; sort?: string | string[] }>;
}) {
  const params = await searchParams;
  const q = (Array.isArray(params.q) ? params.q[0] : params.q)?.trim().slice(0, 80) ?? "";
  const rawMode = Array.isArray(params.mode) ? params.mode[0] : params.mode;
  const mode = rawMode && Object.hasOwn(MODE, rawMode) ? rawMode : "all";
  const sort: RoleSort = (Array.isArray(params.sort) ? params.sort[0] : params.sort) === "newest" ? "newest" : "match";
  const session = await requireRole("intern");

  const [data, all] = await Promise.all([loadInternData(session.uid), openProjects(60, { strict: true })]);
  const extra = (data.onboarding?.extraData ?? {}) as Record<string, unknown>;
  const mine = new Set(readSkillRatings(data.onboarding?.skills, extra).map((s) => s.name.toLowerCase().trim()));
  const gate = await rolesGate(session.uid, data);
  if (!gate.unlocked) {
    return (
      <div>
        <PageHead title="Open roles" lede="What companies are hiring for right now." />
        <LockedRoles {...gate} />
      </div>
    );
  }
  // Rejected, withdrawn or expired offers are not offers any more.
  const offerFor = new Map<string, string>();
  for (const p of data.proposals) {
    if (!p.projectId || p.status === "draft") continue;
    if (isHiredProposal(p) || proposalStatus(p.status).tone !== "closed") offerFor.set(p.projectId, `/intern/proposals/${p.id}`);
  }
  const applied = new Set(offerFor.keys());
  // shortcut: filters the newest 60 in memory, move into the query if the list grows past that.
  const needle = q.toLowerCase();
  const mineList = [...mine];
  const matches = all.filter(
    (r) =>
      (mode === "all" || r.locationType?.toLowerCase() === mode) &&
      (!needle ||
        [r.projectName, r.scopeOfWork, r.city, ...toArray<string>(r.skills)].some((v) => v?.toLowerCase().includes(needle))),
  );
  const rows = sortRoles(
    matches.map((r) => ({ ...r, matched: skillMatch(mineList, toArray<string>(r.skills)).matched.length, offered: applied.has(r.id) })),
    sort,
  );
  const filtered = Boolean(q) || mode !== "all";
  const hrefFor = (key: string) => {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    if (key !== "all") sp.set("mode", key);
    if (sort !== "match") sp.set("sort", sort);
    return `/intern/opportunities${sp.size ? `?${sp}` : ""}`;
  };

  const sortHref = (key: string) => {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    if (mode !== "all") sp.set("mode", mode);
    if (key !== "match") sp.set("sort", key);
    return `/intern/opportunities${sp.size ? `?${sp}` : ""}`;
  };

  return (
    <Stagger className="space-y-4">
      <SignatureHero
        title="Open roles"
        lede="What companies are hiring for right now."
        aside={
          all.length > 0 ? (
            <dl className="flex gap-10">
              <div>
                <dd className="text-5xl font-light leading-none tracking-[-0.04em]"><CountUp value={all.length} duration={1} /></dd>
                <dt className="mt-2 text-[13px] text-on-dark-subtle">Open now</dt>
              </div>
              <div>
                <dd className="text-5xl font-light leading-none tracking-[-0.04em]"><CountUp value={applied.size} duration={1} /></dd>
                <dt className="mt-2 text-[13px] text-on-dark-subtle">With an offer for you</dt>
              </div>
            </dl>
          ) : null
        }
      />
      <Callout title="Companies send offers to profiles they like. You do not apply.">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p>{gate.complete ? "These are the roles open now. Skills you already have are marked." : "A complete profile is what companies search, so it is the best way to get offers."}</p>
          {gate.complete ? null : (
            <ButtonLink href="/intern/profile" size="sm" className="max-sm:w-full">Improve your profile</ButtonLink>
          )}
        </div>
      </Callout>

      {all.length === 0 ? (
        <EmptyScene
          art
          title="No roles are open at the moment"
          body="Companies post projects as they open them, and this list fills up regularly. Your profile is what they search, so the most useful thing you can do while this is empty is make sure it is complete."
          next={{ label: "Check what employers can see", href: "/intern/profile" }}
          who="You are in control here"
        />
      ) : (
        <div className="space-y-4">
          <Toolbar className="gap-3">
            <form action="/intern/opportunities" role="search" className="relative w-full lg:w-80">
              {mode !== "all" ? <input type="hidden" name="mode" value={mode} /> : null}
              {sort !== "match" ? <input type="hidden" name="sort" value="newest" /> : null}
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-subtle" aria-hidden />
              <input
                type="search"
                name="q"
                defaultValue={q}
                placeholder="Search by role, skill or city"
                aria-label="Search open roles"
                className={controlClass(undefined, "pl-9")}
              />
            </form>
            <FilterTabs
              label="Work mode"
              value={mode}
              hrefFor={hrefFor}
              tabs={[{ key: "all", label: "All" }, ...Object.entries(MODE).map(([key, label]) => ({ key, label }))]}
            />
            <div className="flex items-center gap-2 lg:ml-auto">
              <span className="text-sm text-text-subtle">Sort by</span>
              <FilterTabs
                label="Sort roles"
                value={sort}
                hrefFor={sortHref}
                tabs={[{ key: "match", label: "Best match" }, { key: "newest", label: "Newest" }]}
              />
            </div>
          </Toolbar>

          <p className="nums flex flex-wrap items-center gap-x-3 text-sm text-text-subtle" aria-live="polite">
            <span>
              {filtered ? `${rows.length} of ${all.length}` : all.length} open role{all.length === 1 ? "" : "s"}
              {applied.size > 0 ? ` · ${applied.size} with an offer for you` : ""}
            </span>
            {filtered && rows.length > 0 ? (
              <Link
                href="/intern/opportunities"
                className="rounded-apple-sm font-medium text-brand-700 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 touch:min-h-11 touch:inline-flex touch:items-center"
              >
                Clear filters
              </Link>
            ) : null}
          </p>

          {rows.length === 0 ? (
            <EmptyScene
              title="No roles match that search"
              body="Try a broader word, or reset the search to see every open role."
              next={{ label: "Reset search", href: "/intern/opportunities" }}
            />
          ) : (
            <ul className="grid gap-4 xl:grid-cols-2">
              {rows.map((role) => (
                <li key={role.id} className="min-w-0">
                  <InternRoleCard role={role} considered={applied.has(role.id)} offerHref={offerFor.get(role.id)} mine={mine} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Stagger>
  );
}
