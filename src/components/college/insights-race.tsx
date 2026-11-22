import Link from "next/link";

import type { MasterRow } from "@/lib/college/master-row";
import type { CourseStat } from "@/lib/college/insights";
import { cn } from "@/lib/utils";

/**
 * The Insights hero: every course is a lane and every verified student is one dot in it, set by how far they got
 * (not interviewed, interviewed, got an offer, hired, PPO). The lanes share one dot size and pitch, so a bigger
 * course is a longer lane and a better-placing course is a brighter one. Gold marks hires, as on the Overview.
 */

type Stage = 0 | 1 | 2 | 3 | 4;
export const STAGES = ["Not interviewed", "Interviewed", "Got an offer", "Hired", "PPO offer"] as const;

const stageOf = (r: MasterRow): Stage => (r.ppo ? 4 : r.hired ? 3 : r.offers > 0 ? 2 : r.score !== null ? 1 : 0);

/** One fill per stage on the green field. Hired and PPO are the one hue (gold); PPO adds a white ring. */
const FILL: Record<Stage, string> = {
  0: "rgb(255 255 255 / 0.14)",
  1: "rgb(255 255 255 / 0.38)",
  2: "rgb(255 255 255 / 0.85)",
  3: "var(--color-accent-400)",
  4: "var(--color-accent-400)",
};

export function StageDot({ stage, className }: { stage: Stage; className?: string }) {
  return (
    <svg viewBox="0 0 12 12" className={cn("size-3 shrink-0", className)} aria-hidden>
      <circle cx="6" cy="6" r={stage === 4 ? 3.6 : 4.5} fill={FILL[stage]} stroke={stage === 4 ? "white" : "none"} strokeWidth={stage === 4 ? 1.6 : 0} />
    </svg>
  );
}

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

function Lane({ course, rows, cols, lines }: { course: string; rows: MasterRow[]; cols: number; lines: number }) {
  // Furthest stage first, so each lane reads left to right as hired, offer, interviewed, not yet.
  const stages = rows.map(stageOf).sort((a, b) => b - a);
  const PITCH = 14;
  const H = lines * PITCH;
  return (
    // The lane is as wide as its share of the biggest course, so the longest lane runs the full width.
    <svg viewBox={`0 0 ${Math.ceil(stages.length / lines) * PITCH} ${H}`} className="block h-auto" style={{ width: `${(Math.ceil(stages.length / lines) / cols) * 100}%` }} aria-hidden>
      {stages.map((s, i) => {
        const col = Math.floor(i / lines);
        const row = i % lines;
        return (
          <circle
            key={i}
            cx={col * PITCH + PITCH / 2}
            cy={row * PITCH + PITCH / 2}
            r={s === 4 ? 4.2 : 5.4}
            fill={FILL[s]}
            stroke={s === 4 ? "white" : "none"}
            strokeWidth={s === 4 ? 1.8 : 0}
            className="dot-drop"
            style={{ animationDelay: `${Math.min(col * 6, 600)}ms` }}
            data-course={course}
          />
        );
      })}
    </svg>
  );
}

export function CourseRace({ courses, rows }: { courses: CourseStat[]; rows: MasterRow[] }) {
  const verified = rows.filter((r) => r.verified);
  const biggest = Math.max(1, ...courses.map((c) => c.students));
  // Dots in the biggest lane run in 3 lines; every lane uses the same number of lines' worth of columns so one
  // student is the same width everywhere and lane length is honest.
  const lines = biggest > 90 ? 3 : biggest > 30 ? 2 : 1;
  const cols = Math.ceil(biggest / lines);
  const phoneLines = Math.max(1, Math.ceil(biggest / 22));
  const phoneCols = Math.ceil(biggest / phoneLines);
  const tabLines = Math.max(1, Math.ceil(biggest / 35));
  const tabCols = Math.ceil(biggest / tabLines);
  const best = courses.filter((c) => c.students >= 5).reduce<CourseStat | null>((b, c) => (!b || pct(c.hired, c.students) > pct(b.hired, b.students) ? c : b), null);

  return (
    <div className="mt-8">
      <ul className="space-y-5" aria-label="Placement by course">
        {courses.map((c) => {
          const lane = verified.filter((r) => (r.degree ?? "Course not set") === c.course);
          const rate = pct(c.hired, c.students);
          return (
            <li key={c.course}>
              <Link
                href={`/college/master-data?course=${encodeURIComponent(c.course)}`}
                className="group grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2 rounded-xl p-2 -m-2 outline-none hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-white/70 sm:grid-cols-[9rem_1fr_7.5rem]"
                aria-label={`${c.course}: ${c.students} students, ${c.interviewed} interviewed, ${c.withOffer} with an offer, ${c.hired} hired (${rate}%), ${c.ppo} PPO offers. Open in master data.`}
              >
                <span className="min-w-0">
                  <span className="block truncate text-[15px] font-medium text-white">{c.course}</span>
                  <span className="nums block text-xs text-on-dark-subtle">{c.students} students</span>
                </span>
                <span className="col-span-2 row-start-2 min-w-0 sm:col-span-1 sm:row-start-auto">
                  <span className="hidden lg:block"><Lane course={c.course} rows={lane} cols={cols} lines={lines} /></span>
                  {/* A phone gets about 22 dots a row and a tablet 35, so each dot stays big enough to see. */}
                  <span className="hidden sm:block lg:hidden"><Lane course={c.course} rows={lane} cols={tabCols} lines={tabLines} /></span>
                  <span className="sm:hidden"><Lane course={c.course} rows={lane} cols={phoneCols} lines={phoneLines} /></span>
                </span>
                <span className="col-start-2 row-start-1 text-right sm:col-start-auto sm:row-start-auto">
                  <span className={cn("nums block text-[1.75rem] font-light leading-none tracking-[-0.03em]", best?.course === c.course ? "text-accent-300" : "text-white")}>
                    {rate}
                    <span className="text-base text-on-dark-subtle">%</span>
                  </span>
                  <span className="nums mt-1 block text-xs text-on-dark-subtle">{c.hired} hired · {c.ppo} PPO</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-xs text-on-dark-subtle" aria-label="What each dot means">
        {STAGES.map((s, i) => (
          <li key={s} className="flex items-center gap-1.5">
            <StageDot stage={i as Stage} />
            {s}
          </li>
        ))}
        <li className="sm:ml-auto">One dot, one student</li>
      </ul>
    </div>
  );
}
