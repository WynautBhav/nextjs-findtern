import { notFound } from "next/navigation";

import { AdminLoadError, Panel } from "@/components/admin/panel";
import { BackLink, MeetingReviewDetail } from "@/components/admin/meeting-reviews/rows";
import { getSession } from "@/lib/auth";
import { loadReviewDetail } from "@/lib/meetings/review-load";

export const dynamic = "force-dynamic";

/** The full transcript of one recorded meeting. Admin only; opening it is audit-logged by the loader. */
export default async function MeetingReviewDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session) notFound();

  let detail: Awaited<ReturnType<typeof loadReviewDetail>>;
  try {
    detail = await loadReviewDetail(id, session.uid);
  } catch (error) {
    console.error("[admin/meeting-reviews/detail] load failed", error);
    return (
      <div>
        <BackLink />
        <Panel>
          <AdminLoadError what="this transcript" retryHref={`/admin/meeting-reviews/${encodeURIComponent(id)}`} />
        </Panel>
      </div>
    );
  }
  if (!detail) notFound();
  return <MeetingReviewDetail row={detail.row} lines={detail.lines} />;
}
