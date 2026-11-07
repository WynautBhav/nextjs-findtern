import type { Metadata } from "next";

import Link from "next/link";
import { ChevronDown, Search, SlidersHorizontal } from "lucide-react";

import { EmptyScene, PageHead, Pill, Surface } from "@/components/app/primitives";
import { controlClass } from "@/components/intern/onboarding/control-class";
import { OpportunityRow, WORK_MODE, matchSkills } from "@/components/intern/opportunity-row";
import { cn } from "@/lib/utils";
import { SaveRoleButton } from "@/components/intern/save-role-button";
import { proposalStatus } from "@/components/app/status";
import { isHiredProposal } from "@/lib/hire-status";
import { toArray } from "@/lib/journey";
import { readSkillRatings } from "@/lib/onboarding";
import { requireRole } from "@/lib/auth";
import { loadInternData, openProjects } from "@/lib/intern-data";
import { savedProjectIds } from "@/lib/saved-roles";

import { LockedRoles, rolesGate } from "./_gate";

export const metadata: Metadata = {
  title: "Open roles",
  robots: { index: false, follow: false },
};

/**
 * Open roles, signed in: one search, a filter column (saved, work mode, role
 * type; each option shows the count you would get), and one list of wide rows
 * (`OpportunityRow`, shared with the public browser at /opportunities). Rows
 * are best match first against the candidate's own skills, then newest. There
 * is nothing to apply to; the row's one action is Save.
 */
type Filters = { q: string; mode: string; ft: boolean; saved: boolean };

function hrefWith(f: Filters, patch: Partial<Filters>) {
  const next = { ...f, ...patch };
  const sp = new URLSearchParams();
  if (next.q) sp.set("q", next.q);
  if (next.mode !== "all") sp.set("mode", next.mode);
  if (next.ft) sp.set("ft", "1");
  if (next.saved) sp.set("view", "saved");
  return `/intern/opportunities${sp.size ? `?${sp}` : ""}`;
}

