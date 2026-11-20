import { PageHead } from "@/components/app/primitives";
import { LeaveRequestsTable } from "@/components/college/leave-requests-table";
import { leaveRequestsForCollege } from "@/lib/college/leave-request-read";
import { requireCollegeContext } from "@/lib/college/scope";

export const dynamic = "force-dynamic";

/** Students ask to leave; they stay in the college until the placement officer approves here. */
export default async function LeaveRequestsPage() {
  const ctx = await requireCollegeContext();
  const rows = await leaveRequestsForCollege(ctx.college.id);
  return (
    <div className="space-y-6">
      <PageHead
        title="Leave requests"
        lede="A student can only leave your college once you approve. Approving removes them from your dashboard and drives straight away. Rejecting keeps them; they can ask again."
      />
      <LeaveRequestsTable initial={rows} />
    </div>
  );
}
