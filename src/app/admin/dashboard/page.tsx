import { ArrowLeft } from "lucide-react";

import { MoneyCard } from "@/components/admin/dashboard/money-card";
import { NeedsYouPanel } from "@/components/admin/dashboard/needs-you-panel";
import { NextInterviewCard } from "@/components/admin/dashboard/next-interview-card";
import { PlacementsGauge } from "@/components/admin/dashboard/placements-gauge";
import { RecentActivity } from "@/components/admin/dashboard/recent-activity";
import { WeekPanel } from "@/components/admin/dashboard/week-panel";
import { AdminLoadError, AdminPageHeader, Panel } from "@/components/admin/panel";
import { StatCard, StatGrid } from "@/components/admin/stat-card";
import { ADMIN_PILL_PRIMARY, ADMIN_PILL_SECONDARY } from "@/components/admin/surface";
import { findingSentence } from "@/components/admin/triage/format";
import { IncompleteProfilesLine } from "@/components/admin/triage/incomplete-profiles-line";
import { MoneyStrip } from "@/components/admin/triage/money-strip";
import { TriageDesk } from "@/components/admin/triage/triage-desk";
import { WorkQueueButton } from "@/components/admin/triage/work-queue-button";
import { ButtonLink } from "@/components/ui/button";
import { getSession } from "@/lib/auth";
import { buildActivity, buildKpis } from "@/lib/admin/dashboard-overview-pure";
import { loadActivityAndCounts, loadOverview } from "@/lib/admin/dashboard-overview";
import { loadDashboardQueues, QUEUE_ORDER } from "@/lib/admin/dashboard-queues";
import type { QueueKey } from "@/lib/admin/dashboard-queues.types";
import { flattenParams, type RawSearchParams } from "@/lib/admin/params";
import { allows, requiredPermissions } from "@/lib/admin/permissions";

/**
 * Admin home. The default view is the overview: four KPI tiles (the first, "Needs you today", is the
 * one filled tile), the week's proposals, the next interview, the seven queues as rows, recent
 * activity, the placements gauge and the one dark money card. `?desk=1` is the full triage desk (the
 * queue as a keyboard-driven list with a record peek), which only loads there; `&queue=<key>` opens it
 * on one queue.
 *
 * The queues and the money come from `loadDashboardQueues` (one contract, see
 * lib/admin/dashboard-queues.types.ts); the other reads are in lib/admin/dashboard-overview.ts and each
 * of those fails on its own (its panel says so) rather than reading as zero.
 */

const DASHBOARD = "/admin/dashboard";
const TRACKER_PROPOSALS = "/admin/proposal-tracker?tab=proposals";
const TRACKER_INTERVIEWS = "/admin/proposal-tracker?tab=interviews";

