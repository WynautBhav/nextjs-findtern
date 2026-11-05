import Link from "next/link";

import { AiLinkRows } from "@/components/admin/ai-link-rows";
import { AdminEmpty, Panel, PanelHeader } from "@/components/admin/panel";
import type { AiLinkListRow } from "@/lib/admin/ai-link-queue-load";

const SHOWN = 10;

/** Dashboard card: paid applicants waiting for an InCruiter link, oldest first. */
export function AiLinkCard({ waiting, unpaid, now, canWrite, listHref }: { waiting: AiLinkListRow[]; unpaid: number; now: Date; canWrite: boolean; listHref: string | null }) {
  const more = waiting.length > SHOWN;
  return (
    <Panel aria-labelledby="ai-link-title">
      <PanelHeader
        title={<span id="ai-link-title">AI interviews waiting for a link · {waiting.length}</span>}
        description={`Oldest first. Paste the InCruiter link and the intern is told by app and email.${unpaid ? ` ${unpaid} unpaid applicant${unpaid === 1 ? "" : "s"} not shown.` : ""}`}
      />
      {waiting.length === 0 ? (
        <AdminEmpty title="No one is waiting" body="Every paid applicant has a link." />
      ) : (
        <AiLinkRows rows={waiting.slice(0, SHOWN)} now={now} canWrite={canWrite} state="waiting" />
      )}
      {listHref && (more || waiting.length > 0) ? (
        <div className="border-t border-[color:var(--admin-rule)] px-4 py-3 sm:px-5">
          <Link href={listHref} className="inline-flex min-h-11 items-center text-sm font-medium text-brand-700 hover:underline">
            {more ? `See all ${waiting.length}` : "All AI interviews"}
          </Link>
        </div>
      ) : null}
    </Panel>
  );
}
