import type { Metadata } from "next";
import { Download } from "lucide-react";

import { LineDuo } from "@/components/admin/charts/line-duo";
import { IdentityCell } from "@/components/admin/data-table";
import { AdminLoadError, AdminPageHeader, Panel, PanelBody, PanelHeader } from "@/components/admin/panel";
import { ADMIN_PILL_PRIMARY, ADMIN_PILL_SECONDARY } from "@/components/admin/surface";
import { ChipLinks, DateRangeForm, ReportRange } from "@/components/admin/report-range";
import { StatCard, StatGrid } from "@/components/admin/stat-card";
import { StatusBadge } from "@/components/admin/status-badge";
import { PipelineBars } from "@/components/admin/trend-chart";
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
      <div className="space-y-6 lg:space-y-8">
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
    <div className="space-y-6 lg:space-y-8">
      {header}
      <ReportRange basePath={BASE} params={params} defaultLabel="Last 18 months" />

      <StatGrid cols={4}>
        <StatCard
          label="Signups"
          value={formatNumber(a.totals.signups)}
          hint={`${a.totals.activeUsers} with a real profile`}
          delta={a.rates.monthlyGrowth == null ? undefined : `${a.rates.monthlyGrowth > 0 ? "+" : ""}${a.rates.monthlyGrowth}% vs previous period`}
        />
        <StatCard featured label="Hires" value={formatNumber(a.totals.hires)} hint={`${a.totals.fullTimeHires} full-time · ${a.totals.proposals} offers sent`} />
        <StatCard
          label="Revenue"
          value={formatMoney(a.totals.revenueMinor, "INR", { zeroLabel: "₹0" })}
          hint={`Companies ${formatMoney(a.totals.revenueEmployersMinor, "INR", { zeroLabel: "₹0" })} · Fees ${formatMoney(a.totals.revenueInternsMinor, "INR", { zeroLabel: "₹0" })}`}
        />
        <StatCard label="Avg time to hire" value={a.rates.avgHireTimeDays == null ? "-" : `${a.rates.avgHireTimeDays} days`} hint="Offer sent to employer paid" />
      </StatGrid>

      <div className="grid gap-[var(--admin-gap)] lg:grid-cols-2">
        <Panel>
          <PanelHeader
            title="Conversion funnel"
            description="Interns who signed up in the range, by the furthest step they reached. Percentages are of signups; the biggest step down is the leak."
          />
          <PanelBody>
            <PipelineBars percentOf="first" items={a.funnel.map((f) => ({ status: f.stage, label: f.stage, count: f.value }))} />
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader
            title="Employer behaviour"
            description="Active: posted a project or sent an offer in the range. Repeat: paid two or more orders in the range."
          />
          <PanelBody>
            <dl className="grid gap-4 sm:grid-cols-3">
              <Ratio label="Active employers" value={rate(a.rates.activeEmployerRate)} note={`${a.totals.activeEmployers} companies`} />
              <Ratio label="Repeat employers" value={rate(a.rates.repeatEmployerRate)} note={`${a.totals.repeatEmployers} of the active ones`} />
              <Ratio label="Active projects" value={rate(a.rates.activeProjectRate)} note={`${a.totals.activeProjects} of ${a.totals.projects} posted`} />
            </dl>
          </PanelBody>
        </Panel>
      </div>

      <Panel>
        <PanelHeader title="Rates" description="Within the selected range." />
        <PanelBody>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 xl:grid-cols-5">
            {[
              ["Offer success", rate(a.rates.successRate)],
              ["Placement", rate(a.rates.placementRate)],
              ["Interview", rate(a.rates.interviewRate)],
              ["Profile completion", rate(a.rates.profileCompletionRate)],
              ["Offer → hire per intern", rate(a.rates.applicationSuccessRate)],
              ["Offers per signup", rate(a.rates.avgAppsPerUser, "")],
              ["Projects per company", rate(a.rates.projectsPerCompany, "")],
              ["Hires per company", rate(a.rates.hiresPerCompany, "")],
              ["Signup growth", a.rates.monthlyGrowth == null ? "-" : `${a.rates.monthlyGrowth}%`],
            ].map(([k, v]) => (
              <Ratio key={k} label={k} value={v} />
            ))}
          </dl>
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader title="Monthly performance" description="Offers sent, hires, offer success (hires ÷ offers) and interview rate per month." />
        {a.trend.length >= 2 ? (
          <PanelBody>
            <LineDuo
              ariaLabel="Offers sent and hires per month"
              series={[
                { label: "Offers", tone: "current", points: a.trend.map((t) => ({ x: t.month, y: t.proposals })) },
                { label: "Hires", tone: "previous", points: a.trend.map((t) => ({ x: t.month, y: t.hires })) },
              ]}
            />
          </PanelBody>
        ) : null}
        <SimpleTable
          minWidth="lg:min-w-[32rem]"
          head={["Month", "Offers", "Hires", "Success", "Interview rate"]}
          right={[1, 2, 3, 4]}
          rows={a.trend.map((t) => [t.month, String(t.proposals), String(t.hires), `${t.successRate}%`, `${t.interviewRate}%`])}
          empty="No months in this range."
        />
      </Panel>

      <div className="grid gap-[var(--admin-gap)] lg:grid-cols-3">
        <RankList title="Skills in demand" note="Projects asking for each skill" rows={a.skillDemand.map((s) => [s.skill, `${s.count}`])} />
        <RankList title="Highest-paying skills" note="Average monthly offer (INR)" rows={a.highestPayingSkills.map((s) => [s.skill, formatMoney(s.avgMonthlyMinor, "INR")])} />
        <RankList title="Demand by region" note="Projects by state or city" rows={a.regionDemand.map((r) => [r.region, `${r.count}`])} />
      </div>

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
      <dt className="text-sm text-text-subtle">{label}</dt>
      <dd className="nums mt-0.5 text-xl font-semibold text-foreground">{value}</dd>
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

function RankList({ title, note, rows }: { title: string; note: string; rows: [string, string][] }) {
  return (
    <Panel>
      <PanelHeader title={title} description={note} />
      <PanelBody>
        {rows.length === 0 ? (
          <p className="text-sm text-text-subtle">Nothing in this range.</p>
        ) : (
          <ol className="space-y-2 text-sm">
            {rows.map(([label, value], i) => (
              <li key={label} className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate text-foreground">
                  <span className="nums mr-2 text-text-subtle">{i + 1}.</span>
                  {label}
                </span>
                <span className="nums shrink-0 font-semibold text-foreground">{value}</span>
              </li>
            ))}
          </ol>
        )}
      </PanelBody>
    </Panel>
  );
}