export default async function InternOpportunities({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[]; mode?: string | string[]; ft?: string | string[]; view?: string | string[] }>;
}) {
  const params = await searchParams;
  const one = (v?: string | string[]) => (Array.isArray(v) ? v[0] : v);
  const q = one(params.q)?.trim().slice(0, 80) ?? "";
  const rawMode = one(params.mode);
  const mode = rawMode && Object.hasOwn(WORK_MODE, rawMode) ? rawMode : "all";
  const f: Filters = { q, mode, ft: one(params.ft) === "1", saved: one(params.view) === "saved" };
  const session = await requireRole("intern");

  const [data, all, saved] = await Promise.all([loadInternData(session.uid), openProjects(60, { strict: true }), savedProjectIds(session.uid)]);
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
  // How many of a role's skills the candidate has. Roles are listed best match first; the list
  // arrives newest first and the sort is stable, so ties stay newest first.
  const overlap = (r: (typeof all)[number]) => matchSkills(r.skills, mine).matched;
  const passes = (r: (typeof all)[number], skip?: keyof Filters) =>
    (skip === "mode" || mode === "all" || r.locationType?.toLowerCase() === mode) &&
    (skip === "ft" || !f.ft || Boolean(r.fullTimeOffer)) &&
    (skip === "saved" || !f.saved || saved.has(r.id)) &&
    (!needle || [r.projectName, r.scopeOfWork, r.city, ...toArray<string>(r.skills)].some((v) => v?.toLowerCase().includes(needle)));
  const rows = all.filter((r) => passes(r)).sort((a, b) => overlap(b) - overlap(a));
  // Each option's count is what you would see after choosing it, so the numbers never lie.
  const countIf = (skip: keyof Filters, test: (r: (typeof all)[number]) => boolean) => all.filter((r) => passes(r, skip) && test(r)).length;
  const filtered = Boolean(q) || mode !== "all" || f.ft || f.saved;
  const active = [mode !== "all", f.ft, f.saved].filter(Boolean).length;

  const groups: FilterGroup[] = [
    {
      label: "Show",
      options: [
        { label: "All roles", href: hrefWith(f, { saved: false }), on: !f.saved, count: countIf("saved", () => true) },
        { label: "Saved", href: hrefWith(f, { saved: true }), on: f.saved, count: countIf("saved", (r) => saved.has(r.id)) },
      ],
    },
    {
      label: "Work mode",
      options: [
        { label: "Any", href: hrefWith(f, { mode: "all" }), on: mode === "all", count: countIf("mode", () => true) },
        ...Object.entries(WORK_MODE).map(([key, label]) => ({
          label,
          href: hrefWith(f, { mode: key }),
          on: mode === key,
          count: countIf("mode", (r) => r.locationType?.toLowerCase() === key),
        })),
      ],
    },
    {
      label: "Role type",
      options: [
        { label: "Any", href: hrefWith(f, { ft: false }), on: !f.ft, count: countIf("ft", () => true) },
        { label: "Can lead to full time", href: hrefWith(f, { ft: true }), on: f.ft, count: countIf("ft", (r) => Boolean(r.fullTimeOffer)) },
      ],
    },
  ];

  return (
    <div>
      <PageHead
        title="Open roles"
        lede="Companies search profiles and send offers. Save a role that fits your skills to move up in its company's search."
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
        <div className="grid gap-x-8 gap-y-4 lg:grid-cols-[13rem_minmax(0,1fr)]">
          <form action="/intern/opportunities" role="search" className="relative lg:col-span-2 lg:max-w-xl" data-first-content>
            {mode !== "all" ? <input type="hidden" name="mode" value={mode} /> : null}
            {f.ft ? <input type="hidden" name="ft" value="1" /> : null}
            {f.saved ? <input type="hidden" name="view" value="saved" /> : null}
            <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-text-subtle" aria-hidden />
            <input
              type="search"
              name="q"
              defaultValue={q}
              placeholder="Search by role, skill or city"
              aria-label="Search open roles"
              className={controlClass(undefined, "h-12 rounded-full pl-10 text-base")}
            />
          </form>

          <aside aria-label="Filters" className="max-lg:hidden">
            <FilterColumn groups={groups} />
          </aside>

          <div className="min-w-0">
            <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
              <p className="nums text-sm text-ink-600" aria-live="polite">
                <span className="font-semibold text-ink-900">{rows.length}</span>
                {filtered ? ` of ${all.length}` : ""} open role{rows.length === 1 ? "" : "s"}
                {rows.length > 1 && rows.some((r) => overlap(r) > 0) ? " · best match first" : ""}
              </p>
              {filtered ? (
                <Link
                  href="/intern/opportunities"
                  className="inline-flex min-h-11 items-center rounded-apple-sm text-sm font-medium text-brand-700 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 lg:min-h-0"
                >
                  Clear filters
                </Link>
              ) : null}
              {/* Phone and tablet: the same filters, folded away so the roles come first. */}
              <details className="group w-full lg:hidden">
                <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-full px-4 text-sm font-medium text-ink-800 ring-1 ring-inset ring-ink-200 hover:bg-ink-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 [&::-webkit-details-marker]:hidden">
                  <SlidersHorizontal className="size-4" aria-hidden />
                  Filters
                  {active > 0 ? <span className="nums rounded-full bg-brand-700 px-1.5 text-xs text-white">{active}</span> : null}
                  <ChevronDown className="size-4 transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden />
                </summary>
                <div className="mt-3 rounded-apple-lg bg-surface-raised p-4 ring-1 ring-ink-100">
                  <FilterColumn groups={groups} />
                </div>
              </details>
            </div>

            {rows.length === 0 ? (
              f.saved && !q && mode === "all" && !f.ft ? (
                <EmptyScene
                  title="No saved roles yet"
                  body="Tap the heart on a role to save it. Saving lifts you in that company's matches and never changes your Findtern Score."
                  next={{ label: "See all open roles", href: hrefWith(f, { saved: false }) }}
                />
              ) : (
                <EmptyScene
                  title="Nothing matches that"
                  body="Try a broader word, or clear the filters to see every open role."
                  next={{ label: "Clear filters", href: "/intern/opportunities" }}
                />
              )
            ) : (
              <Surface as="ul" className="divide-y divide-ink-100 overflow-hidden">
                {rows.map((role) => (
                  <li key={role.id}>
                    <OpportunityRow
                      role={role}
                      href={`/intern/opportunities/${role.id}`}
                      mine={mine}
                      status={applied.has(role.id) ? <Pill tone="live">Offer received</Pill> : null}
                      actions={<SaveRoleButton projectId={role.id} projectName={role.projectName} initialSaved={saved.has(role.id)} />}
                    />
                  </li>
                ))}
              </Surface>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

type FilterGroup = { label: string; options: { label: string; href: string; on: boolean; count: number }[] };

/** Radio-style filter links with live counts; a link per option, so filters survive a reload. */
function FilterColumn({ groups }: { groups: FilterGroup[] }) {
  return (
    <div className="space-y-5">
      {groups.map((g) => (
        <section key={g.label} aria-label={g.label}>
          <h2 className="mb-1.5 text-sm font-semibold text-ink-900">{g.label}</h2>
          <ul className="max-lg:flex max-lg:flex-wrap max-lg:gap-1.5">
            {g.options.map((o) => (
              <li key={o.label}>
                <Link
                  href={o.href}
                  scroll={false}
                  aria-current={o.on ? "true" : undefined}
                  className={cn(
                    "flex min-h-11 items-center gap-2.5 rounded-apple-sm text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 lg:min-h-9 lg:touch:min-h-11",
                    "max-lg:rounded-full max-lg:px-3.5 max-lg:ring-1 max-lg:ring-inset",
                    o.on
                      ? "font-medium text-ink-900 max-lg:bg-brand-700 max-lg:text-white max-lg:ring-brand-700"
                      : "text-ink-700 hover:text-ink-900 max-lg:ring-ink-200 max-lg:hover:bg-ink-50",
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "grid size-4 shrink-0 place-items-center rounded-full border max-lg:hidden",
                      o.on ? "border-brand-700 bg-brand-700" : "border-ink-300 bg-white",
                    )}
                  >
                    {o.on ? <span className="size-1.5 rounded-full bg-white" /> : null}
                  </span>
                  <span className="min-w-0 flex-1">{o.label}</span>
                  <span className={cn("nums text-xs", o.on ? "max-lg:text-white/80 lg:text-ink-600" : "text-text-subtle")}>{o.count}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
