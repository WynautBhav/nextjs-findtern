import { eq } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";

import { AiLinkCard } from "@/components/admin/dashboard/ai-link-card";
import { DashTile } from "@/components/admin/dashboard/dash-tile";
import { GreetingHeader, type StripItem } from "@/components/admin/dashboard/greeting-header";
import { MoneyCard } from "@/components/admin/dashboard/money-card";
import { NeedsYouPanel } from "@/components/admin/dashboard/needs-you-panel";
import { NextInterviewCard } from "@/components/admin/dashboard/next-interview-card";
import { PipelineBandCard } from "@/components/admin/dashboard/pipeline-band";
import { PlacementsGauge } from "@/components/admin/dashboard/placements-gauge";
import { RecentActivity } from "@/components/admin/dashboard/recent-activity";
import { WeekPanel } from "@/components/admin/dashboard/week-panel";
import { Arrive } from "@/components/admin/motion";
import { AdminLoadError, AdminPageHeader, Panel } from "@/components/admin/panel";
import { ADMIN_PILL_PRIMARY, ADMIN_PILL_SECONDARY } from "@/components/admin/surface";
import { findingSentence } from "@/components/admin/triage/format";
import { IncompleteProfilesLine } from "@/components/admin/triage/incomplete-profiles-line";
import { MoneyStrip } from "@/components/admin/triage/money-strip";
import { TriageDesk } from "@/components/admin/triage/triage-desk";
import { WorkQueueButton } from "@/components/admin/triage/work-queue-button";
import { ButtonLink } from "@/components/ui/button";
import { getSession } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { cn } from "@/lib/utils";
import { buildActivity, buildKpis } from "@/lib/admin/dashboard-overview-pure";
import { loadActivityAndCounts, loadOverview } from "@/lib/admin/dashboard-overview";
import { loadDashboardQueues, QUEUE_ORDER } from "@/lib/admin/dashboard-queues";
import type { QueueKey } from "@/lib/admin/dashboard-queues.types";
import { flattenParams, type RawSearchParams } from "@/lib/admin/params";
import { allows, canWrite as mayWrite, requiredPermissions } from "@/lib/admin/permissions";
import { pickQueue } from "@/lib/admin/ai-link-queue";
import { loadAiLinkRows } from "@/lib/admin/ai-link-queue-load";

