import { ArrowLeft } from "lucide-react";

import { DashboardBoardView } from "@/components/admin/dashboard/board/board";
import { AdminLoadError, AdminPageHeader, Panel } from "@/components/admin/panel";
import { ADMIN_PILL_PRIMARY, ADMIN_PILL_SECONDARY } from "@/components/admin/surface";
import { findingSentence } from "@/components/admin/triage/format";
import { IncompleteProfilesLine } from "@/components/admin/triage/incomplete-profiles-line";
import { MoneyStrip } from "@/components/admin/triage/money-strip";
import { TriageDesk } from "@/components/admin/triage/triage-desk";
import { WorkQueueButton } from "@/components/admin/triage/work-queue-button";
import { ButtonLink } from "@/components/ui/button";
import { getSession } from "@/lib/auth";
import { loadDashboardBoard } from "@/lib/admin/dashboard-board";
import { BOARD_VIEWS, type BoardView } from "@/lib/admin/dashboard-board-pure";
import { loadActivityAndCounts } from "@/lib/admin/dashboard-overview";
import { loadDashboardQueues, QUEUE_ORDER } from "@/lib/admin/dashboard-queues";
import type { QueueKey } from "@/lib/admin/dashboard-queues.types";
import { flattenParams, type RawSearchParams } from "@/lib/admin/params";
import { allows, canWrite as mayWrite, requiredPermissions } from "@/lib/admin/permissions";

/**
 * Admin home. The default view is the board (Design 07): Students | Employers | Colleges, each number opening the list
 * behind it. The rows come from `loadDashboardBoard` and every number from `dashboard-board-pure.ts`, so a count is
 * always the length of its list. `?view=employers|colleges` opens on that tab. `?desk=1` is the full triage desk (the
 * queue as a keyboard-driven list with a record peek), which only loads there; `&queue=<key>` opens it on one queue.
 */

const DASHBOARD = "/admin/dashboard";

export default async function AdminDashboard({ searchParams }: { searchParams?: Promise<RawSearchParams> }) {
  const params = flattenParams(await searchParams);
  const now = new Date();
  const session = await getSession();
  /** Whether this admin may open a link; the layout hides rail items by the same rule. */
  const can = (href: string) => allows(session?.permissions, requiredPermissions(href.split("?")[0]));

  if (params.desk === "1") return <Desk queueParam={QUEUE_ORDER.find((k): k is QueueKey => k === params.queue)} now={now} />;

  let board: Awaited<ReturnType<typeof loadDashboardBoard>>;
  try {
    board = await loadDashboardBoard(now);
  } catch (error) {
    console.error("[admin/dashboard] board load failed", error);
    return (
      <Panel>
        <AdminLoadError what="the dashboard" retryHref={DASHBOARD} />
      </Panel>
    );
  }

  // Contacts follow the same permissions as the pages that show them: counts for every dashboard reader, a student's
  // email and phone only with candidate access, a company's only with company access.
  const links = { interns: can("/admin/interns"), companies: can("/admin/companies"), colleges: can("/admin/colleges"), cgpa: can("/admin/cgpa-verifications") };
  const data = {
    ...board,
    students: links.interns ? board.students : board.students.map((s) => ({ ...s, email: null, phone: null })),
    employers: links.companies ? board.employers : board.employers.map((e) => ({ ...e, email: null, phone: null, contact: null })),
  };
  const view: BoardView = BOARD_VIEWS.find((v) => v.key === params.view)?.key ?? "students";

  return (
    <div data-admin-dash>
      <AdminPageHeader
        title="Dashboard"
        subtitle="Where every student, employer and college is right now, and who is waiting"
        action={
          <>
            <ButtonLink href={`${DASHBOARD}?desk=1`} variant="primary" size="md" className={ADMIN_PILL_PRIMARY}>
              Work the queue
            </ButtonLink>
            {can("/admin/proposal-tracker") ? (
              <ButtonLink href="/admin/proposal-tracker" variant="outline" size="md" className={ADMIN_PILL_SECONDARY}>
                Pipeline
              </ButtonLink>
            ) : null}
          </>
        }
      />
      <DashboardBoardView data={data} initialView={view} canNudge={mayWrite(session?.permissions, "/admin/notifications")} links={links} />
    </div>
  );
}

/** The triage desk (`?desk=1`), unchanged: the queue as a keyboard-driven list with a record peek. */
async function Desk({ queueParam, now }: { queueParam: QueueKey | undefined; now: Date }) {
  let base: Awaited<ReturnType<typeof loadActivityAndCounts>>;
  let queues: Awaited<ReturnType<typeof loadDashboardQueues>>;
  try {
    [base, queues] = await Promise.all([loadActivityAndCounts(now), loadDashboardQueues(now)]);
  } catch (error) {
    console.error("[admin/dashboard] load failed", error);
    return (
      <Panel>
        <AdminLoadError what="the dashboard" retryHref={DASHBOARD} />
      </Panel>
    );
  }
  const { groups, money, total, fresh } = queues;
  const hasRecords = groups.some((g) => g.records.length > 0);
  return (
    <div>
      <AdminPageHeader
        title="Needs you"
        subtitle={findingSentence(money, total, fresh)}
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
