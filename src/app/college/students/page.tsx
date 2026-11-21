import { PageHead } from "@/components/app/primitives";
import { StudentTable, type StudentFilter } from "@/components/college/student-table";
import { ButtonLink } from "@/components/ui/button";
import { requireCollegeContext, studentsForCollegeAdmin } from "@/lib/college/scope";
import { toStudentRow } from "@/lib/college/serialize";

export const dynamic = "force-dynamic";

const FILTERS: readonly StudentFilter[] = ["all", "no_interview", "offers", "offline"];

/** Request time, for "online"/"x min ago" labels. Dynamic page, so this is per request. */
function requestTime(): number {
  return Date.now();
}

/**
 * The college's register: every verified student with full name, phone, email, LinkedIn, CGPA and AI interview
 * score. Students still waiting for the officer's decision are on /college/approvals, not here.
 */
export default async function StudentsPage({ searchParams }: { searchParams?: Promise<{ show?: string }> }) {
  const ctx = await requireCollegeContext();
  const show = (await searchParams)?.show;
  const students = (await studentsForCollegeAdmin(ctx)).filter((s) => s.status === "verified");
  return (
    <div className="space-y-6">
      <PageHead
        title="Students"
        lede="Your verified students, as employers in your campus drives can find them. Only you see names and contact details."
        action={<ButtonLink href="/college/roster" variant="outline">Add students</ButtonLink>}
      />
      <StudentTable students={students.map(toStudentRow)} now={requestTime()} initialFilter={FILTERS.find((f) => f === show) ?? "all"} />
    </div>
  );
}
