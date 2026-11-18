import Link from "next/link";
import { Download } from "lucide-react";
import { count, sql } from "drizzle-orm";

import { Ledger } from "@/components/admin/money/ledger";
import { BarRank, BarTrend, RankGroup } from "@/components/admin/money/rp-bars";
import { Chips, LoadNote, RP_BUTTON, RP_FIELD, windowWords } from "@/components/admin/money/rp-parts";
import { Pager } from "@/components/admin/pagination";
import { DateRangeForm } from "@/components/admin/report-range";
import { Section } from "@/components/app/stat";
import { filterHires, type HireFilter } from "@/lib/admin/analytics";
import { toPage } from "@/lib/admin/params";
import { reportHref } from "@/lib/admin/reports/href";
import { realEmployerId } from "@/lib/admin/scope";
import { getDb, schema } from "@/lib/db";
import { formatDate, formatNumber } from "@/lib/format";

import { loadAnalyticsOnce } from "./analytics-data";
import type { TabProps } from "../types";

const BASE = "/admin/reports";
const HIRES_PER_PAGE = 10;

/**
 * The hiring detail: offers and hires by month, offer status, what is asked for and where, the candidates furthest along, and the
 * hires list (with its JSON export). The funnel, the rates, the skill and city lists and the company list that used to repeat here
 * are each shown once: the funnel and rates above, skills and companies on Employers, cities and states on Interns.
 */
