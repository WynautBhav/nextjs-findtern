import { DriveBuilder } from "@/components/college/drive-builder";
import { toLocalInput } from "@/lib/college/ist";
import { requireCollegeContext, studentsForCollegeAdmin } from "@/lib/college/scope";
import { toStudentRow } from "@/lib/college/serialize";

export const dynamic = "force-dynamic";

export default async function NewDrivePage() {
  const ctx = await requireCollegeContext();
  // Only verified students are ever shown to employers (eligibility.ts), so only they are counted and offered here.
  const students = (await studentsForCollegeAdmin(ctx)).filter((s) => s.status === "verified").map(toStudentRow);
  const branches = [...new Set(students.map((s) => s.branch).filter((b): b is string => Boolean(b)))].sort();
  const start = new Date();
  // The top of the current hour: the link works the moment it is created, unless the officer picks a later opening.
  start.setMinutes(0, 0, 0);
  const end = new Date(start.getTime() + 7 * 24 * 3600_000);

  return (
    <div className="space-y-6">
      <DriveBuilder
        heading={{ title: "New campus drive", lede: "Name it, set when it is open, and you get one link to send to the employers you invite. They see your students only. It opens straight away unless you choose a later time." }}
        collegeId={ctx.college.id}
        collegeName={ctx.college.name}
        collegeLogoUrl={ctx.college.logoUrl}
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