/**
 * Admin home. The default view is the overview: a greeting with one line of figures, four KPI tiles
 * (one filled, never a zero), the hire pipeline band, the money card, the week and the placements gauge in
 * the main column, and a right rail with what needs you, the next interview and recent activity. `?desk=1` is the full triage desk (the
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
  let name: string;
  try {
    [base, queues, overview, name] = await Promise.all([
      loadActivityAndCounts(now),
      loadDashboardQueues(now),
      desk ? null : loadOverview(now),
      desk ? "" : adminFirstName(session?.uid, session?.email),
    ]);
  } catch (error) {
    console.error("[admin/dashboard] load failed", error);
    return (
      <Panel>
        <AdminLoadError what="the dashboard" retryHref={DASHBOARD} />
      </Panel>
    );
  }

  // Its own read: a failure hides the card (logged) and never the dashboard.
  const aiQueue = await loadAiLinkRows().then(pickQueue).catch((e) => (console.error("[admin/dashboard] ai link queue", e), null));
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

  const { week, nextInterview, placements, companies, pipeline } = overview ?? { week: null, nextInterview: null, placements: null, companies: null, pipeline: null };
  const queuesFailed = groups.some((g) => g.error);
  const { kpis } = buildKpis({
    queueTotal: total,
    queueFresh: fresh,
    queueFailed: queuesFailed,
    signups: base.signups,
    incompleteProfiles: base.incompleteProfiles,
    profilesThisWeek: base.profilesThisWeek,
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
  const activity = buildActivity(base.activity, 3).map((item) => ({ ...item, href: gate(item.href) }));

  // One line of figures that no card already shows: a figure on a card is never repeated here, and a zero is left out.
  // (New this week is the hero's caption, unpaid offers and payouts due are the money card's; incomplete profiles
  // are the candidates caption unless this week's new profiles took its place.)
  const n = (v: number) => v.toLocaleString("en-IN");
  const strip: StripItem[] = [
    base.incompleteProfiles > 0 && base.profilesThisWeek > 0
      ? { key: "incomplete", value: n(base.incompleteProfiles), label: "incomplete profiles", href: gate("/admin/interns?profile=incomplete") }
      : null,
  ].filter((x): x is StripItem => x !== null);

  // Phone order: figures, pipeline, what needs you, interview, activity, then the week, placements and money.
  // From xl the page is a main column and a right rail (the wrappers below are `contents` until then).
  const cell = "min-w-0 md:col-span-2 xl:col-auto";
  return (
    <div data-admin-dash className="space-y-[var(--admin-gap)] [&_[data-panel-header]_h2]:text-xl">
      <GreetingHeader
        name={name}
        now={now}
        strip={strip}
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

      {aiQueue && can("/admin/interns") ? (
        <AiLinkCard waiting={aiQueue.waiting} unpaid={aiQueue.unpaid} now={now} canWrite={mayWrite(session?.permissions, "/admin/ai-interviews")} listHref={gate("/admin/ai-interviews")} />
      ) : null}

      <div className="grid grid-cols-1 items-start gap-[var(--admin-gap)] md:grid-cols-2 xl:items-stretch xl:grid-cols-[minmax(0,1fr)_21.5rem]">
        <div className="contents xl:flex xl:min-w-0 xl:flex-col xl:gap-[var(--admin-gap)]">
          <Arrive index={0} className={cn(cell, "order-1 xl:order-none")}>
            <div className="grid grid-cols-2 gap-[var(--admin-gap)] md:grid-cols-4">
              {kpis.map((k) => (
                <DashTile key={k.key} label={k.label} value={k.value} hint={k.caption} href={tileHref[k.key] ?? undefined} featured={k.key === "needs"} clear={k.key === "needs" && k.value === 0 && !queuesFailed} unknown={k.key === "needs" && k.value === 0 && queuesFailed} />
              ))}
            </div>
          </Arrive>
          <Arrive index={1} className={cn(cell, "order-2 xl:order-none")}>
            <PipelineBandCard band={pipeline} href={gate(TRACKER_PROPOSALS)} />
          </Arrive>
          <div className="contents xl:grid xl:grid-cols-2 xl:items-stretch xl:gap-[var(--admin-gap)]">
            <Arrive index={5} className="order-6 min-w-0 md:col-span-1 xl:order-none xl:[&>*]:h-full">
              <WeekPanel data={week} href={gate(TRACKER_PROPOSALS)} />
            </Arrive>
            <Arrive index={6} className="order-7 min-w-0 md:col-span-1 xl:order-none xl:[&>*]:h-full">
              <PlacementsGauge summary={placements} href={gate(TRACKER_PROPOSALS)} />
            </Arrive>
          </div>
          <Arrive index={7} className={cn(cell, "order-8 xl:order-none xl:flex-1 xl:[&>*]:h-full")}>
            <MoneyCard money={money} payoutsHref={gate("/admin/payouts")} />
          </Arrive>
        </div>

        <aside aria-label="Today" className="contents xl:flex xl:min-w-0 xl:flex-col xl:gap-[var(--admin-gap)]">
          <Arrive index={2} className="order-3 min-w-0 md:col-span-1 xl:order-none">
            <NeedsYouPanel groups={groups} total={total} nowMs={now.getTime()} canOpen={can} />
          </Arrive>
          <Arrive index={3} className="order-4 min-w-0 md:col-span-1 xl:order-none">
            <NextInterviewCard interview={nextInterview} trackerHref={gate(TRACKER_INTERVIEWS)} now={now} />
          </Arrive>
          <Arrive index={4} className={cn(cell, "order-5 xl:order-none xl:flex-1 xl:[&>*]:h-full")}>
            <RecentActivity items={activity} now={now} />
          </Arrive>
        </aside>
      </div>
    </div>
  );
}

/** The signed-in admin's first name for the greeting: `admins.name`, else the email's local part. */
async function adminFirstName(uid: string | undefined, email: string | undefined): Promise<string> {
  let full: string | null = null;
  if (uid) {
    try {
      const [row] = await getDb().select({ name: schema.admins.name }).from(schema.admins).where(eq(schema.admins.id, uid)).limit(1);
      full = row?.name?.trim() || null;
    } catch {
      full = null;
    }
  }
  const first = (full ?? email?.split("@")[0] ?? "").split(/\s+/)[0];
  return first || "there";
}
