import type { Metadata } from "next";

import { HeroPanel } from "@/components/employer/kit/hero-panel";
import { ButtonLink } from "@/components/ui/button";
import { Surface } from "@/components/app/primitives";
import { CourseRace } from "@/components/college/insights-race";
import { CgVsScore, CourseBoard, OfferSpread, Readiness, ScoreTrio, SkillsByCourse, StudentList } from "@/components/college/insights-blocks";
import { computeInsights, COURSE_NOT_SET, STRONG_SCORE } from "@/lib/college/insights";
import { masterRowsForCollege } from "@/lib/college/master-data";
import { requireCollegeContext } from "@/lib/college/scope";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Insights" };

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

/**
 * Insights answers one question for the head of placement: which course is placing, and which students are being
 * missed? The hero races the courses; the blocks under it explain why (scores against CGPA, overlooked students,
 * offers, skills, preferences). Every count links to the master data view of the same students.
 */
export default async function CollegeInsights() {
  const ctx = await requireCollegeContext();
  const rows = await masterRowsForCollege(ctx);
  const ins = computeInsights(rows);

  // The finding: best and weakest placing course, among courses big enough to compare (5+ students).
  const ranked = ins.courses.filter((c) => c.students >= 5 && c.course !== COURSE_NOT_SET).sort((a, b) => pct(b.hired, b.students) - pct(a.hired, a.students));
  const best = ranked[0];
  const worst = ranked.length > 1 ? ranked[ranked.length - 1] : null;
  const finding =
    best && worst && pct(best.hired, best.students) > pct(worst.hired, worst.students)
      ? `${best.course} has placed ${pct(best.hired, best.students)}% of its students, ${worst.course} ${pct(worst.hired, worst.students)}%.`
      : best
        ? `${best.course} has placed ${pct(best.hired, best.students)}% of its students.`
        : null;

  if (ins.verified === 0) {
    return (
      <div className="space-y-6">
        <HeroPanel>
          <h1 className="text-[clamp(1.75rem,3.4vw,2.5rem)] font-light leading-tight tracking-[-0.03em]">Insights</h1>
          <p className="mt-2 max-w-xl text-sm text-on-dark">Course-by-course placement shows here once your first students are verified.</p>
          <div className="mt-5"><ButtonLink href="/college/approvals" variant="white">Verify students</ButtonLink></div>
        </HeroPanel>
      </div>
    );
  }

  const overlookedTop = ins.overlooked.slice(0, 5);
  const offersTop = ins.mostOffers.slice(0, 5);

  return (
    <div className="space-y-6">
      <HeroPanel className="rise">
        <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4">
          <div className="min-w-0">
            <h1 className="text-[clamp(1.75rem,3.4vw,2.5rem)] font-light leading-tight tracking-[-0.03em]">Insights</h1>
            <p className="nums mt-1 text-sm text-on-dark-subtle">
              {ins.verified} verified students · {ins.totals.offers} offers · {ins.totals.hired} hired · {ins.totals.ppo} PPO
            </p>
            {finding ? <p className="mt-3 max-w-xl text-base text-white">{finding}</p> : null}
          </div>
          <div className="flex w-full flex-wrap gap-2.5 sm:w-auto">
            <ButtonLink href="/college/master-data" variant="white">Open master data</ButtonLink>
          </div>
        </div>
        <CourseRace courses={ins.courses} rows={rows} />
      </HeroPanel>

      <CourseBoard courses={ins.courses} totals={ins.totals} />

      <CgVsScore rows={rows} quadrants={ins.quadrants} />

      <div className="grid gap-6 lg:grid-cols-2">
        <StudentList
          title="Strong score, no offer yet"
          description={`Findtern score ${STRONG_SCORE}+ and not one offer yet.`}
          rows={overlookedTop}
          total={ins.overlooked.length}
          href="/college/master-data?view=overlooked"
          figure={(r) => <ScoreTrio r={r} />}
          figureLabel="English, aptitude and Findtern score"
          empty={`Every student with a score of ${STRONG_SCORE} or more has at least one offer.`}
        />
        <StudentList
          title="Most offers"
          description="Students employers keep asking for."
          rows={offersTop}
          total={ins.mostOffers.length}
          href="/college/master-data?view=most-offers"
          figure={(r) => (
            <span className="block">
              <span className="block text-base font-medium text-ink-900">{r.offers}<span className="text-xs font-normal text-ink-500"> offers</span></span>
              <span className="block text-xs text-ink-500">{r.ppo ? "PPO" : r.hired ? "Hired" : "Not hired yet"}</span>
            </span>
          )}
          figureLabel="Offers received"
          empty="No offers yet. They show here as employers send them."
        />
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <OfferSpread spread={ins.offerSpread} />
        <SkillsByCourse courses={ins.courses} />
      </div>

      <Readiness ins={ins} />

      <Surface className="flex flex-wrap items-center justify-between gap-3 p-5">
        <p className="text-sm text-ink-700">Need a list for a company? Build your own view of every field and download it.</p>
        <ButtonLink href="/college/master-data" variant="outline">Open master data</ButtonLink>
      </Surface>
    </div>
  );
}
