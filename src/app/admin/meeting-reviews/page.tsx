import Link from "next/link";
import { Video } from "lucide-react";

import { AdminEmpty, AdminLoadError, AdminPageHeader, Panel } from "@/components/admin/panel";
import { MeetingReviewRows } from "@/components/admin/meeting-reviews/rows";
import { buttonClass } from "@/components/ui/button";
import { flattenParams, type RawSearchParams } from "@/lib/admin/params";
import { canWrite as mayWrite } from "@/lib/admin/permissions";
import { getSession } from "@/lib/auth";
import { loadReviewQueue } from "@/lib/meetings/review-load";
import { REVIEW_FILTERS, type ReviewFilter } from "@/lib/meetings/review-types";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const EMPTY: Record<ReviewFilter, { title: string; body: string }> = {
  open: { title: "Nothing to review", body: "Recorded meetings that matched a rule, or that need a decision, appear here." },
  all: { title: "No meetings yet", body: "Meetings with a recording, a missing recording or an unmatched transcript are listed here." },
  no_recording: { title: "No missing recordings", body: "Every confirmed meeting that ended more than 3 hours ago has a transcript." },
  unmatched: { title: "Nothing unmatched", body: "Every transcript we received was tied to a meeting." },
};

/** Recorded meetings for an admin to read: the flags the rules found, the summary, and Dismiss / Warn / Freeze. */
export default async function MeetingReviewsPage({ searchParams }: { searchParams?: Promise<RawSearchParams> }) {
  const params = flattenParams(await searchParams);
  const filter: ReviewFilter = REVIEW_FILTERS.find((f) => f.key === params.filter)?.key ?? "open";
  const session = await getSession();
  const canWrite = mayWrite(session?.permissions, "/admin/meeting-reviews");

  let data: Awaited<ReturnType<typeof loadReviewQueue>>;
  try {
    data = await loadReviewQueue(filter);
  } catch (error) {
    console.error("[admin/meeting-reviews] load failed", error);
    return (
      <div>
        <AdminPageHeader title="Meeting reviews" subtitle="Recorded meetings for an admin to read." />
        <Panel>
          <AdminLoadError what="the meeting reviews" retryHref={`/admin/meeting-reviews?filter=${filter}`} />
        </Panel>
      </div>
    );
  }
  const { rows, counts } = data;

  return (
    <div>
      <AdminPageHeader
        title="Meeting reviews"
        subtitle={counts.open === 0 ? "No meeting is waiting for a review." : `${counts.open} meeting${counts.open === 1 ? "" : "s"} to review.`}
      />
      <nav aria-label="Filter" className="mb-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        {REVIEW_FILTERS.map((f) => (
          <Link
            key={f.key}
            href={`/admin/meeting-reviews?filter=${f.key}`}
            aria-current={f.key === filter ? "page" : undefined}
            className={cn(buttonClass({ variant: f.key === filter ? "primary" : "outline", size: "sm" }), "min-h-11")}
          >
            {f.label}
            <span className="nums ml-1.5 opacity-80">{counts[f.key]}</span>
          </Link>
        ))}
      </nav>
      <p className="mb-3 text-sm text-text-subtle">
        Only admins see recordings, summaries and flags. Nothing here is automatic: a warning or freeze happens only when you click it.
      </p>
      <Panel>
        {rows.length === 0 ? (
          <AdminEmpty icon={Video} title={EMPTY[filter].title} body={EMPTY[filter].body} />
        ) : (
          <MeetingReviewRows rows={rows} canWrite={canWrite} />
        )}
      </Panel>
    </div>
  );
}
