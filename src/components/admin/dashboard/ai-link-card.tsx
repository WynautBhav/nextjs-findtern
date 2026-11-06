import { AiLinkRows } from "@/components/admin/ai-link-rows";
import { AdminEmpty, Panel, PanelHeader } from "@/components/admin/panel";
import { ButtonLink } from "@/components/ui/button";
import { dashboardSlice } from "@/lib/admin/ai-link-queue";
import type { AiLinkListRow } from "@/lib/admin/ai-link-queue-load";

/** The dashboard shows the two oldest; the full page has everyone. */
const SHOWN = 2;

/** Dashboard card: paid applicants waiting for an InCruiter link, oldest first. */
export function AiLinkCard({ waiting, unpaid, now, canWrite, listHref }: { waiting: AiLinkListRow[]; unpaid: number; now: Date; canWrite: boolean; listHref: string | null }) {
  const { shown, hidden } = dashboardSlice(waiting, SHOWN);
  return (
    <Panel aria-labelledby="ai-link-title">
      <PanelHeader
        title={<span id="ai-link-title">AI interviews waiting for a link · {waiting.length}</span>}
        description={`Oldest first. Paste the InCruiter link and the intern is told by app and email.${unpaid ? ` ${unpaid} unpaid applicant${unpaid === 1 ? "" : "s"} not shown.` : ""}`}
      />
      {waiting.length === 0 ? (
        <AdminEmpty title="No one is waiting" body="Every paid applicant has a link." />
      ) : (
        <AiLinkRows rows={shown} now={now} canWrite={canWrite} state="waiting" />
      )}
      {listHref ? (
        <div className="border-t border-[color:var(--admin-rule)] px-4 py-3 sm:px-5">
          <ButtonLink href={listHref} variant="outline" size="sm" className="min-h-11 max-sm:w-full">
            {hidden > 0 ? `All AI interviews (${hidden} more waiting)` : "All AI interviews"}
          </ButtonLink>
        </div>
      ) : null}
    </Panel>
  );
}
