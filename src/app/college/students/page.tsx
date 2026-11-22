import { CollegeHero, HeroStat, HeroStats, ScoreDots } from "@/components/college/kit";
import { StudentTable, type StudentFilter } from "@/components/college/student-table";
import { ButtonLink } from "@/components/ui/button";
import { aiStatusLabel } from "@/lib/college/labels";
import { requireCollegeContext, studentsForCollegeAdmin } from "@/lib/college/scope";
import { toStudentRow } from "@/lib/college/serialize";

export const dynamic = "force-dynamic";

const FILTERS: readonly StudentFilter[] = ["all", "no_interview", "offers", "hired", "offline", "not_open"];

/** Request time, for "online"/"x min ago" labels. Dynamic page, so this is per request. */
function requestTime(): number {
  return Date.now();
}

/**
 * The college's register: every verified student with full name, phone, email, LinkedIn, CGPA and AI interview
 * score. The hero draws the whole batch as dots on the score line; the table below is where the officer works.
 * Students still waiting for the officer's decision are on /college/approvals, not here.
 */
export default async function StudentsPage({ searchParams }: { searchParams?: Promise<{ show?: string }> }) {
  const ctx = await requireCollegeContext();
  const show = (await searchParams)?.show;
  const students = (await studentsForCollegeAdmin(ctx)).filter((s) => s.status === "verified");
  const interviewed = students.filter((s) => aiStatusLabel(s.aiStatus).done);
  const scores = interviewed.map((s) => s.score).filter((v): v is number => v !== null);
  const sorted = [...scores].sort((a, b) => a - b);
  const median = sorted.length ? (sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2) : null;
  const ready = scores.filter((s) => s >= 6).length;
  const offers = students.filter((s) => s.proposals > 0).length;
  return (
    <div className="space-y-6">
      <CollegeHero
        title="Students"
        lede="Your verified students, as employers in your campus drives can find them. Only you see names and contact details."
        actions={<ButtonLink href="/college/roster" variant="white">Add students</ButtonLink>}
      >
        <div className="mt-8 grid gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)] lg:items-end">
          <HeroStats cols={4} className="mt-0 lg:grid-cols-2">
            <HeroStat label="Verified students" value={students.length.toLocaleString("en-IN")} />
            <HeroStat label="AI interview done" value={`${interviewed.length}/${students.length}`} hint={students.length - interviewed.length ? `${students.length - interviewed.length} still to take it` : "Everyone has taken it"} />
            <HeroStat label="Median score" value={median === null ? "—" : median.toFixed(1)} hint="out of 10" />
            <HeroStat label="Score 6 or above" value={ready} hint={offers ? `${offers} already have an offer` : "The line most employers filter on"} />
          </HeroStats>
          {scores.length > 0 ? <ScoreDots scores={scores} /> : <p className="text-sm text-on-dark-subtle">Scores appear here as your students take the AI interview.</p>}
        </div>
      </CollegeHero>
      <StudentTable students={students.map(toStudentRow)} now={requestTime()} initialFilter={FILTERS.find((f) => f === show) ?? "all"} />
    </div>
  );
}
