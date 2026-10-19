import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Download, IndianRupee, Timer, TrendingUp, Users } from "lucide-react";

import { AdminPageHeader, Panel, PanelBody, PanelHeader } from "@/components/admin/panel";
import { ReportRange } from "@/components/admin/report-range";
import { StatCard, StatGrid } from "@/components/admin/stat-card";
import { PipelineBars } from "@/components/admin/trend-chart";
import { analyticsRange, loadAnalytics } from "@/lib/admin/analytics-load";
import { flattenParams } from "@/lib/admin/params";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";

export const metadata: Metadata = { title: "Hiring analytics" };

/** Legacy's analytics report (routes.ts:5455-6400), ported with USD converted and test employers excluded. */
export default async function AdminAnalyticsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = flattenParams(await searchParams);
  const range = analyticsRange(params);
  const a = await loadAnalytics(range);
  const query = new URLSearchParams(params).toString();
  const rate = (v: number | null, suffix = "%") => (v == null ? "-" : `${v}${suffix}`);

  return (
    <div className="apple-admin space-y-4">
      <AdminPageHeader
        title="Hiring analytics"
        subtitle="Conversion, hiring speed, demand and leaders. Money in INR (USD at ₹100/$); test employers excluded."
        action={
          <>
            <Link
              href="/admin/reports"
              className="inline-flex min-h-11 items-center gap-1.5 rounded-[10px] border border-ink-200 bg-white px-3.5 text-[14px] font-medium text-ink-700 hover:bg-ink-50"
            >
              <ArrowLeft className="size-4" aria-hidden />
              Reports
            </Link>
            <a
              href={`/api/admin/reports/analytics?${query}${query ? "&" : ""}download=1`}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-[10px] border border-ink-200 bg-white px-3.5 text-[14px] font-medium text-ink-700 hover:bg-ink-50"
            >
              <Download className="size-4" aria-hidden />
              Export JSON
            </a>
          </>
        }
      />
      <ReportRange basePath="/admin/reports/analytics" params={params} defaultLabel="Last 18 months" />

      <StatGrid cols={4}>
        <StatCard label="Signups" value={formatNumber(a.totals.signups)} hint={`${a.totals.activeUsers} with a real profile`} icon={Users} delta={a.rates.monthlyGrowth == null ? undefined : `${a.rates.monthlyGrowth > 0 ? "+" : ""}${a.rates.monthlyGrowth}%`} />
        <StatCard label="Hires" value={formatNumber(a.totals.hires)} hint={`${a.totals.fullTimeHires} full-time · ${a.totals.proposals} offers sent`} icon={TrendingUp} tone="success" />
        <StatCard label="Revenue" value={formatMoney(a.totals.revenueMinor, "INR", { zeroLabel: "₹0" })} hint={`Companies ${formatMoney(a.totals.revenueEmployersMinor, "INR", { zeroLabel: "₹0" })} · Fees ${formatMoney(a.totals.revenueInternsMinor, "INR", { zeroLabel: "₹0" })}`} icon={IndianRupee} tone="accent" />
        <StatCard label="Avg time to hire" value={a.rates.avgHireTimeDays == null ? "-" : `${a.rates.avgHireTimeDays} days`} hint="Offer sent to employer paid" icon={Timer} tone="info" />
      </StatGrid>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel className="bg-white">
          <PanelHeader title="Rates" description="Within the selected range." />
          <PanelBody>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
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
                <div key={k}>
                  <dt className="text-2xs uppercase tracking-[0.08em] text-ink-600">{k}</dt>
                  <dd className="mt-0.5 font-semibold tabular-nums text-ink-900">{v}</dd>
                </div>
              ))}
            </dl>
          </PanelBody>
        </Panel>

        <Panel className="bg-white">
          <PanelHeader title="Conversion funnel" description="Interns who signed up in the range, by furthest step." />
          <PanelBody>
            <PipelineBars items={a.funnel.map((f) => ({ status: f.stage, label: `${f.stage} (${f.percentage}%)`, count: f.value }))} />
          </PanelBody>
        </Panel>
      </div>

      <Panel className="bg-white">
        <PanelHeader title="Monthly performance" description="Offers sent, hires, offer success and interview rate per month." />
        <PanelBody className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead className="text-2xs uppercase tracking-[0.08em] text-ink-600">
              <tr>
                <th scope="col" className="py-2 pr-4 font-semibold">Month</th>
                <th scope="col" className="py-2 pr-4 text-right font-semibold">Offers</th>
                <th scope="col" className="py-2 pr-4 text-right font-semibold">Hires</th>
                <th scope="col" className="py-2 pr-4 text-right font-semibold">Success</th>
                <th scope="col" className="py-2 text-right font-semibold">Interview rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100 tabular-nums">
              {a.trend.map((t) => (
                <tr key={t.month}>
                  <td className="py-2 pr-4 text-ink-800">{t.month}</td>
                  <td className="py-2 pr-4 text-right">{t.proposals}</td>
                  <td className="py-2 pr-4 text-right">{t.hires}</td>
                  <td className="py-2 pr-4 text-right">{t.successRate}%</td>
                  <td className="py-2 text-right">{t.interviewRate}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </PanelBody>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-3">
        <RankList title="Skills in demand" note="Projects asking for each skill" rows={a.skillDemand.map((s) => [s.skill, `${s.count}`])} />
        <RankList title="Highest-paying skills" note="Average monthly offer (INR)" rows={a.highestPayingSkills.map((s) => [s.skill, formatMoney(s.avgMonthlyMinor, "INR")])} />
        <RankList title="Demand by region" note="Projects by state or city" rows={a.regionDemand.map((r) => [r.region, `${r.count}`])} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel className="bg-white">
          <PanelHeader title="Top companies" description="By hires in the range, then offers sent." />
          <PanelBody className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead className="text-2xs uppercase tracking-[0.08em] text-ink-600">
                <tr>
                  <th scope="col" className="py-2 pr-3 font-semibold">Company</th>
                  <th scope="col" className="py-2 pr-3 text-right font-semibold">Projects</th>
                  <th scope="col" className="py-2 pr-3 text-right font-semibold">Offers</th>
                  <th scope="col" className="py-2 pr-3 text-right font-semibold">Internship / FT hires</th>
                  <th scope="col" className="py-2 text-right font-semibold">Conversion</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100 tabular-nums">
                {a.topCompanies.map((c) => (
                  <tr key={c.id}>
                    <td className="py-2 pr-3">
                      <Link href={`/admin/companies/${c.id}`} className="font-medium text-ink-900 hover:text-brand-700 hover:underline">
                        {c.name}
                      </Link>
                    </td>
                    <td className="py-2 pr-3 text-right">{c.projects}</td>
                    <td className="py-2 pr-3 text-right">{c.proposals}</td>
                    <td className="py-2 pr-3 text-right">
                      {c.internshipHires} / {c.fullTimeHires}
                    </td>
                    <td className="py-2 text-right">{c.conversion}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </PanelBody>
        </Panel>

        <Panel className="bg-white">
          <PanelHeader title="Top candidates" description="By offers, then interviews, then applications." />
          <PanelBody className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-left text-sm">
              <thead className="text-2xs uppercase tracking-[0.08em] text-ink-600">
                <tr>
                  <th scope="col" className="py-2 pr-3 font-semibold">Candidate</th>
                  <th scope="col" className="py-2 pr-3 text-right font-semibold">Offers received</th>
                  <th scope="col" className="py-2 pr-3 text-right font-semibold">Interviews</th>
                  <th scope="col" className="py-2 pr-3 text-right font-semibold">Placed</th>
                  <th scope="col" className="py-2 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100 tabular-nums">
                {a.topInterns.map((i) => (
                  <tr key={i.id}>
                    <td className="py-2 pr-3">
                      <Link href={`/admin/interns/${i.id}`} className="font-medium text-ink-900 hover:text-brand-700 hover:underline">
                        {i.name}
                      </Link>
                    </td>
                    <td className="py-2 pr-3 text-right">{i.applications}</td>
                    <td className="py-2 pr-3 text-right">{i.interviews}</td>
                    <td className="py-2 pr-3 text-right">{i.offers}</td>
                    <td className="py-2 capitalize text-ink-700">{i.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </PanelBody>
        </Panel>
      </div>

      <Panel className="bg-white">
        <PanelHeader title="Hires in this range" description="Internship and full-time, newest first." />
        <PanelBody className="overflow-x-auto">
          {a.hiredList.length === 0 ? (
            <p className="text-sm text-ink-600">No hires in this range.</p>
          ) : (
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead className="text-2xs uppercase tracking-[0.08em] text-ink-600">
                <tr>
                  <th scope="col" className="py-2 pr-3 font-semibold">Candidate</th>
                  <th scope="col" className="py-2 pr-3 font-semibold">Company</th>
                  <th scope="col" className="py-2 pr-3 font-semibold">Type</th>
                  <th scope="col" className="py-2 font-semibold">Hired</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {a.hiredList.map((h) => (
                  <tr key={`${h.internId}:${h.companyId}:${h.hiredAt}`}>
                    <td className="py-2 pr-3 text-ink-900">{h.internName}</td>
                    <td className="py-2 pr-3 text-ink-700">{h.companyName}</td>
                    <td className="py-2 pr-3 capitalize text-ink-700">{h.kind}</td>
                    <td className="py-2 tabular-nums text-ink-700">{formatDate(h.hiredAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </PanelBody>
      </Panel>
    </div>
  );
}

function RankList({ title, note, rows }: { title: string; note: string; rows: [string, string][] }) {
  return (
    <Panel className="bg-white">
      <PanelHeader title={title} description={note} />
      <PanelBody>
        {rows.length === 0 ? (
          <p className="text-sm text-ink-600">Nothing in this range.</p>
        ) : (
          <ol className="space-y-2 text-sm">
            {rows.map(([label, value], i) => (
              <li key={label} className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate text-ink-800">
                  <span className="mr-2 tabular-nums text-ink-600">{i + 1}.</span>
                  {label}
                </span>
                <span className="shrink-0 font-semibold tabular-nums text-ink-900">{value}</span>
              </li>
            ))}
          </ol>
        )}
      </PanelBody>
    </Panel>
  );
}
