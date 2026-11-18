import Link from "next/link";

import { Panel, PanelHeader } from "@/components/admin/panel";
import { RankCard } from "@/components/admin/reports/rank-card";
import { SearchForm } from "@/components/admin/reports/filter-bar";
import { SimpleTable } from "@/components/admin/reports/simple-table";
import { cityMatches } from "@/lib/admin/reports/city";
import { reportHref } from "@/lib/admin/reports/href";
import { loadGeography } from "@/lib/admin/reports/interns-load";
import { formatNumber } from "@/lib/format";

import type { TabProps } from "../types";

const TOP = 12;
const SEARCH_MAX = 40;

/** Interns by city (spelling variants folded: Jaipur, jaypur, Jaipur Rajasthan are one city), a city search, and by state. */
export default async function Geography({ params }: TabProps) {
  const g = await loadGeography();
  const q = (params.gq ?? "").trim();
  const matched = q ? g.cities.filter((c) => cityMatches(q, c.key)) : g.cities;
  const shown = matched.slice(0, q ? SEARCH_MAX : TOP);
  const pct = (n: number) => (g.withCity > 0 ? `${((n / g.withCity) * 100).toFixed(n / g.withCity < 0.1 ? 1 : 0)}%` : "0%");
  const here = (patch: Record<string, string>) => reportHref(params, patch, ["ipage"]);

  return (
    <div className="grid gap-5 lg:gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]" data-rp="interns-geo">
      <Panel>
        <PanelHeader
          title="Interns by city"
          description={`${formatNumber(g.withCity)} of ${formatNumber(g.totalInterns)} interns gave a city; ${formatNumber(g.distinctCities)} different cities. Spelling and case variants are counted as one city.`}
          action={<SearchForm params={params} name="gq" label="Search cities" placeholder="Search a city, e.g. Jaipur" drop={["ipage"]} />}
        />
        <SimpleTable
          caption="Interns by city"
          head={["City", "State", "Interns", "Share", "Show them"]}
          right={[2, 3]}
          maxHeight="max-h-[26rem]"
          rows={shown.map((c) => [
            c.label,
            c.state ?? "-",
            formatNumber(c.count),
            pct(c.count),
            <Link key="l" href={`${here({ icity: c.key })}#intern-table`} scroll className="rounded-sm font-medium text-[color:var(--admin-tile)] underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
              Filter table<span className="sr-only"> to {c.label}</span>
            </Link>,
          ])}
          empty={q ? { title: "No city matches", body: `No intern city looks like "${q}". Check the spelling or clear the search.` } : { title: "No cities yet", body: "Interns appear here once they fill the city on their profile." }}
        />
        {matched.length > shown.length ? (
          <p className="px-[var(--admin-pad-panel)] pb-4 pt-2 text-sm text-text-subtle">
            Showing {shown.length} of {formatNumber(matched.length)} cities. {q ? "Narrow the search to see the rest." : "Search a city to see any other."}
          </p>
        ) : null}
      </Panel>
      <RankCard
        title="Interns by state"
        description="From the state on the profile (top 12)."
        groups={[{ title: "State", rows: g.states.map((s) => ({ label: s.state, value: s.count })) }]}
        empty="No intern has given a state yet."
      />
    </div>
  );
}
