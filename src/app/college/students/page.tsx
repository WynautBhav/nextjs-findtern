import { CollegeHero, HeroStat, HeroStats, ScoreDots } from "@/components/college/kit";
import { StudentCards, type StudentFilter, type StudentGroup } from "@/components/college/student-cards";
import { ButtonLink } from "@/components/ui/button";
import { aiStatusLabel, studentsLinkFilter } from "@/lib/college/labels";
import { approvalsFor } from "@/lib/college/approvals";
import { requireCollegeContext, rosterCoverage, studentsForCollegeAdmin } from "@/lib/college/scope";
import { requirePublicOrigin } from "@/lib/origin";
import { toStudentRow } from "@/lib/college/serialize";
import { HIDDEN_REASONS } from "@/lib/college/labels";
import { readinessForMany } from "@/lib/college/student-readiness-db";
import { LiveRefresh } from "@/components/app/live-refresh";

export const dynamic = "force-dynamic";

const FILTERS: readonly StudentFilter[] = ["all", "no_interview", "interviewed", "offered", "offers", "calls", "hired", "offline", "hidden"];
const GROUPS: readonly StudentGroup[] = ["students", "on_findtern", "not_joined"];

/** Request time, for "online"/"x min ago" labels. Dynamic page, so this is per request. */
function requestTime(): number {
  return Date.now();
}

/**
 * Every student of the college in one place: the verified register as cards (name, phone, email, online, score),
 * plus the college's own list (who already has an account and waits for the officer, who has not joined). This page
 * took over the old Student list page; adding students (paste or upload) is on Approvals.
 */
export default async function StudentsPage({ searchParams }: { searchParams?: Promise<{ show?: string; why?: string }> }) {
  const ctx = await requireCollegeContext();
  const sp = (await searchParams) ?? {};
  const { show, why } = studentsLinkFilter(sp.show, sp.why);
  const [all, { candidates }] = await Promise.all([studentsForCollegeAdmin(ctx), approvalsFor(ctx.college.id, ctx.college.emailDomains)]);
  const students = all.filter((s) => s.status === "verified");
  const [coverage, readiness] = await Promise.all([
    rosterCoverage(ctx.college.id, new Set(candidates.map((c) => c.email.toLowerCase()))),
    readinessForMany(students.map((s) => s.userId)),
  ]);
  const origin = requirePublicOrigin();
  const invite = [
    `Hi,`,
    ``,
    `${ctx.college.name} has partnered with Findtern for placements. Create your free account, take the AI interview, and you'll be visible to employers in our virtual campus drives.`,
    ``,
    `1. Sign up at ${origin}/signup.`,
    ctx.college.code ? `2. Choose "College account" and enter our college code: ${ctx.college.code}` : `2. Choose "College account" and enter the college code from the placement office.`,
    `3. Take the AI interview from your dashboard.`,
    ``,
    `Training & Placement Cell`,
  ].join("\n");
  const interviewed = students.filter((s) => aiStatusLabel(s.aiStatus).done);
  const scores = interviewed.map((s) => s.score).filter((v): v is number => v !== null);
  const sorted = [...scores].sort((a, b) => a - b);
  const median = sorted.length ? (sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2) : null;
  const ready = scores.filter((s) => s >= 6).length;
  // Read under "Score 6 or above", so it counts only those students (it counted every student with an offer: "9 ... 8 have an offer" when 6 did).
  const offers = interviewed.filter((s) => s.score !== null && s.score >= 6 && s.proposals > 0).length;
  return (
    <div className="space-y-6">
      <LiveRefresh everyMs={60_000} />
      <CollegeHero
        title="Students"
        lede="Your verified students, as employers in your campus drives can find them. Only you see names and contact details."
        actions={<ButtonLink href="/college/approvals#add" variant="white">Add students</ButtonLink>}
      >
        <div className="mt-8 grid gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)] lg:items-end">
          <HeroStats cols={4} className="mt-0 lg:grid-cols-2">
            <HeroStat label="Verified students" value={students.length.toLocaleString("en-IN")} />
            <HeroStat label="AI interview done" value={`${interviewed.length}/${students.length}`} hint={students.length - interviewed.length ? `${students.length - interviewed.length} still to take it` : "Everyone has taken it"} />
            <HeroStat label="Median score" value={median === null ? "—" : median.toFixed(1)} hint="out of 10" />
            <HeroStat label="Score 6 or above" value={ready} hint={offers ? `${offers} already have an offer` : "The line most employers filter on"} />
          </HeroStats>
          {scores.length > 0 ? <ScoreDots scores={scores} /> : <p className="text-sm text-on-dark">Scores appear here as your students take the AI interview.</p>}
        </div>
      </CollegeHero>
      <StudentCards
        students={students.map((s) => {
          const r = readiness.get(s.userId);
          return { ...toStudentRow(s), hiddenWhy: r && !r.seen ? r.seenWhy : null, hidden: r?.hidden ?? null, hireWhy: r && !r.hireable ? r.hireWhy : null };
        })}
        roster={coverage.rows.filter((r) => r.state !== "joined")}
        invite={invite}
        now={requestTime()}
        initialGroup={GROUPS.find((g) => g === show) ?? "students"}
        initialFilter={FILTERS.find((f) => f === show) ?? "all"}
        initialWhy={show === "hidden" ? (HIDDEN_REASONS.find((h) => h.id === why)?.id ?? null) : null}
      />
    </div>
  );
}
