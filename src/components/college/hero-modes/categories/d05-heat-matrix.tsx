import type { CategoriesData } from "@/lib/college/overview-modes";
import { cn } from "@/lib/utils";
import { COFFEE_FILL, DesignFrame, Legend, MARKS_FILL, n, pct, Swatch, white } from "../kit";
import { DONE, finding, Lead, NOT_YET, notInterviewed } from "./parts";

/**
 * Categories 5, "Heat matrix": degrees down, bands across. Each cell is the band's own fill, strengthened with the
 * count (a square-root scale against the biggest cell), and carries the number, so nothing relies on colour alone.
 * Row totals and the bottom row close the sums. The right side holds the years as thin rings and the marks as one heat strip.
 */
const NONE = white(0.16);
const COLS = [
  { key: "espresso" as const, fill: COFFEE_FILL.espresso, dark: false },
  { key: "cappuccino" as const, fill: COFFEE_FILL.cappuccino, dark: true },
  { key: "latte" as const, fill: COFFEE_FILL.latte, dark: true },
];
const level = (v: number, max: number) => (v === 0 ? 0 : 0.2 + 0.8 * Math.sqrt(v / Math.max(1, max)));

function Cell({ value, fill, max, dark }: { value: number; fill: string; max: number; dark: boolean }) {
  const o = level(value, max);
  return (
    <div className="relative grid h-11 place-items-center rounded-md sm:h-12" style={{ background: white(0.05) }}>
      <span className="absolute inset-0 rounded-md" style={{ background: fill, opacity: o }} aria-hidden />
      <span className={cn("nums relative text-sm", dark && o >= 0.55 ? "font-medium text-brand-950" : "text-white")}>{n(value)}</span>
    </div>
  );
}

function Ring({ share }: { share: number }) {
  const r = 17;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 44 44" className="size-9 shrink-0" aria-hidden>
      <circle cx="22" cy="22" r={r} fill="none" stroke={NOT_YET} strokeWidth="5" />
      {share > 0 ? <circle cx="22" cy="22" r={r} fill="none" stroke={DONE} strokeWidth="5" strokeDasharray={`${(c * share) / 100} ${c}`} transform="rotate(-90 22 22)" /> : null}
    </svg>
  );
}

export function HeatMatrix({ data }: { data: CategoriesData }) {
  const max = Math.max(1, ...data.degrees.flatMap((d) => [d.coffee.espresso, d.coffee.cappuccino, d.coffee.latte, d.students - d.interviewed]));
  const maxMarks = Math.max(1, ...data.marks.map((b) => b.students));
  const grid = "grid grid-cols-[3.5rem_repeat(4,minmax(0,1fr))_2.5rem] items-center gap-1.5 sm:grid-cols-[5rem_repeat(4,minmax(0,1fr))_3rem]";
  return (
    <DesignFrame label="Degrees by Findtern band as a heat matrix" finding={finding(data, "degree")}>
      <div className="grid gap-8 lg:grid-cols-[1fr_19rem]">
        <div className="min-w-0">
          <div className={cn(grid, "mb-1.5 text-[11px] text-on-dark-subtle sm:text-xs")}>
            <span />
            {COLS.map((c) => {
              const b = data.coffee.find((x) => x.key === c.key)!;
              return (
                <span key={c.key} className="min-w-0">
                  <span className="flex items-center gap-1 text-white">
                    <Swatch fill={c.fill} className="size-2 sm:size-2.5" />
                    <span className="hidden truncate sm:inline">{b.name}</span>
                  </span>
                  <span className="nums hidden truncate sm:block">{b.range}</span>
                </span>
              );
            })}
            <span className="min-w-0">
              <span className="flex items-center gap-1 text-white">
                <Swatch fill={NONE} className="size-2 sm:size-2.5" />
                <span className="hidden truncate sm:inline">Not yet</span>
              </span>
              <span className="hidden truncate sm:block">no interview</span>
            </span>
            <span className="text-right">Total</span>
          </div>
          <div className="space-y-1.5">
            {data.degrees.map((d) => (
              <div key={d.name} className={grid}>
                <span className="truncate text-sm text-white">{d.name}</span>
                {COLS.map((c) => (
                  <Cell key={c.key} value={d.coffee[c.key]} fill={c.fill} max={max} dark={c.dark} />
                ))}
                <Cell value={Math.max(0, d.students - d.interviewed)} fill={NONE} max={max} dark={false} />
                <span className="nums text-right text-sm text-white">{n(d.students)}</span>
              </div>
            ))}
            <div className={cn(grid, "pt-1")}>
              <span className="text-sm text-on-dark-subtle">All</span>
              {data.coffee.length
                ? COLS.map((c) => (
                    <span key={c.key} className={cn("nums text-center text-sm", c.key === "latte" ? "text-accent-300" : "text-white")}>
                      {n(data.coffee.find((x) => x.key === c.key)?.students ?? 0)}
                    </span>
                  ))
                : null}
              <span className="nums text-center text-sm text-white">{n(notInterviewed(data))}</span>
              <span className="nums text-right text-sm text-white">{n(data.students)}</span>
            </div>
          </div>
          <Legend
            className="mt-3 sm:hidden"
            items={[
              ...COLS.map((c) => ({ label: data.coffee.find((x) => x.key === c.key)!.name, fill: c.fill })),
              { label: "Not yet interviewed", fill: NONE },
            ]}
          />
        </div>
        <div className="min-w-0 space-y-5 max-lg:contents">
          <Lead data={data} className="max-lg:order-first" />
          <div>
            <p className="text-[13px] text-on-dark-subtle">CGPA / % bands</p>
            <ul className="mt-2 grid grid-cols-4 gap-1.5" aria-label="CGPA and percentage bands">
              {data.marks.map((b) => {
                const o = level(b.students, maxMarks);
                return (
                  <li key={b.key} className="min-w-0 text-[11px] text-on-dark-subtle sm:text-xs">
                    <div className="relative grid h-11 place-items-center rounded-md sm:h-12" style={{ background: white(0.05) }}>
                      <span className="absolute inset-0 rounded-md" style={{ background: MARKS_FILL[b.key], opacity: o }} aria-hidden />
                      <span className={cn("nums relative text-sm", b.key !== "foundation" && b.key !== "rising" && o >= 0.55 ? "font-medium text-brand-950" : "text-white")}>{n(b.students)}</span>
                    </div>
                    <span className="mt-1 block whitespace-nowrap text-white">{b.name}</span>
                    <span className="nums block truncate">{b.range}</span>
                  </li>
                );
              })}
            </ul>
            {data.marksMissing > 0 ? <p className="nums mt-1.5 text-xs text-on-dark-subtle">{n(data.marksMissing)} with no CGPA or % on file</p> : null}
          </div>
          <div>
            <p className="text-[13px] text-on-dark-subtle">Year of study, share interviewed</p>
            <ul className="mt-2 flex gap-4" aria-label="Students by year">
              {data.years.map((y) => (
                <li key={y.year} className="flex items-center gap-2 whitespace-nowrap">
                  <Ring share={pct(y.interviewed, y.students)} />
                  <span className="nums text-xs text-on-dark-subtle">
                    <span className="block text-[13px] text-white">Year {y.year}</span>
                    <span className="text-white">{n(y.interviewed)}</span>/{n(y.students)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </DesignFrame>
  );
}
