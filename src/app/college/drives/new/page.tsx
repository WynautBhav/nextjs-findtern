import { PageHead } from "@/components/app/primitives";
import { DriveBuilder } from "@/components/college/drive-builder";
import { toLocalInput } from "@/lib/college/ist";
import { requireCollegeContext, studentsForCollegeAdmin } from "@/lib/college/scope";
import { toStudentRow } from "@/lib/college/serialize";

export const dynamic = "force-dynamic";

export default async function NewDrivePage() {
  const ctx = await requireCollegeContext();
  const students = (await studentsForCollegeAdmin(ctx)).map(toStudentRow);
  const branches = [...new Set(students.map((s) => s.branch).filter((b): b is string => Boolean(b)))].sort();
  const start = new Date();
  start.setMinutes(0, 0, 0);
  start.setHours(start.getHours() + 1);
  const end = new Date(start.getTime() + 7 * 24 * 3600_000);

  return (
    <div className="space-y-6">
      <PageHead title="New drive" lede="Takes two minutes. You can change dates and eligibility later without a new link." />
      <DriveBuilder
        collegeId={ctx.college.id}
        collegeName={ctx.college.name}
        students={students}
        branches={branches}
        initial={{
          title: "",
          kind: "internship",
          description: "",
          startsAt: toLocalInput(start),
          endsAt: toLocalInput(end),
          minCgpa: "",
          minScore: "",
          years: [],
          branches: [],
          includeUserIds: [],
          excludeUserIds: [],
        }}
      />
    </div>
  );
}
