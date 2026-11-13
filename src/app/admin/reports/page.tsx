import { and, count, eq, gte, lt, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

import { getDb, schema } from "@/lib/db";
import { hiringFunnel } from "@/lib/admin/funnel";
import { AdminPageHeader } from "@/components/admin/panel";
import { ADMIN_PILL_PRIMARY, ADMIN_PILL_SECONDARY } from "@/components/admin/surface";
import { ChartCard } from "@/components/admin/reports/chart-card";
import { ExportList } from "@/components/admin/reports/export-list";
import { Funnel } from "@/components/admin/reports/funnel";
import { PeriodBar } from "@/components/admin/reports/period-bar";
import { RankCard } from "@/components/admin/reports/rank-card";
import { StatStrip, trendOf } from "@/components/admin/reports/stat-strip";
import { Panel, PanelBody, PanelHeader } from "@/components/admin/panel";
import { formatMoney, formatNumber } from "@/lib/format";
import { flattenParams, periodStart } from "@/lib/admin/params";
import { formatPercentDelta, percentChange, previousWindow } from "@/lib/admin/reports-shape";
import { meaningfulProfile, realEmployerId, realEmployers } from "@/lib/admin/scope";
import { istDateRange, istKeySql, istMonthKeys, istMonthLabel, istMonthStart, utcSql } from "@/lib/admin/revenue";
import { loadCollected, loadReceiptBuckets } from "@/lib/admin/receivables-load";
import { ButtonLink } from "@/components/ui/button";
import { getSession } from "@/lib/auth";
import { allows, EXPORT_PERMISSIONS } from "@/lib/admin/permissions";

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
  const revenueTrend = buckets.map((b) => ({ label: b.label, totalMinor: revenueMonthly.get(b.key)?.totalMinor ?? 0 }));
  const totalRevenue = revenueTotal.receivedMinor;
  // Change vs the equal span before (only when the period has a start; all time has no "before").
  const prevWindow = previousWindow({ since: since ?? null, until });
  const revenuePrev = prevWindow ? (await loadCollected(prevWindow)).receivedMinor : null;
  const revenueChange = revenuePrev === null ? null : percentChange(totalRevenue, revenuePrev);
  const trend = buckets.map((b) => ({
    label: b.label,
    proposals: proposalsByMonth.get(b.key) ?? 0,
    interviews: interviewsByMonth.get(b.key) ?? 0,
  }));

  // People at the furthest step they reached in the period (lib/admin/funnel):
  // the one funnel definition, so no step is wider than the one above it.
  const funnel = (await hiringFunnel(since ?? null, until)).map((st) => ({ label: st.label, count: st.reached }));

  const states = topStatesRaw.map((r) => ({ label: r.state, value: Number(r.c) }));
  const formats = projectTypesRaw.map((r) => ({ label: r.locationType, value: Number(r.c) }));

  const session = await getSession();
  const exports = [
    {
      title: "Intern master file",
      body: "Candidates with contact and profile status.",
      // Explicit columns: a bare link gets the Candidates default set, which has no email or phone.
      href: "/api/admin/export?type=interns&cols=email,phone,interview,score,profile,review,account,live,offerStatus,joined",
      type: "interns",
      format: "XLSX" as const,
    },
    {
      title: "Companies directory",
      body: "Partners, contacts, GST and setup progress.",
      href: "/api/admin/export?type=companies",
      type: "companies",
    },
    {
      title: "Projects catalog",
      body: "Listings, skills, offers and statuses.",
      href: "/api/admin/export?type=projects",
      type: "projects",
    },
    {
      title: "Payments ledger",
      body: "Receipts, order IDs, GST split and verification.",
      href: "/api/admin/export?type=payments",
      type: "payments",
    },
    {
      title: "Intern payouts",
      body: "Stipend transfers, references and schedule.",
      href: "/api/admin/export?type=payouts",
      type: "payouts",
    },
    {
      title: "Intern payments",
      body: "Activation fees, promo codes and GST split.",
      href: "/api/admin/export?type=intern-payments",
      type: "intern-payments",
    },
    // Hide what this role can only open as a 403 page (same check as the export route).
  ].filter((e) => allows(session?.permissions, EXPORT_PERMISSIONS[e.type] ?? null));

  const currentPeriod = params.from || params.to ? "custom" : (params.period ?? "all");
  const periodWord =
    currentPeriod === "custom" ? "the chosen dates" : currentPeriod === "all" ? "all time" : `the last ${currentPeriod.replace("d", "")} days`;
  const inr = (m: number) => formatMoney(m, "INR", { zeroLabel: "\u20b90" });

  return (
    <div className="space-y-5 lg:space-y-6" data-rp="page">
      <AdminPageHeader
        title="Reports"
        subtitle={`${inr(totalRevenue)} collected and ${formatNumber(totalHires)} ${totalHires === 1 ? "hire" : "hires"} in ${periodWord}.`}
        className="!mb-0"
        action={
          <>
            <ButtonLink href="/admin/reports/analytics" variant="primary" size="sm" className={ADMIN_PILL_PRIMARY}>
              Hiring analytics
            </ButtonLink>
            <ButtonLink href="/admin/reports/money" variant="outline" size="sm" className={ADMIN_PILL_SECONDARY}>
              Money in and out
            </ButtonLink>
          </>
        }
      />

      <PeriodBar basePath="/admin/reports" params={{ period: params.period ?? "", from: params.from ?? "", to: params.to ?? "" }} defaultValue="" defaultLabel="All time" includeAll={false} />

      <StatStrip
        stats={[
          {
            label: "Revenue collected",
            value: inr(totalRevenue),
            accent: true,
            delta: formatPercentDelta(revenueChange) || undefined,
            trend: trendOf(revenueChange),
            note: revenueChange === null ? "Paid orders and intern fees, USD at \u20b9100/$" : "vs the period before",
          },
          { label: "Profile completion", value: totalSignups ? `${profileRate}%` : "-", note: `${formatNumber(totalProfiles)} of ${formatNumber(totalSignups)} signups` },
          { label: "Interview conversion", value: totalSignups ? `${interviewRate}%` : "-", note: `${formatNumber(totalInterviews)} interviews for ${formatNumber(totalSignups)} signups` },
          {
            label: "Hires per interview",
            value: totalInterviews ? `${hireRate}%` : "-",
            note: `${formatNumber(totalHires)} hires \u00b7 ${formatNumber(totalCompanies)} new companies, ${formatNumber(totalProjects)} projects`,
          },
        ]}
      />

      <div className="grid gap-[var(--admin-gap)] xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <ChartCard
          views={[
            {
              key: "revenue",
              tab: "Revenue",
              title: "How much did we collect each month?",
              note: "Paid orders plus intern fees per India month, last six months, whatever period is picked above.",
              unit: "Rupees collected per month",
              format: "inr",
              series: [{ label: "Revenue collected", tone: "current", points: revenueTrend.map((d) => ({ x: d.label, y: d.totalMinor })) }],
            },
            {
              key: "activity",
              tab: "Proposals",
              title: "How busy is hiring each month?",
              note: "Proposals sent and interviews booked per month, last six months, whatever period is picked above.",
              unit: "Count per month",
              format: "count",
              series: [
                { label: "Proposals sent", tone: "current", points: trend.map((t) => ({ x: t.label, y: t.proposals })) },
                { label: "Interviews booked", tone: "previous", points: trend.map((t) => ({ x: t.label, y: t.interviews })) },
              ],
            },
          ]}
        />
        <Panel>
          <PanelHeader title="Where does hiring drop off?" description={`Each candidate counted once, at the furthest step reached in ${periodWord}.`} />
          <PanelBody>
            <Funnel ariaLabel="Hiring funnel" steps={funnel} />
          </PanelBody>
        </Panel>
      </div>

      <RankCard
        title="Who is on the platform"
        description="Not affected by the period: candidates by home state and every project by work mode."
        groups={[
          { title: "Candidates by state", note: "Top six", rows: states },
          { title: "Projects by work mode", note: "Remote, hybrid or on-site", rows: formats, capitalize: true },
        ]}
        empty="Candidates add their home state when they sign up and employers pick a work mode when they post a project. Both fill in as that happens."
      />

      <ExportList items={exports} />
    </div>
  );
}
