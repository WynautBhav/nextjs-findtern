import { Download } from "lucide-react";

import { IdentityCell } from "@/components/admin/data-table";
import { AdminLoadError, Panel, PanelBody, PanelHeader } from "@/components/admin/panel";
import { FILTER_CONTROL } from "@/components/admin/filter-controls";
import { cn } from "@/lib/utils";
import { ADMIN_PILL_PRIMARY } from "@/components/admin/surface";
import { ChipLinks, DateRangeForm } from "@/components/admin/report-range";
import { ChartCard } from "@/components/admin/reports/chart-card";
import { Funnel } from "@/components/admin/reports/funnel";
import { RankCard } from "@/components/admin/reports/rank-card";
import { StatStrip, trendOf } from "@/components/admin/reports/stat-strip";
import { SimpleTable } from "@/components/admin/reports/simple-table";
import { formatPercentDelta } from "@/lib/admin/reports-shape";
import { StatusBadge } from "@/components/admin/status-badge";
import { ButtonAnchor } from "@/components/ui/button";
import { filterCompanies, filterHires, type Analytics, type HireFilter } from "@/lib/admin/analytics";
import { loadAnalytics } from "@/lib/admin/analytics-load";
import { Pager } from "@/components/admin/pagination";
import { toPage } from "@/lib/admin/params";
import { reportHref } from "@/lib/admin/reports/href";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import type { TabProps } from "../types";

const BASE = "/admin/reports";

/**
 * Legacy's analytics report (routes.ts:5455-6400), ported with USD converted and test employers excluded: the
 * "Hiring analytics" section of the Overview tab (it was /admin/reports/analytics). Same loader and figures;
 * the period is the tab's window (Today / week / month, a preset or custom dates).
 */