export default async function HiringAnalytics({ window: w, params }: TabProps) {
  const query = new URLSearchParams(params).toString();
  let a: Awaited<ReturnType<typeof loadAnalyticsOnce>> | null = null;
  let modes: { label: string; value: number }[] = [];
  try {
    const db = getDb();
    const [data, modeRows] = await Promise.all([
      loadAnalyticsOnce(w.since ? w.since.getTime() : null, w.until ? w.until.getTime() : null),
      db
        .select({ mode: sql<string>`coalesce(${schema.projects.locationType}, 'Remote')`, c: count() })
        .from(schema.projects)
        .where(realEmployerId(schema.projects.employerId))
        .groupBy(sql`coalesce(${schema.projects.locationType}, 'Remote')`)
        .orderBy(sql`count(*) desc`),
    ]);
    a = data;
    modes = modeRows.map((r) => ({ label: r.mode, value: Number(r.c) }));
  } catch (error) {
    console.error("[admin/reports/analytics] load failed", error);
  }
  const label = windowWords(w);
  const link = (patch: Record<string, string>) => reportHref(params, patch, "hp" in patch ? [] : ["hp"]);
  const action = (
    <a href={`/api/admin/reports/analytics?${query}${query ? "&" : ""}download=1`} className={RP_BUTTON}>
      <Download className="size-4" aria-hidden />
      Export JSON
    </a>
  );
  if (!a) {
    return (
      <section data-rp="hiring-analytics" className="space-y-6">
        <Section title="Hiring detail" action={action}>
          <LoadNote what="the hiring detail" retryHref={reportHref(params, {})} />
        </Section>
      </section>
    );
  }

  const hireFilter: HireFilter = {
    kind: params.hired === "internship" || params.hired === "full-time" ? params.hired : "",
    from: /^\d{4}-\d{2}-\d{2}$/.test(params.hiredFrom ?? "") ? params.hiredFrom! : "",
    to: /^\d{4}-\d{2}-\d{2}$/.test(params.hiredTo ?? "") ? params.hiredTo! : "",
    q: params.hq ?? "",
  };
  const allHires = filterHires(a.hiredList, hireFilter);
  const hiresPage = toPage([], allHires.length, Math.max(1, Number.parseInt(params.hp ?? "1", 10) || 1), HIRES_PER_PAGE);
  const hires = allHires.slice((hiresPage.page - 1) * HIRES_PER_PAGE, hiresPage.page * HIRES_PER_PAGE);
  const bucket = "month" as const;

  return (
    <section data-rp="hiring-analytics" className="space-y-10 lg:space-y-12">
      <Section title="Hiring detail" action={action} hint={`Offers sent (drafts left out) and hires dated in each month ${label}. Success is hires divided by offers. Money in INR (USD at ₹100/$); test employers excluded.`}>
        <BarTrend
          ariaLabel="Offers sent and hires by month"
          bucket={bucket}
          unit="offers sent in a month"
          valueHeader="Offers sent"
          rows={a.trend.map((t) => ({ key: t.month, label: t.month, value: t.proposals }))}
          extras={[
            { header: "Hires", cells: a.trend.map((t) => (t.hires === 0 ? "none" : String(t.hires))) },
            { header: "Success", cells: a.trend.map((t) => (t.proposals === 0 ? "–" : `${t.successRate}%`)) },
            { header: "New companies", cells: a.trend.map((t) => (t.companies === 0 ? "none" : String(t.companies))) },
          ]}
          lastIsPartial={!w.until}
          emptyText="No offers were sent in these months. Choose a longer period above."
        />
      </Section>

      <div className="grid gap-x-12 gap-y-10 xl:grid-cols-2">
        <Section title="Offer status, all time" hint="Every offer ever sent, whatever the period. Accepted offers count as hired here, before the employer has paid, so this Hired is larger than the Hires figure above. Withdrawn includes expired offers.">
          <BarRank rows={a.applicationStatus.map((x) => ({ label: x.name, value: x.value }))} unit="offers" ariaLabel="Offers by status" emptyText="No offer has been sent yet." />
        </Section>
        <div className="space-y-10">
          <Section title="What employers ask for" hint={`Where projects posted ${label} are, and how every project is worked.`}>
            <div className="grid gap-x-8 gap-y-8 sm:grid-cols-2">
              <RankGroup title="Demand by region" note={`Projects posted ${label}, by state or city`} rows={a.regionDemand.map((x) => ({ label: x.region, value: x.count }))} unit="projects" ariaLabel="Projects by region" emptyText="No project was posted in this period." />
              <RankGroup title="Projects by work mode" note="Every project, any status, not limited to the period" rows={modes} unit="projects" ariaLabel="Projects by work mode" emptyText="No project has been posted yet." capitalize />
            </div>
          </Section>
        </div>
      </div>

      <Section title="Candidates furthest along" hint="All time: ranked by offers accepted or hired, then interviews, then offers received. Accepted counts before the employer has paid, so it is not the same as Hires.">
        <Ledger
          caption="Candidates furthest along"
          rowKey={(i) => i.id}
          rows={a.topInterns}
          empty={<p className="border-y border-ink-200 py-4 text-sm text-ink-700">No candidate has an offer or interview yet. They appear here once an employer sends one.</p>}
          columns={[
            { key: "n", header: "Candidate", primary: true, cell: (i) => <Link href={`/admin/interns/${i.id}`} className="font-medium underline decoration-ink-300 underline-offset-4 hover:decoration-ink-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">{i.name}</Link> },
            { key: "a", header: "Offers received", align: "right", cell: (i) => String(i.applications) },
            { key: "v", header: "Interviews", align: "right", cell: (i) => (i.interviews === 0 ? "none" : String(i.interviews)) },
            { key: "o", header: "Accepted or hired", align: "right", cell: (i) => (i.offers === 0 ? "none" : String(i.offers)) },
            { key: "s", header: "Furthest step", cell: (i) => (i.status === "placed" ? "Accepted or hired" : i.status === "interviewing" ? "Interviewing" : "Offered") },
          ]}
        />
      </Section>

      <Section title={`Hires ${label} (${formatNumber(allHires.length)})`} hint="Dated by when the employer paid. Internship and full-time, newest first. Filter by type, hire date or name.">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <Chips
            label="Hire type"
            items={[
              { href: link({ hired: "" }), label: "All", current: !hireFilter.kind },
              { href: link({ hired: "internship" }), label: "Internship", current: hireFilter.kind === "internship" },
              { href: link({ hired: "full-time" }), label: "Full-time", current: hireFilter.kind === "full-time" },
            ]}
          />
          <form method="get" className="flex flex-wrap items-end gap-2">
            <input type="search" name="hq" defaultValue={hireFilter.q} placeholder="Candidate or company" aria-label="Search hires" maxLength={80} className={`${RP_FIELD} w-52`} />
            {Object.entries(params)
              .filter(([k, v]) => v && !["hq", "hiredFrom", "hiredTo", "hp"].includes(k))
              .map(([k, v]) => (
                <input key={k} type="hidden" name={k} value={v} />
              ))}
            <input type="hidden" name="hiredFrom" value={hireFilter.from} />
            <input type="hidden" name="hiredTo" value={hireFilter.to} />
            {/* Enter searches; the dates apply themselves. */}
            <button type="submit" className="sr-only">
              Search hires
            </button>
          </form>
          <DateRangeForm params={params} fromKey="hiredFrom" toKey="hiredTo" fromLabel="Hired from" />
        </div>
        <Ledger
          caption="Hires in the period"
          rowKey={(h) => `${h.internId}-${h.companyId}-${h.hiredAt}`}
          rows={hires}
          empty={
            <p className="border-y border-ink-200 py-4 text-sm text-ink-700">
              {a.hiredList.length ? "No hire fits these filters. Clear a filter to see them all." : `No hire is dated ${label}. Pick a longer period above.`}
            </p>
          }
          columns={[
            { key: "n", header: "Candidate", primary: true, cell: (h) => <Link href={`/admin/interns/${h.internId}`} className="font-medium underline decoration-ink-300 underline-offset-4 hover:decoration-ink-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">{h.internName}</Link> },
            { key: "c", header: "Company", cell: (h) => h.companyName },
            { key: "t", header: "Type", cell: (h) => (h.kind === "full-time" ? "Full-time" : "Internship") },
            { key: "d", header: "Hired", align: "right", cell: (h) => formatDate(h.hiredAt) },
          ]}
        />
        <Pager page={hiresPage.page} pages={hiresPage.pages} total={allHires.length} perPage={HIRES_PER_PAGE} rowsShown={hires.length} params={params} basePath={BASE} noun="hires" pageKey="hp" />
      </Section>

      <p className="border-t border-ink-200 pt-4 text-sm text-ink-700">
        Skills in demand and the company list are on the{" "}
        <Link href={reportHref(params, { tab: "employers" }, ["hp"])} className="font-medium text-brand-800 underline decoration-brand-300 decoration-2 underline-offset-4 hover:decoration-brand-700">Employers tab</Link>; interns by city and state are on the{" "}
        <Link href={reportHref(params, { tab: "interns" }, ["hp"])} className="font-medium text-brand-800 underline decoration-brand-300 decoration-2 underline-offset-4 hover:decoration-brand-700">Interns tab</Link>.
      </p>
    </section>
  );
}
