import type { CategoriesData, CoffeeKey } from "@/lib/college/overview-modes";
import { cn } from "@/lib/utils";
import { COFFEE_FILL, MARKS_FILL, n, pct, Swatch, white } from "../kit";

/**
 * Pieces shared by Categories designs 2 to 10. The fills stay the kit's; the two neutral fills here are the only
 * additions: "not interviewed" (a faint step) and "interviewed" (a mid step) for designs that split by that alone.
 */

export const NOT_YET = white(0.1);
export const DONE = white(0.34);
/** Gold band first, so a stack read from its base compares Latte across columns. */
export const BAND_KEYS: CoffeeKey[] = ["latte", "cappuccino", "espresso"];
/** Neutral steps for categories that have no fill of their own (degrees, years); adjacent steps always differ. */
export const STEPS = [0.56, 0.34, 0.46, 0.24, 0.4, 0.2];
export const step = (i: number) => white(STEPS[i % STEPS.length]);

export const notInterviewed = (d: CategoriesData) => Math.max(0, d.students - d.interviewed);

/** The band with the most interviewed students, and the degree with the best interview rate (ties: the larger one). */
export function leaders(d: CategoriesData) {
  const band = [...d.coffee].sort((a, b) => b.students - a.students)[0];
  const degree = [...d.degrees].filter((x) => x.students > 0).sort((a, b) => b.interviewed / b.students - a.interviewed / a.students || b.students - a.students)[0];
  return { band: band && band.students > 0 ? band : undefined, degree };
}

/** One finding sentence from the data: the leading band, then the degree with the best interview rate. */
export function finding(d: CategoriesData, order: "band" | "degree" = "band") {
  const { band, degree } = leaders(d);
  const a = band ? (
    <>
      {band.name} is the biggest band, with {pct(band.students, d.interviewed)}% of interviewed students
    </>
  ) : null;
  const b = degree ? (
    <>
      {degree.name} has the highest interview rate, {pct(degree.interviewed, degree.students)}% ({n(degree.interviewed)} of {n(degree.students)})
    </>
  ) : null;
  if (!a && !b) return <>No student has done the AI interview yet.</>;
  const [x, y] = order === "band" ? [a, b] : [b, a];
  return (
    <>
      {x}
      {x && y ? "; " : null}
      {y}.
    </>
  );
}

/** The lead figure: how many students are done with the AI interview. The largest figure a design shows. */
export function Lead({ data, className, gold = false }: { data: CategoriesData; className?: string; gold?: boolean }) {
  return (
    <div className={cn("min-w-0", className)}>
      <p className="text-[13px] text-on-dark-subtle">Done with the AI interview</p>
      <p className="mt-1 flex items-baseline gap-2">
        <span className={cn("nums text-[2.5rem] font-light leading-none tracking-[-0.03em]", gold ? "text-accent-300" : "text-white")}>{n(data.interviewed)}</span>
        <span className="nums text-sm text-on-dark-subtle">
          of {n(data.students)} students · {pct(data.interviewed, data.students)}%
        </span>
      </p>
    </div>
  );
}

/** Marks bands as rows: swatch, name and range, a bar to scale, the count. A missing-marks note keeps the sum honest. */
export function MarksBars({ data, className }: { data: CategoriesData; className?: string }) {
  const max = Math.max(1, ...data.marks.map((b) => b.students));
  return (
    <div className={className}>
      <p className="text-[13px] text-on-dark-subtle">CGPA / % bands</p>
      <ul className="mt-2 space-y-1.5" aria-label="CGPA and percentage bands">
        {data.marks.map((b) => (
          <li key={b.key} className="grid grid-cols-[8rem_1fr_2rem] items-center gap-2 text-[13px]">
            <span className="flex items-baseline gap-1.5 whitespace-nowrap text-white">
              <Swatch fill={MARKS_FILL[b.key]} className="self-center" />
              {b.name}
              <span className="nums text-[11px] text-on-dark-subtle">{b.range}</span>
            </span>
            <span className="h-2 rounded-full" style={{ background: white(0.07) }} aria-hidden>
              <span className="block h-full rounded-full" style={{ width: `${(b.students / max) * 100}%`, background: MARKS_FILL[b.key] }} />
            </span>
            <span className={cn("nums text-right", b.key === "top" ? "text-accent-300" : "text-white")}>{n(b.students)}</span>
          </li>
        ))}
      </ul>
      {data.marksMissing > 0 ? <p className="nums mt-1.5 text-xs text-on-dark-subtle">{n(data.marksMissing)} with no CGPA or % on file</p> : null}
    </div>
  );
}

/** Marks bands as one inline line: swatch, name, count. */
export function MarksInline({ data, className }: { data: CategoriesData; className?: string }) {
  return (
    <div className={className}>
      <p className="text-[13px] text-on-dark-subtle">CGPA / % bands</p>
      <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1.5" aria-label="CGPA and percentage bands">
        {data.marks.map((b) => (
          <li key={b.key} className="nums flex items-baseline gap-1.5 text-[13px] text-white">
            <Swatch fill={MARKS_FILL[b.key]} className="self-center" />
            {b.name}
            <span className="text-[11px] text-on-dark-subtle">{b.range}</span>
            <span className={cn("text-base", b.key === "top" && "text-accent-300")}>{n(b.students)}</span>
          </li>
        ))}
      </ul>
      {data.marksMissing > 0 ? <p className="nums mt-1.5 text-xs text-on-dark-subtle">{n(data.marksMissing)} with no CGPA or % on file</p> : null}
    </div>
  );
}

