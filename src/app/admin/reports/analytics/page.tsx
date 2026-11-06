import type { Metadata } from "next";
import { Download } from "lucide-react";

import { IdentityCell } from "@/components/admin/data-table";
import { AdminLoadError, AdminPageHeader, Panel, PanelBody, PanelHeader } from "@/components/admin/panel";
import { ADMIN_PILL_PRIMARY, ADMIN_PILL_SECONDARY } from "@/components/admin/surface";
import { ChipLinks, DateRangeForm } from "@/components/admin/report-range";
import { ChartCard } from "@/components/admin/reports/chart-card";
import { Funnel } from "@/components/admin/reports/funnel";
import { PeriodBar } from "@/components/admin/reports/period-bar";
import { RankCard } from "@/components/admin/reports/rank-card";
import { StatStrip, trendOf } from "@/components/admin/reports/stat-strip";
import { formatPercentDelta } from "@/lib/admin/reports-shape";
import { StatusBadge } from "@/components/admin/status-badge";
import { ButtonAnchor, ButtonLink } from "@/components/ui/button";
import { filterHires, type Analytics, type HireFilter } from "@/lib/admin/analytics";
import { analyticsRange, loadAnalytics } from "@/lib/admin/analytics-load";
import { flattenParams, type RawSearchParams } from "@/lib/admin/params";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Hiring analytics" };

const BASE = "/admin/reports/analytics";

