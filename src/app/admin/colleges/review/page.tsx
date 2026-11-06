import Link from "next/link";

import { CollegeReviewQueue } from "@/components/admin/college-review-queue";
import { AdminEmpty, AdminPageHeader, Panel } from "@/components/admin/panel";
import { canWrite } from "@/lib/admin/permissions";
import { getSession } from "@/lib/auth";
import { reviewQueue } from "@/lib/college/roster-import";

export const dynamic = "force-dynamic";

const SHOWN = 100;

export default async function CollegeReviewPage() {
  const perms = (await getSession())?.permissions;
  const { items, total } = await reviewQueue({ limit: SHOWN });
  return (
    <div className="space-y-4">
      <AdminPageHeader
        title="Roster review"
        subtitle={
          total === 0
            ? "Roster rows matched only by phone or name wait here. Email matches link on their own."
            : `${total.toLocaleString("en-IN")} roster ${total === 1 ? "row" : "rows"} across all colleges ${total === 1 ? "needs" : "need"} a decision${total > SHOWN ? `. Showing the oldest ${SHOWN}.` : "."}`
        }
        action={<Link href="/admin/colleges" className="text-sm font-medium underline underline-offset-4">All colleges</Link>}
      />
      <Panel>
        {items.length === 0 ? (
          <AdminEmpty title="Nothing to review" body="When an import finds a student by phone or name only, it lands here for you to link or reject." />
        ) : (
          <CollegeReviewQueue items={items} showCollege canEdit={canWrite(perms, "/admin/colleges")} />
        )}
      </Panel>
    </div>
  );
}