/** Years as rows: label, a bar of the year's students with the interviewed share filled, and interviewed/students. */
export function YearBars({ data, className }: { data: CategoriesData; className?: string }) {
  const max = Math.max(1, ...data.years.map((y) => y.students));
  return (
    <div className={className}>
      <p className="text-[13px] text-on-dark-subtle">Year of study</p>
      <ul className="mt-2 space-y-1.5" aria-label="Students by year">
        {data.years.map((y) => (
          <li key={y.year} className="grid grid-cols-[3.25rem_1fr_4.5rem] items-center gap-2 text-[13px]">
            <span className="text-white">Year {y.year}</span>
            <span className="flex h-2 overflow-hidden rounded-full" style={{ width: `${(y.students / max) * 100}%`, background: NOT_YET }} aria-hidden>
              <span style={{ width: `${pct(y.interviewed, y.students)}%`, background: DONE }} />
            </span>
            <span className="nums text-right text-on-dark-subtle">
              <span className="text-white">{n(y.interviewed)}</span>/{n(y.students)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Three band counts as figures with the band's own swatch as the key; Latte in gold. */
export function BandFigures({ data, className, withNotYet = false }: { data: CategoriesData; className?: string; withNotYet?: boolean }) {
  return (
    <ul className={cn("flex flex-wrap gap-x-7 gap-y-3", className)} aria-label="Findtern bands">
      {BAND_KEYS.slice()
        .reverse()
        .map((k) => {
          const b = data.coffee.find((x) => x.key === k);
          if (!b) return null;
          return (
            <li key={k} className="min-w-0">
              <p className="flex items-center gap-1.5 text-[13px] text-on-dark-subtle">
                <Swatch fill={COFFEE_FILL[k]} />
                {b.name} <span className="nums text-[11px]">{b.range}</span>
              </p>
              <p className="mt-1 flex items-baseline gap-1.5">
                <span className={cn("nums text-[1.75rem] font-light leading-none", k === "latte" ? "text-accent-300" : "text-white")}>{n(b.students)}</span>
                <span className="nums text-xs text-on-dark-subtle">{pct(b.students, data.interviewed)}%</span>
              </p>
            </li>
          );
        })}
      {withNotYet ? (
        <li className="min-w-0">
          <p className="flex items-center gap-1.5 text-[13px] text-on-dark-subtle">
            <Swatch fill={NOT_YET} />
            Not interviewed
          </p>
          <p className="mt-1">
            <span className="nums text-[1.75rem] font-light leading-none text-white">{n(notInterviewed(data))}</span>
          </p>
        </li>
      ) : null}
    </ul>
  );
}

const f = (x: number) => +x.toFixed(2);
const pt = (cx: number, cy: number, r: number, t: number) => [f(cx + r * Math.sin(t * 2 * Math.PI)), f(cy - r * Math.cos(t * 2 * Math.PI))];

/** A ring segment from turn t0 to t1 (0 = twelve o'clock, clockwise), between radii r0 and r1. Use fillRule="evenodd". */
export function arcPath(cx: number, cy: number, r0: number, r1: number, t0: number, t1: number) {
  if (t1 - t0 >= 0.9999) {
    return `M${cx} ${f(cy - r1)}A${r1} ${r1} 0 1 1 ${cx} ${f(cy + r1)}A${r1} ${r1} 0 1 1 ${cx} ${f(cy - r1)}ZM${cx} ${f(cy - r0)}A${r0} ${r0} 0 1 0 ${cx} ${f(cy + r0)}A${r0} ${r0} 0 1 0 ${cx} ${f(cy - r0)}Z`;
  }
  const large = t1 - t0 > 0.5 ? 1 : 0;
  const [x0, y0] = pt(cx, cy, r1, t0);
  const [x1, y1] = pt(cx, cy, r1, t1);
  const [x2, y2] = pt(cx, cy, r0, t1);
  const [x3, y3] = pt(cx, cy, r0, t0);
  return `M${x0} ${y0}A${r1} ${r1} 0 ${large} 1 ${x1} ${y1}L${x2} ${y2}A${r0} ${r0} 0 ${large} 0 ${x3} ${y3}Z`;
}

/** A degree's students as band segments, base first: Latte, Cappuccino, Espresso, then not interviewed. Counts sum to students. */
export function segments(d: CategoriesData["degrees"][number]) {
  const seg = BAND_KEYS.map((k) => ({ key: k as CoffeeKey | "none", count: d.coffee[k], fill: COFFEE_FILL[k] }));
  seg.push({ key: "none", count: Math.max(0, d.students - d.coffee.latte - d.coffee.cappuccino - d.coffee.espresso), fill: NOT_YET });
  return seg;
}

/** Years on one line: label, interviewed over students. */
export function YearInline({ data, className }: { data: CategoriesData; className?: string }) {
  return (
    <div className={className}>
      <p className="text-[13px] text-on-dark-subtle">Year of study, done / students</p>
      <ul className="mt-2 flex flex-wrap gap-x-6 gap-y-1.5" aria-label="Students by year">
        {data.years.map((y) => (
          <li key={y.year} className="nums flex items-baseline gap-1.5 whitespace-nowrap text-[13px] text-white">
            Year {y.year}
            <span className="text-base">{n(y.interviewed)}</span>
            <span className="text-xs text-on-dark-subtle">/ {n(y.students)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
