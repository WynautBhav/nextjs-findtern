import Link from "next/link";

import { Section } from "@/components/app/stat";
import { Ledger } from "@/components/admin/money/ledger";
import { BarRank } from "@/components/admin/money/rp-bars";
import { Said } from "@/components/admin/money/rp-parts";
import { SearchForm } from "@/components/admin/reports/filter-bar";
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
    <div className="grid gap-x-12 gap-y-10 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]" data-rp="interns-geo">
      <Section
        title="Interns by city"
        hint={`${formatNumber(g.withCity)} of ${formatNumber(g.totalInterns)} interns gave a city; ${formatNumber(g.distinctCities)} different cities. Spelling and case variants are counted as one city. The share is of those who gave a city.`}
      >
        <div className="mb-4">
          <SearchForm params={params} name="gq" label="Search cities" placeholder="Search a city, e.g. Jaipur" drop={["ipage"]} />
        </div>
        <Ledger
          caption="Interns by city"
          rows={shown}
          rowKey={(c) => c.key}
          empty={<Said>{q ? `No intern city looks like "${q}". Check the spelling or clear the search.` : "No intern has given a city yet. Cities appear when interns fill them on their profile."}</Said>}
          columns={[
            { key: "c", header: "City", primary: true, cell: (c) => c.label },
            { key: "s", header: "State", cell: (c) => c.state ?? "–" },
            { key: "n", header: "Interns", align: "right", cell: (c) => formatNumber(c.count) },
            { key: "p", header: "Share", align: "right", cell: (c) => pct(c.count) },
            {
              key: "l",
              header: "Show them",
              align: "right",
              cell: (c) => (
                <Link href={`${here({ icity: c.key })}#intern-table`} scroll className="rounded-sm font-medium text-brand-800 underline decoration-brand-300 decoration-2 underline-offset-4 hover:decoration-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                  Filter table<span className="sr-only"> to {c.label}</span>
                </Link>
              ),
            },
          ]}
        />
        {matched.length > shown.length ? (
          <p className="mt-3 text-sm text-ink-700">
            Showing {shown.length} of {formatNumber(matched.length)} cities. {q ? "Narrow the search to see the rest." : "Search a city to see any other."}
          </p>
        ) : null}
      </Section>
      <Section title="Interns by state" hint="From the state on the profile (top 12).">
        <BarRank rows={g.states.map((s) => ({ label: s.state, value: s.count }))} unit="interns" ariaLabel="Interns by state" emptyText="No intern has given a state yet. States appear when interns fill them on their profile." />
      </Section>
    </div>
  );
}