/** Legacy's analytics report (routes.ts:5455-6400), ported with USD converted and test employers excluded. */
export default async function AdminAnalyticsPage({ searchParams }: { searchParams?: Promise<RawSearchParams> }) {
  const params = flattenParams(await searchParams);
  const range = analyticsRange(params);
  let a: Analytics | null = null;
  try {
    a = await loadAnalytics(range);
  } catch (error) {
    console.error("[admin/reports/analytics] load failed", error);
  }
  const query = new URLSearchParams(params).toString();
  const rate = (v: number | null, suffix = "%") => (v == null ? "-" : `${v}${suffix}`);
  const link = (patch: Record<string, string>) => {
    const q = new URLSearchParams({ ...params, ...patch });
    for (const [k, v] of [...q.entries()]) if (!v) q.delete(k);
    const s = q.toString();
    return s ? `${BASE}?${s}` : BASE;
  };

  const header = (
    <AdminPageHeader
      title="Hiring analytics"
      subtitle="Money in INR (USD at ₹100/$); test employers excluded."
      action={
        <>
          <ButtonLink href="/admin/reports" variant="outline" size="sm" className={ADMIN_PILL_SECONDARY}>
            Reports
          </ButtonLink>
          <ButtonAnchor
            href={`/api/admin/reports/analytics?${query}${query ? "&" : ""}download=1`}
            variant="primary"
            size="sm"
            className={ADMIN_PILL_PRIMARY}
          >
            <Download className="size-4" aria-hidden />
            Export JSON
          </ButtonAnchor>
        </>
      }
    />
  );

  if (!a) {
    return (
      <div className="space-y-5 lg:space-y-6">
        {header}
        <Panel>
          <AdminLoadError what="hiring analytics" retryHref={BASE} />
        </Panel>
      </div>
    );
  }

  // Top companies: legacy "active" = has a project (ADM-15).
  const companyStatus = params.companies === "active" || params.companies === "inactive" ? params.companies : "";
  const companies = a.topCompanies.filter((c) => !companyStatus || c.status === companyStatus).slice(0, 10);

  const hireFilter: HireFilter = {
    kind: params.hired === "internship" || params.hired === "full-time" ? params.hired : "",
    from: /^\d{4}-\d{2}-\d{2}$/.test(params.hiredFrom ?? "") ? params.hiredFrom! : "",
    to: /^\d{4}-\d{2}-\d{2}$/.test(params.hiredTo ?? "") ? params.hiredTo! : "",
    q: params.hq ?? "",
  };
  const hires = filterHires(a.hiredList, hireFilter);

  return (
    <div className="space-y-5 lg:space-y-6">
      {header}
      <PeriodBar basePath={BASE} params={params} defaultValue="" defaultLabel="Last 18 months" />

      <StatStrip
        stats={[
          {
            label: "Signups",
            value: formatNumber(a.totals.signups),
            note: a.rates.monthlyGrowth == null ? `${a.totals.activeUsers} with a real profile` : `vs previous period \u00b7 ${a.totals.activeUsers} with a real profile`,
            delta: a.rates.monthlyGrowth == null ? undefined : formatPercentDelta(Math.round(a.rates.monthlyGrowth)),
            trend: trendOf(a.rates.monthlyGrowth == null ? null : Math.round(a.rates.monthlyGrowth)),
          },
          { label: "Hires", value: formatNumber(a.totals.hires), accent: true, note: `${a.totals.fullTimeHires} full-time \u00b7 ${a.totals.proposals} offers sent` },
          {
            label: "Revenue",
            value: formatMoney(a.totals.revenueMinor, "INR", { zeroLabel: "\u20b90" }),
            note: `Companies ${formatMoney(a.totals.revenueEmployersMinor, "INR", { zeroLabel: "\u20b90" })} \u00b7 Fees ${formatMoney(a.totals.revenueInternsMinor, "INR", { zeroLabel: "\u20b90" })} \u00b7 Colleges ${formatMoney(a.totals.revenueCollegesMinor, "INR", { zeroLabel: "\u20b90" })}`,
          },
          { label: "Avg time to hire", value: a.rates.avgHireTimeDays == null ? "-" : `${a.rates.avgHireTimeDays} days`, note: "Offer sent to employer paid" },
        ]}
      />

      <div className="grid gap-[var(--admin-gap)] xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Panel>
          <PanelHeader
            title="Where do signups drop out?"
            description="Interns who signed up in the range, by the furthest step they reached. Shares are of signups."
          />
          <PanelBody>
            <Funnel ariaLabel="Conversion funnel" steps={a.funnel.map((f) => ({ label: f.stage, count: f.value }))} />
          </PanelBody>
        </Panel>

        <div className="grid content-start gap-[var(--admin-gap)]">
          <Panel>
            <PanelHeader title="Employer behaviour" description="Active: posted a project or sent an offer in the range. Repeat: paid two or more orders." />
            <PanelBody>
              <dl className="grid grid-cols-3 gap-4">
                <Ratio label="Active employers" value={rate(a.rates.activeEmployerRate)} note={`${a.totals.activeEmployers} companies`} />
                <Ratio label="Repeat employers" value={rate(a.rates.repeatEmployerRate)} note={`${a.totals.repeatEmployers} of the active`} />
                <Ratio label="Active projects" value={rate(a.rates.activeProjectRate)} note={`${a.totals.activeProjects} of ${a.totals.projects}`} />
              </dl>
            </PanelBody>
          </Panel>
          <Panel>
            <PanelHeader title="Rates" description="Within the selected range." />
            <dl className="mt-2 divide-y divide-[color:var(--admin-rule)] px-[var(--admin-pad-panel)] pb-2 text-sm">
              {[
                ["Offer success", rate(a.rates.successRate)],
                ["Placement", rate(a.rates.placementRate)],
                ["Interview", rate(a.rates.interviewRate)],
                ["Profile completion", rate(a.rates.profileCompletionRate)],
                ["Offer \u2192 hire per intern", rate(a.rates.applicationSuccessRate)],
                ["Offers per signup", rate(a.rates.avgAppsPerUser, "")],
                ["Projects per company", rate(a.rates.projectsPerCompany, "")],
                ["Hires per company", rate(a.rates.hiresPerCompany, "")],
                ["Signup growth", a.rates.monthlyGrowth == null ? "-" : `${a.rates.monthlyGrowth}%`],
              ].map(([k, v]) => (
                <div key={k} className="flex items-baseline justify-between gap-4 py-2">
                  <dt className="text-text-subtle">{k}</dt>
                  <dd className="nums text-right font-semibold text-foreground">{v}</dd>
                </div>
              ))}
            </dl>
          </Panel>
        </div>
      </div>

      <div>
        <ChartCard
          views={[
            {
              key: "perf",
              tab: "Offers and hires",
              title: "Are offers turning into hires?",
              note: "Offers sent and hires per month in the range. Success is hires divided by offers.",
              unit: "Count per month",
              format: "count",
              series: [
                { label: "Offers", tone: "current", points: a.trend.map((t) => ({ x: t.month, y: t.proposals })) },
                { label: "Hires", tone: "previous", points: a.trend.map((t) => ({ x: t.month, y: t.hires })) },
              ],
            },
          ]}
        />
        <details className="group mt-2 overflow-hidden rounded-[var(--radius-admin-card)] bg-[color:var(--admin-panel)] shadow-[var(--admin-shadow)]">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-[var(--admin-pad-panel)] py-3 text-sm font-medium text-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
            Month by month figures
            <span aria-hidden className="text-text-subtle group-open:rotate-180">{"\u25be"}</span>
          </summary>
          <SimpleTable
            minWidth="lg:min-w-[32rem]"
            head={["Month", "Offers", "Hires", "Success", "Interview rate"]}
            right={[1, 2, 3, 4]}
            rows={a.trend.map((t) => [t.month, String(t.proposals), String(t.hires), `${t.successRate}%`, `${t.interviewRate}%`])}
            empty="No months in this range."
          />
        </details>
      </div>

      <RankCard
        title="What employers are asking for"
        description="Projects posted in the range."
        groups={[
          { title: "Skills in demand", note: "Projects asking for each skill", rows: a.skillDemand.map((x) => ({ label: x.skill, value: x.count })) },
          { title: "Highest-paying skills", note: "Average monthly offer (INR)", rows: a.highestPayingSkills.map((x) => ({ label: x.skill, value: x.avgMonthlyMinor, display: formatMoney(x.avgMonthlyMinor, "INR") })) },
          { title: "Demand by region", note: "Projects by state or city", rows: a.regionDemand.map((x) => ({ label: x.region, value: x.count })) },
        ]}
      />

      <div className="grid gap-[var(--admin-gap)] xl:grid-cols-2">
        <Panel>
          <PanelHeader
            title="Top companies"
            description="By hires in the range, then offers sent. Active means the company has posted a project."
            action={
              <ChipLinks
                label="Company status"
                items={[
                  { href: link({ companies: "" }), label: "All", current: !companyStatus },
                  { href: link({ companies: "active" }), label: "Active", current: companyStatus === "active" },
                  { href: link({ companies: "inactive" }), label: "Inactive", current: companyStatus === "inactive" },
                ]}
              />
            }
          />
          <SimpleTable
            minWidth="lg:min-w-[32rem]"
            head={["Company", "Status", "Projects", "Offers", "Internship / FT hires", "Conversion"]}
            right={[2, 3, 4, 5]}
            rows={companies.map((c) => [
              <IdentityCell key="n" name={c.name} id={c.id} href={`/admin/companies/${c.id}`} size="sm" />,
              <StatusBadge key="s" value={c.status} />,
              String(c.projects),
              String(c.proposals),
              `${c.internshipHires} / ${c.fullTimeHires}`,
              `${c.conversion}%`,
            ])}
            empty={companyStatus ? `No ${companyStatus} companies with activity in this range.` : "No company activity in this range."}
          />
        </Panel>

        <Panel>
          <PanelHeader title="Top candidates" description="By hires, then interviews, then offers received (all time)." />
          <SimpleTable
            minWidth="lg:min-w-[30rem]"
            head={["Candidate", "Offers received", "Interviews", "Placed", "Status"]}
            right={[1, 2, 3]}
            rows={a.topInterns.map((i) => [
              <IdentityCell key="n" name={i.name} id={i.id} href={`/admin/interns/${i.id}`} size="sm" />,
              String(i.applications),
              String(i.interviews),
              String(i.offers),
              <StatusBadge key="s" value={i.status === "placed" ? "hired" : i.status === "interviewing" ? "scheduled" : "sent"} label={i.status[0].toUpperCase() + i.status.slice(1)} />,
            ])}
            empty="No candidate activity yet."
          />
        </Panel>
      </div>

      <Panel>
        <PanelHeader
          title={`Hires in this range (${hires.length})`}
          description="Internship and full-time, newest first. Filter by type, hire date or name."
        />
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[color:var(--admin-rule)] px-[var(--admin-pad-panel)] py-3.5">
          <ChipLinks
            label="Hire type"
            items={[
              { href: link({ hired: "" }), label: "All", current: !hireFilter.kind },
              { href: link({ hired: "internship" }), label: "Internship", current: hireFilter.kind === "internship" },
              { href: link({ hired: "full-time" }), label: "Full-time", current: hireFilter.kind === "full-time" },
            ]}
          />
          <form method="get" className="flex flex-wrap items-end gap-2">
            <input
              type="search"
              name="hq"
              defaultValue={hireFilter.q}
              placeholder="Candidate or company"
              aria-label="Search hires"
              className="h-10 w-52 rounded-full bg-[color:var(--admin-panel-2)] px-4 text-base sm:text-sm text-foreground placeholder:text-text-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring touch:min-h-11"
            />
            {Object.entries(params)
              .filter(([k, v]) => v && !["hq", "hiredFrom", "hiredTo"].includes(k))
              .map(([k, v]) => (
                <input key={k} type="hidden" name={k} value={v} />
              ))}
            <input type="hidden" name="hiredFrom" value={hireFilter.from} />
            <input type="hidden" name="hiredTo" value={hireFilter.to} />
            {/* Enter searches; the dates below apply themselves. */}
            <button type="submit" className="sr-only">Search hires</button>
          </form>
          <DateRangeForm params={params} fromKey="hiredFrom" toKey="hiredTo" fromLabel="Hired from" />
        </div>
        <SimpleTable
          minWidth="lg:min-w-[30rem]"
          head={["Candidate", "Company", "Type", "Hired"]}
          right={[3]}
          rows={hires.map((h) => [
            <IdentityCell key="n" name={h.internName} id={h.internId} href={`/admin/interns/${h.internId}`} size="sm" />,
            h.companyName,
            h.kind === "full-time" ? "Full-time" : "Internship",
            formatDate(h.hiredAt),
          ])}
          empty={a.hiredList.length ? "No hires match these filters." : "No hires in this range."}
        />
      </Panel>
    </div>
  );
}

