import { PageHead, SectionHead } from "@/components/app/primitives";
import { ApprovalsBoard } from "@/components/college/approvals-board";
import { LeaveRequestsTable } from "@/components/college/leave-requests-table";
import { approvalsFor } from "@/lib/college/approvals";
import { leaveRequestsForCollege } from "@/lib/college/leave-request-read";
import { requireCollegeContext } from "@/lib/college/scope";

export const dynamic = "force-dynamic";

/**
 * Every decision that is the placement officer's: who is one of the college's students (accept, deny, add back)
 * and who may leave. A weak match (phone only, or a list email under a different name) is not offered here: Findtern
 * confirms those, and the officer sees how many are with Findtern, never whose account it is.
 */
export default async function ApprovalsPage() {
  const ctx = await requireCollegeContext();
  const [{ candidates, reviews, removed }, leaves] = await Promise.all([
    approvalsFor(ctx.college.id, ctx.college.emailDomains),
    leaveRequestsForCollege(ctx.college.id),
  ]);
  const n = candidates.length;
  return (
    <div className="space-y-8">
      <div>
        <PageHead
          title="Approvals"
          lede={
            n
              ? `${n} ${n === 1 ? "student already has" : "students already have"} a Findtern account and ${n === 1 ? "looks" : "look"} like yours. Accept the ones who are your students.`
              : "Students who already have a Findtern account wait here until you accept them."
          }
        />
        <ApprovalsBoard candidates={candidates} removed={removed} />
        {reviews.length > 0 ? (
          <p className="mt-3 text-sm text-text-subtle">
            <span className="nums">{reviews.length}</span> more {reviews.length === 1 ? "student on your list looks" : "students on your list look"} like a Findtern account, but the name or email does not fully match. Findtern checks {reviews.length === 1 ? "that one" : "those"} and adds the right ones for you.
          </p>
        ) : null}
      </div>
      <section id="leave" aria-labelledby="leave-heading" className="scroll-mt-24">
        <SectionHead title="Leave requests" id="leave-heading" />
        <p className="mb-4 max-w-2xl text-sm text-text-subtle">
          A student can only leave your college once you approve. Approving removes them from your students and drives straight away. Rejecting keeps them; they can ask again.
        </p>
        <LeaveRequestsTable initial={leaves} />
      </section>
    </div>
  );
}
