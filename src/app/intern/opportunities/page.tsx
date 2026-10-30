import type { Metadata } from "next";

import Link from "next/link";
import { Search } from "lucide-react";

import { EmptyScene, FilterTabs, PageHead, Surface } from "@/components/app/primitives";
import { fieldClass } from "@/components/employer/ui-tokens";
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
  searchParams: Promise<{ q?: string | string[]; mode?: string | string[] }>;
}) {
  const params = await searchParams;
  const q = (Array.isArray(params.q) ? params.q[0] : params.q)?.trim().slice(0, 80) ?? "";
  const rawMode = Array.isArray(params.mode) ? params.mode[0] : params.mode;
  const mode = rawMode && Object.hasOwn(MODE, rawMode) ? rawMode : "all";
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
  const applied = new Set(data.proposals.filter((p) => isHiredProposal(p) || proposalStatus(p.status).tone !== "closed").map((p) => p.projectId).filter(Boolean));
  // shortcut: filters the newest 60 in memory, move into the query if the list grows past that.
  const needle = q.toLowerCase();
  const rows = all.filter(
    (r) =>
      (mode === "all" || r.locationType?.toLowerCase() === mode) &&
      (!needle ||
        [r.projectName, r.scopeOfWork, r.city, ...toArray<string>(r.skills)].some((v) => v?.toLowerCase().includes(needle))),
  );
  const filtered = Boolean(q) || mode !== "all";
  const hrefFor = (key: string) => {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    if (key !== "all") sp.set("mode", key);
    return `/intern/opportunities${sp.size ? `?${sp}` : ""}`;
  };

  return (
    <div>
      <PageHead
        title="Open roles"
        lede="Companies send offers to the profiles they like. There is nothing to apply to, so keep your profile sharp."
      />

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
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <form action="/intern/opportunities" role="search" className="relative lg:w-80">
              {mode !== "all" ? <input type="hidden" name="mode" value={mode} /> : null}
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-subtle" aria-hidden />
              <input
                type="search"
                name="q"
                defaultValue={q}
                placeholder="Search by role, skill or city"
                aria-label="Search open roles"
                className={`${fieldClass} pl-9`}
              />
            </form>
            <FilterTabs
              label="Work mode"
              value={mode}
              hrefFor={hrefFor}
              tabs={[{ key: "all", label: "All" }, ...Object.entries(MODE).map(([key, label]) => ({ key, label }))]}
            />
          </div>

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
              title="Nothing matches that"
              body="Try a broader word, or clear the filters to see every open role."
              next={{ label: "Clear filters", href: "/intern/opportunities" }}
            />
          ) : (
            <Surface as="ul" className="divide-y divide-ink-100 overflow-hidden">
              {rows.map((role) => (
                <li key={role.id}>
                  <InternRoleCard role={role} considered={applied.has(role.id)} mine={mine} />
                </li>
              ))}
            </Surface>
          )}
        </div>
      )}
    </div>
  );
}