export default async function HiringAnalytics({ window: w, params }: TabProps) {
  const range = { since: w.since, until: w.until };
  let a: Analytics | null = null;
  try {
    a = await loadAnalytics(range);
  } catch (error) {
    console.error("[admin/reports/analytics] load failed", error);
  }
  const query = new URLSearchParams(params).toString();
  const rate = (v: number | null, suffix = "%") => (v == null ? "-" : `${v}${suffix}`);
  const link = (patch: Record<string, string>) => reportHref(params, patch, "hp" in patch ? [] : ["hp"]);

  const header = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 id="hiring-analytics" className="text-lg font-semibold tracking-[-0.01em] text-foreground">
        Hiring analytics
        <span className="ml-2 text-sm font-normal text-text-subtle">Money in INR (USD at ₹100/$); test employers excluded.</span>
      </h2>
      <ButtonAnchor href={`/api/admin/reports/analytics?${query}${query ? "&" : ""}download=1`} variant="primary" size="sm" className={ADMIN_PILL_PRIMARY}>
        <Download className="size-4" aria-hidden />
        Export JSON
      </ButtonAnchor>
    </div>
  );

  if (!a) {
    return (
      <section aria-labelledby="hiring-analytics" className="space-y-5 lg:space-y-6" data-rp="hiring-analytics">
        {header}
        <Panel>
          <AdminLoadError what="hiring analytics" retryHref={reportHref(params, {})} />
        </Panel>
      </section>
    );
  }

  // Top companies: legacy "active" = has a project (ADM-15).
  const companyStatus = params.companies === "active" || params.companies === "inactive" ? params.companies : "";
  const companyQuery = (params.cq ?? "").trim();
  const companies = filterCompanies(a.topCompanies, { status: companyStatus, q: companyQuery }).slice(0, 10);

  const hireFilter: HireFilter = {
    kind: params.hired === "internship" || params.hired === "full-time" ? params.hired : "",
    from: /^\d{4}-\d{2}-\d{2}$/.test(params.hiredFrom ?? "") ? params.hiredFrom! : "",
    to: /^\d{4}-\d{2}-\d{2}$/.test(params.hiredTo ?? "") ? params.hiredTo! : "",
    q: params.hq ?? "",
  };
  const allHires = filterHires(a.hiredList, hireFilter);
  // Ten to a page, as the legacy hires table did; the filters above reset to page 1 through the links.
  const HIRES_PER_PAGE = 10;
  const hiresPage = toPage([], allHires.length, Math.max(1, Number.parseInt(params.hp ?? "1", 10) || 1), HIRES_PER_PAGE);
  const hires = allHires.slice((hiresPage.page - 1) * HIRES_PER_PAGE, hiresPage.page * HIRES_PER_PAGE);

  return (
    <section aria-labelledby="hiring-analytics" className="space-y-5 lg:space-y-6" data-rp="hiring-analytics">
      {header}

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
          { label: "New companies", value: formatNumber(a.totals.companies), note: `${a.totals.activeEmployers} active in the range` },
          { label: "Active projects", value: formatNumber(a.totals.activeProjects), note: `${a.totals.projects} posted in the range` },
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
            {
              key: "growth",
              tab: "Interns and companies",
              title: "Is the platform growing?",
              note: "New interns (profile started) and new companies per month in the range.",
              unit: "Count per month",
              format: "count",
              series: [
                { label: "New interns", tone: "current", points: a.trend.map((t) => ({ x: t.month, y: t.interns })) },
                { label: "New companies", tone: "previous", points: a.trend.map((t) => ({ x: t.month, y: t.companies })) },
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
            head={["Month", "Offers", "Hires", "Success", "Interview rate", "New interns", "New companies"]}
            right={[1, 2, 3, 4, 5, 6]}
            rows={a.trend.map((t) => [t.month, String(t.proposals), String(t.hires), `${t.successRate}%`, `${t.interviewRate}%`, String(t.interns), String(t.companies)])}
            empty={{ title: "No months to show", body: "There is no activity between these dates. Choose a wider range to see more." }}
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

      <RankCard
        title="Offers and where interns are"
        description="Both are all time, not limited to the range."
        groups={[
          { title: "Offer status", note: "Every offer ever sent, grouped as the old report did. Hired is a paid hire, as everywhere else; accepted offers still being paid for are apart.", rows: a.applicationStatus.map((x) => ({ label: x.name, value: x.value })) },
          { title: "Interns by city", note: "Top six cities; Others is the rest", rows: a.cities.map((x) => ({ label: x.city, value: x.count, display: `${formatNumber(x.count)} \u00b7 ${x.percentage}%` })) },
        ]}
      />

      <div className="grid gap-[var(--admin-gap)] xl:grid-cols-2">
        <Panel>
          <PanelHeader
            title="Top companies"
            description="By hires in the range, then offers sent. Active means the company has posted a project."
            action={
              <div className="flex flex-wrap items-center gap-2">
              <form method="get">
                <input
                  type="search"
                  name="cq"
                  defaultValue={companyQuery}
                  placeholder="Search company"
                  aria-label="Search companies"
                  className={cn(FILTER_CONTROL, "w-44")}
                />
                {Object.entries(params)
                  .filter(([k, v]) => v && k !== "cq")
                  .map(([k, v]) => (
                    <input key={k} type="hidden" name={k} value={v} />
                  ))}
                <button type="submit" className="sr-only">Search companies</button>
              </form>
              <ChipLinks
                label="Company status"
                items={[
                  { href: link({ companies: "" }), label: "All", current: !companyStatus },
                  { href: link({ companies: "active" }), label: "Active", current: companyStatus === "active" },
                  { href: link({ companies: "inactive" }), label: "Inactive", current: companyStatus === "inactive" },
                ]}
              />
              </div>
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
            empty={{
              title: companyStatus || companyQuery ? "No company matches" : "No company activity",
              body: companyStatus || companyQuery ? "No company fits this status or name between these dates. Clear a filter or choose a wider range." : "No company sent offers or hired between these dates. Choose a wider range to see more.",
            }}
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
            empty={{ title: "No candidate activity", body: "Candidates appear here once they apply, interview or receive an offer in the range you chose." }}
          />
        </Panel>
      </div>

      <Panel>
        <PanelHeader
          title={`Hires in this range (${allHires.length})`}
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
              className={cn(FILTER_CONTROL, "w-52")}
            />
            {Object.entries(params)
              .filter(([k, v]) => v && !["hq", "hiredFrom", "hiredTo", "hp"].includes(k))
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
          empty={
            a.hiredList.length
              ? { title: "No hires match", body: "No hire fits these filters. Clear a filter to see them all." }
              : { title: "No hires in this range", body: "No hire was made between these dates. Choose a wider range to see more." }
          }
        />
        <Pager page={hiresPage.page} pages={hiresPage.pages} total={allHires.length} perPage={HIRES_PER_PAGE} rowsShown={hires.length} params={params} basePath={BASE} noun="hires" pageKey="hp" />
      </Panel>
    </section>
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
