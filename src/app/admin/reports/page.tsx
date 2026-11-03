import { and, count, eq, gte, lt, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import Link from "next/link";
import { BarChart3, Download, FileSpreadsheet, TrendingUp, IndianRupee } from "lucide-react";

import { getDb, schema } from "@/lib/db";
import { hiringFunnel } from "@/lib/admin/funnel";
import { AdminPageHeader, Panel, PanelHeader, PanelBody } from "@/components/admin/panel";
import { StatCard, StatGrid } from "@/components/admin/stat-card";
import { TrendChart, PipelineBars, type TrendPoint } from "@/components/admin/trend-chart";
import { formatMoney, formatNumber } from "@/lib/format";
import { flattenParams, PERIOD_OPTIONS, periodStart } from "@/lib/admin/params";
import { meaningfulProfile, realEmployerId, realEmployers } from "@/lib/admin/scope";
import { istDateRange, istKeySql, istMonthKeys, istMonthLabel, istMonthStart, utcSql } from "@/lib/admin/revenue";
import { loadCollected, loadReceiptBuckets } from "@/lib/admin/receivables-load";
import { RevenueChart, type RevenuePoint } from "@/components/admin/finance-charts";
import { ChipLinks, DateRangeForm } from "@/components/admin/report-range";
import { buttonClass } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = flattenParams(await searchParams);
  // A custom from-to range wins over the preset period.
  // `from` / `to` are India dates, inclusive (lib/admin/revenue).
  const range = istDateRange(params.from, params.to);
  const since = range.since ?? (range.until ? null : (periodStart(params.period) ?? null));
  const until = range.until;
  /** Totals respect the chosen period; trend charts always show six months. */
  const from = (col: AnyPgColumn) => and(since ? gte(col, since) : undefined, until ? lt(col, until) : undefined);
  const db = getDb();
  // Six India months ending now, for every monthly trend on the page.
  const buckets = istMonthKeys(new Date(), 6).map((key) => ({ key, label: istMonthLabel(key) }));
  // Test employers (the internal "admin" one and the AI-interview one) are not real activity.
  const realProposal = realEmployerId(schema.proposals.employerId);
  const realInterview = realEmployerId(schema.interviews.employerId);

  const [
    [signupsTotal],
    [profilesCompleted],
    [interviewsTotal],
    [hiresTotal],
    [companiesTotal],
    [projectsTotal],
    topStatesRaw,
    projectTypesRaw,
    proposalsMonthly,
    interviewsMonthly,
    revenueTotal,
    revenueMonthly,
  ] = await Promise.all([
    db.select({ c: count() }).from(schema.users).where(and(eq(schema.users.role, "intern"), from(schema.users.createdAt))),
    db
      .select({ c: count() })
      .from(schema.internOnboarding)
      .innerJoin(schema.users, eq(schema.users.id, schema.internOnboarding.userId))
      .where(and(eq(schema.users.role, "intern"), meaningfulProfile(), from(schema.internOnboarding.createdAt))),
    db.select({ c: count() }).from(schema.interviews).where(and(realInterview, from(schema.interviews.createdAt))),
    db.select({ c: count() }).from(schema.proposals).where(and(realProposal, sql`${schema.proposals.hiredAt} is not null`, from(schema.proposals.hiredAt))),
    db.select({ c: count() }).from(schema.employers).where(and(realEmployers(), from(schema.employers.createdAt))),
    db.select({ c: count() }).from(schema.projects).where(and(realEmployerId(schema.projects.employerId), from(schema.projects.createdAt))),
    db
      .select({
        state: sql<string>`coalesce(${schema.internOnboarding.state}, 'Unlisted')`,
        c: count(),
      })
      .from(schema.internOnboarding)
      .groupBy(sql`coalesce(${schema.internOnboarding.state}, 'Unlisted')`)
      .orderBy(sql`count(*) desc`)
      .limit(6),
    db
      .select({
        locationType: sql<string>`coalesce(${schema.projects.locationType}, 'Remote')`,
        c: count(),
      })
      .from(schema.projects)
      .groupBy(sql`coalesce(${schema.projects.locationType}, 'Remote')`)
      .orderBy(sql`count(*) desc`),
    db
      .select({
        month: istKeySql(schema.proposals.createdAt, "month"),
        c: count(),
      })
      .from(schema.proposals)
      .where(sql`${schema.proposals.createdAt} >= ${utcSql(istMonthStart(buckets[0].key))}`)
      .groupBy(sql`1`),
    db
      .select({
        month: istKeySql(schema.interviews.createdAt, "month"),
        c: count(),
      })
      .from(schema.interviews)
      .where(and(realInterview, sql`${schema.interviews.createdAt} >= ${utcSql(istMonthStart(buckets[0].key))}`))
      .groupBy(sql`1`),
    // Revenue: one definition (lib/admin/revenue), the period's receipts and six India months of them.
    loadCollected({ since, until }),
    loadReceiptBuckets("month", 6),
  ]);

  const totalSignups = Number(signupsTotal?.c ?? 0);
  const totalProfiles = Number(profilesCompleted?.c ?? 0);
  const totalInterviews = Number(interviewsTotal?.c ?? 0);
  const totalHires = Number(hiresTotal?.c ?? 0);
  const totalCompanies = Number(companiesTotal?.c ?? 0);
  const totalProjects = Number(projectsTotal?.c ?? 0);

  const profileRate = totalSignups > 0 ? Math.round((totalProfiles / totalSignups) * 100) : 0;
  const interviewRate = totalSignups > 0 ? Math.round((totalInterviews / totalSignups) * 100) : 0;
  const hireRate = totalInterviews > 0 ? Math.round((totalHires / totalInterviews) * 100) : 0;

  // Six monthly buckets, zero-filled - the trend chart needs continuity,
  // not just the months that happen to have rows.
  const proposalsByMonth = new Map(proposalsMonthly.map((r) => [r.month, Number(r.c)]));
  const interviewsByMonth = new Map(interviewsMonthly.map((r) => [r.month, Number(r.c)]));
  const revenueTrend: RevenuePoint[] = buckets.map((b) => ({ label: b.label, totalMinor: revenueMonthly.get(b.key)?.totalMinor ?? 0 }));
  const totalRevenue = revenueTotal.receivedMinor;
  const trend: TrendPoint[] = buckets.map((b) => ({
    label: b.label,
    proposals: proposalsByMonth.get(b.key) ?? 0,
    interviews: interviewsByMonth.get(b.key) ?? 0,
  }));

  // People at the furthest step they reached in the period (lib/admin/funnel):
  // the one funnel definition, so no step is wider than the one above it.
  const funnel = (await hiringFunnel(since ?? null, until)).map((st, i) => ({ status: `s${i}`, label: st.label, count: st.reached }));

  const states = topStatesRaw.map((r) => ({ label: r.state, count: Number(r.c) }));
  const formats = projectTypesRaw.map((r) => ({ label: r.locationType, count: Number(r.c) }));

  const exports = [
    {
      title: "Intern master file",
      body: "Candidates with contact and profile status.",
      href: "/api/admin/export?type=interns",
    },
    {
      title: "Companies directory",
      body: "Partners, contacts, GST and setup progress.",
      href: "/api/admin/export?type=companies",
    },
    {
      title: "Projects catalog",
      body: "Listings, skills, offers and statuses.",
      href: "/api/admin/export?type=projects",
    },
    {
      title: "Payments ledger",
      body: "Receipts, order IDs, GST split and verification.",
      href: "/api/admin/export?type=payments",
    },
    {
      title: "Intern payouts",
      body: "Stipend transfers, references and schedule.",
      href: "/api/admin/export?type=payouts",
    },
    {
      title: "Intern payments",
      body: "Activation fees, promo codes and GST split.",
      href: "/api/admin/export?type=intern-payments",
    },
  ];

  const periodHref = (period: string) => (period ? `/admin/reports?period=${period}` : "/admin/reports");
  const currentPeriod = params.from || params.to ? "custom" : (params.period ?? "");

  return (
    <div className="space-y-8">
      <AdminPageHeader
        title="Reports"
        action={
          <>
            <Link href="/admin/reports/analytics" className={buttonClass({ variant: "outline", size: "sm" })}>
              <BarChart3 className="size-4" aria-hidden />
              Hiring analytics
            </Link>
            <Link href="/admin/reports/money" className={buttonClass({ variant: "outline", size: "sm" })}>
              <IndianRupee className="size-4" aria-hidden />
              Money in and out
            </Link>
          </>
        }
      />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <ChipLinks
          label="Period"
          items={[{ value: "", label: "All time" }, ...PERIOD_OPTIONS].map((o) => ({
            href: periodHref(o.value),
            label: o.label,
            current: currentPeriod === o.value,
          }))}
        />
        <DateRangeForm params={{ from: params.from ?? "", to: params.to ?? "" }} drop={["period"]} />
      </div>

      <StatGrid cols={4}>
        <StatCard
          label="Revenue collected"
          value={formatMoney(totalRevenue, "INR", { zeroLabel: "₹0" })}
          hint="Paid orders and intern fees · USD at ₹100/$"
        />
        <StatCard
          label="Profile completion"
          value={totalSignups ? `${profileRate}%` : "-"}
          hint={`${formatNumber(totalProfiles)} of ${formatNumber(totalSignups)} signups`}
        />
        <StatCard
          label="Interview conversion"
          value={totalSignups ? `${interviewRate}%` : "-"}
          hint={`${formatNumber(totalInterviews)} interviews for ${formatNumber(totalSignups)} signups`}
        />
        <StatCard
          label="Hires per interview"
          value={totalInterviews ? `${hireRate}%` : "-"}
          hint={`${formatNumber(totalHires)} hires · ${formatNumber(totalCompanies)} new companies, ${formatNumber(totalProjects)} projects`}
        />
      </StatGrid>

      <Panel>
        <PanelHeader
          title="Hiring funnel"
          description="Each candidate is counted once, at the furthest step they reached in the period; the percentage is of everyone an employer viewed. The biggest drop between two bars is where to look first."
        />
        <PanelBody>
          <PipelineBars items={funnel} percentOf="first" />
        </PanelBody>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel>
          <PanelHeader
            title="Proposals and interviews"
            description="Monthly counts for the last six months, whatever period is picked above. Solid line is proposals sent, dashed is interviews booked."
            icon={TrendingUp}
          />
          <PanelBody>
            <TrendChart data={trend} />
          </PanelBody>
        </Panel>
        <Panel>
          <PanelHeader
            title="Revenue collected"
            description="Each point is one month's paid orders plus intern fees (India time), in INR."
            icon={IndianRupee}
          />
          <PanelBody>
            <RevenueChart data={revenueTrend} />
          </PanelBody>
        </Panel>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <RankBars title="Candidates by state" description="Onboarded candidates by home state, all time. Longest bar is the largest pool." rows={states} />
        <RankBars title="Projects by work mode" description="All projects by remote, hybrid or on-site, all time." rows={formats} capitalize />
      </div>

      <Panel>
        <PanelHeader title="Raw data exports" description="CSV files for offline analysis. Each file has every row (up to 10,000), not just one page." icon={FileSpreadsheet} />
        <ul className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-3">
          {exports.map((item) => (
            <li key={item.title} className="flex flex-col justify-between gap-4 rounded-apple-lg border border-ink-200/80 p-4">
              <div>
                <p className="text-[0.9375rem] font-semibold text-ink-900">{item.title}</p>
                <p className="mt-1 text-sm leading-relaxed text-ink-600">{item.body}</p>
              </div>
              <a href={item.href} className={cn(buttonClass({ variant: "outline", size: "sm" }), "self-start")}>
                <Download className="size-4" aria-hidden />
                Download CSV
              </a>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}

function RankBars({
  title,
  description,
  rows,
  capitalize = false,
}: {
  title: string;
  description: string;
  rows: { label: string; count: number }[];
  capitalize?: boolean;
}) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <Panel>
      <PanelHeader title={title} description={description} />
      <PanelBody>
        {rows.length === 0 ? (
          <p className="text-sm text-ink-600">No data yet.</p>
        ) : (
          <ul className="space-y-3">
            {rows.map((r) => (
              <li key={r.label}>
                <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                  <span className={cn("truncate font-medium text-ink-800", capitalize && "capitalize")}>{r.label}</span>
                  <span className="nums shrink-0 font-semibold text-ink-900">{formatNumber(r.count)}</span>
                </div>
                <div aria-hidden className="h-1.5 overflow-hidden rounded-full bg-ink-100">
                  <div className="h-full rounded-full bg-brand-600" style={{ width: `${(r.count / max) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </PanelBody>
    </Panel>
  );
}