export default async function AdminDashboard({ searchParams }: { searchParams?: Promise<RawSearchParams> }) {
  const params = flattenParams(await searchParams);
  const desk = params.desk === "1";
  const queueParam = QUEUE_ORDER.find((k): k is QueueKey => k === params.queue);

  const now = new Date();
  const session = await getSession();
  /** Whether this admin may open a link; the layout hides rail items by the same rule. */
  const can = (href: string) => allows(session?.permissions, requiredPermissions(href.split("?")[0]));
  const gate = (href: string) => (can(href) ? href : null);

  let base: Awaited<ReturnType<typeof loadActivityAndCounts>>;
  let queues: Awaited<ReturnType<typeof loadDashboardQueues>>;
  let overview: Awaited<ReturnType<typeof loadOverview>> | null;
  try {
    [base, queues, overview] = await Promise.all([
      loadActivityAndCounts(now),
      loadDashboardQueues(now),
      desk ? null : loadOverview(now),
    ]);
  } catch (error) {
    console.error("[admin/dashboard] load failed", error);
    return (
      <Panel>
        <AdminLoadError what="the dashboard" retryHref={DASHBOARD} />
      </Panel>
    );
  }

  const { groups, money, total, fresh } = queues;
  const finding = findingSentence(money, total, fresh);

  if (desk) {
    const hasRecords = groups.some((g) => g.records.length > 0);
    return (
      <div>
        <AdminPageHeader
          title="Needs you"
          subtitle={finding}
          action={
            <>
              {hasRecords ? <WorkQueueButton /> : null}
              <ButtonLink href={DASHBOARD} variant="outline" size="md" className={ADMIN_PILL_SECONDARY}>
                <ArrowLeft className="size-4" aria-hidden />
                Back to dashboard
              </ButtonLink>
            </>
          }
        />
        <div className="space-y-[var(--admin-gap)]">
          <MoneyStrip money={money} />
          <TriageDesk
            groups={groups}
            total={total}
            nowMs={now.getTime()}
            initialFilter={queueParam}
            footer={<IncompleteProfilesLine count={base.incompleteProfiles} total={base.signups} href="/admin/interns?profile=incomplete" />}
          />
        </div>
      </div>
    );
  }

  const { week, nextInterview, placements, companies } = overview ?? { week: null, nextInterview: null, placements: null, companies: null };
  const { kpis } = buildKpis({
    queueTotal: total,
    queueFresh: fresh,
    queueFailed: groups.some((g) => g.error),
    signups: base.signups,
    incompleteProfiles: base.incompleteProfiles,
    signupsThisWeek: base.signupsThisWeek,
    companies: companies?.total ?? null,
    companiesThisWeek: companies?.fresh ?? null,
    placements,
  });
  const tileHref: Record<string, string | null> = {
    needs: `${DASHBOARD}?desk=1`,
    candidates: gate("/admin/interns"),
    companies: gate("/admin/companies"),
    placements: gate(TRACKER_PROPOSALS),
  };
  const activity = buildActivity(base.activity).map((item) => ({ ...item, href: gate(item.href) }));

  return (
    <div>
      <AdminPageHeader
        title="Dashboard"
        subtitle={finding}
        action={
          <>
            <ButtonLink href={`${DASHBOARD}?desk=1`} variant="primary" size="md" className={ADMIN_PILL_PRIMARY}>
              Work the queue
            </ButtonLink>
            {can("/admin/proposal-tracker") ? (
              <ButtonLink href="/admin/proposal-tracker" variant="outline" size="md" className={ADMIN_PILL_SECONDARY}>
                Proposal pipeline
              </ButtonLink>
            ) : null}
          </>
        }
      />

      <div className="space-y-[var(--admin-gap)]">
        <StatGrid>
          {kpis.map((k) => (
            <StatCard
              key={k.key}
              label={k.label}
              value={k.value}
              hint={k.caption}
              href={tileHref[k.key] ?? undefined}
              featured={k.key === "needs"}
            />
          ))}
        </StatGrid>

        <div className="grid grid-cols-1 gap-[var(--admin-gap)] lg:grid-cols-12">
          <div className="min-w-0 lg:col-span-6 xl:col-span-4 [&>*]:h-full">
            <WeekPanel data={week} href={gate(TRACKER_PROPOSALS)} />
          </div>
          <div className="min-w-0 lg:col-span-6 xl:col-span-4 [&>*]:h-full">
            <NextInterviewCard interview={nextInterview} trackerHref={gate(TRACKER_INTERVIEWS)} />
          </div>
          <div className="min-w-0 lg:col-span-12 xl:col-span-4 [&>*]:h-full">
            <NeedsYouPanel groups={groups} total={total} nowMs={now.getTime()} canOpen={can} />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-[var(--admin-gap)] lg:grid-cols-12">
          <div className="min-w-0 lg:col-span-12 xl:col-span-5 [&>*]:h-full">
            <RecentActivity items={activity} now={now} />
          </div>
          <div className="min-w-0 lg:col-span-6 xl:col-span-3 [&>*]:h-full">
            <PlacementsGauge summary={placements} href={gate(TRACKER_PROPOSALS)} />
          </div>
          <div className="min-w-0 lg:col-span-6 xl:col-span-4 [&>*]:h-full">
            <MoneyCard money={money} payoutsHref={gate("/admin/payouts")} />
          </div>
        </div>
      </div>
    </div>
  );
}
