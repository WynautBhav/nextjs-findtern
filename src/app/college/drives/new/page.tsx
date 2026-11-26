import { DriveBuilder } from "@/components/college/drive-builder";
import { toLocalInput } from "@/lib/college/ist";
import { requireCollegeContext, studentsForCollegeAdmin } from "@/lib/college/scope";
import { toStudentRow } from "@/lib/college/serialize";
import { degreeOptions } from "@/lib/college/eligibility";
import { readinessForMany } from "@/lib/college/student-readiness-db";

export const dynamic = "force-dynamic";

export default async function NewDrivePage() {
  const ctx = await requireCollegeContext();
  // Only verified students are ever shown to employers (eligibility.ts), so only they are counted and offered here.
  const verified = (await studentsForCollegeAdmin(ctx)).filter((s) => s.status === "verified");
  // Each student's one reason employers can't see them (or null), for the form's Drive summary.
  const readiness = await readinessForMany(verified.map((s) => s.userId));
  const students = verified.map((s) => ({ ...toStudentRow(s), hidden: readiness.get(s.userId)?.hidden ?? (readiness.get(s.userId)?.seen ? null : "profile") }));
  const degrees = degreeOptions(students);
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
        degrees={degrees}
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
          degrees: [],
          includeUserIds: [],
          excludeUserIds: [],
        }}
      />
    </div>
  );
}