function Ratio({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div>
      <dt className="text-[0.8125rem] leading-snug text-text-subtle">{label}</dt>
      <dd className="nums mt-0.5 text-2xl font-semibold tracking-[-0.02em] text-foreground">{value}</dd>
      {note ? <dd className="text-xs text-text-subtle">{note}</dd> : null}
    </div>
  );
}

/** A small read-only table in the DataTable treatment (sticky sentence-case header, right-aligned figures, no zebra). */
function SimpleTable({
  head,
  rows,
  right = [],
  empty,
  minWidth,
}: {
  head: string[];
  rows: React.ReactNode[][];
  right?: number[];
  empty: string;
  minWidth: string;
}) {
  if (rows.length === 0) return <p className="px-[var(--admin-pad-panel)] py-8 text-center text-sm text-text-subtle">{empty}</p>;
  return (
    // Focusable, so the inner scroll can be reached from the keyboard (axe scrollable-region-focusable).
    <div tabIndex={0} role="region" aria-label={`${head[0]} table`} data-stack className="max-h-[32rem] overflow-y-auto lg:overflow-auto focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring">
      <table className={cn("w-full text-left text-sm", minWidth)}>
        <thead>
          <tr className="border-b border-[color:var(--admin-rule)]">
            {head.map((h, i) => (
              <th key={h} scope="col" className={cn("sticky top-0 z-10 bg-[color:var(--admin-panel)] px-3 py-2.5 text-[0.8125rem] font-medium text-text-subtle first:pl-[var(--admin-pad-panel)] last:pr-[var(--admin-pad-panel)]", right.includes(i) && "text-right")}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri} className="border-b border-[color:var(--admin-rule)] last:border-0 hover:bg-[color:var(--admin-panel-2)]">
              {r.map((cell, i) => (
                <td
                  key={i}
                  {...(i === 0 ? { "data-title": "" } : { "data-label": head[i] })}
                  {...(cell === "-" || cell === "–" || cell === "—" ? { "data-empty": "" } : {})}
                  className={cn("px-3 py-2.5 text-foreground [overflow-wrap:anywhere] first:pl-[var(--admin-pad-panel)] last:pr-[var(--admin-pad-panel)]", right.includes(i) && "nums text-right")}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
