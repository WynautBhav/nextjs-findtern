import type { CategoriesData } from "@/lib/college/overview-modes";
import { DesignFrame, n } from "../kit";
import {
  BandFigures,
  finding,
  Lead,
  MarksInline,
  segments,
  YearBars,
} from "./parts";

/**
 * Categories 2, "Student grid": one dot per student, grouped by degree, every dot filled by that student's Findtern
 * band (faint when not interviewed). Dots stack from the base of each block, so gold rises first. A big cohort
 * is drawn at one dot per few students and the note says so.
 */
const ROWS = 10;
const STEP = 20;
const R = 7;

function Block({
  d,
  per,
}: {
  d: CategoriesData["degrees"][number];
  per: number;
}) {
  // Cumulative rounding keeps the dots summing to round(students / per) however the bands split.
  const dots: string[] = [];
  let run = 0;
  for (const s of segments(d)) {
    const before = Math.round(run / per);
    run += s.count;
    for (let i = before; i < Math.round(run / per); i++) dots.push(s.fill);
  }
  const cols = Math.max(1, Math.ceil(dots.length / ROWS));
  return (
    <div className="min-w-0">
      <p className="text-sm text-white">{d.name}</p>
      <p className="nums mb-2 text-xs text-on-dark-subtle">
        <span className="text-white">{n(d.interviewed)}</span>/{n(d.students)}
      </p>
      <div
        className="w-[calc(var(--c)*14px)] max-w-full sm:w-[calc(var(--c)*20px)]"
        style={{ "--c": cols } as React.CSSProperties}
      >
        <svg
          viewBox={`0 0 ${cols * STEP} ${ROWS * STEP}`}
          aria-hidden
          className="block h-auto w-full"
        >
          {Array.from({ length: cols }, (_, c) => (
            <g
              key={c}
              className="dot-drop"
              style={{ animationDelay: `${c * 16}ms` }}
            >
              {dots.slice(c * ROWS, c * ROWS + ROWS).map((fill, r) => (
                <circle
                  key={r}
                  cx={c * STEP + STEP / 2}
                  cy={ROWS * STEP - r * STEP - STEP / 2}
                  r={R}
                  fill={fill}
                />
              ))}
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}

export function StudentGrid({ data }: { data: CategoriesData }) {
  const per = Math.max(
    1,
    Math.ceil(Math.max(0, ...data.degrees.map((d) => d.students)) / 160),
  );
  return (
    <DesignFrame
      label="Every student as a dot, by degree and Findtern band"
      finding={finding(data, "degree")}
    >
      <div className="grid gap-8 lg:grid-cols-[1fr_19rem]">
        <div>
          <div className="flex flex-wrap items-end gap-x-6 gap-y-5">
            {data.degrees.map((d) => (
              <Block key={d.name} d={d} per={per} />
            ))}
          </div>
          <p className="mt-3 text-xs text-on-dark-subtle">
            {per === 1
              ? "One dot is one student."
              : `One dot is about ${n(per)} students.`}
          </p>
          <YearBars data={data} className="mt-5 max-w-md" />
        </div>
        <div className="min-w-0 space-y-5 max-lg:contents">
          <Lead data={data} className="max-lg:order-first" />
          <BandFigures data={data} withNotYet />
          <MarksInline data={data} />
        </div>
      </div>
    </DesignFrame>
  );
}
