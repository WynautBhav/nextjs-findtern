import type { CategoriesData } from "@/lib/college/overview-modes";
import { cn } from "@/lib/utils";
import { COFFEE_FILL, DesignFrame, Legend, MARKS_FILL, n, pct, Swatch, white } from "../kit";
import { DONE, finding, NOT_YET, notInterviewed } from "./parts";
import { DrillLink, type DrillFilters } from "../drill";

/**
 * Categories analysis, "Heat matrix" (the chosen design): degrees down, Findtern bands across. Each cell is the band's
 * own fill, strengthened with the count (a square-root scale against the biggest cell), and carries the number, so
 * nothing relies on colour alone. Every number opens Master data with the same students filtered, verified only,
 * because these counts are of verified students. The right side holds three separate blocks: the interview total,
 * the CGPA / % bands and the years.
 */
const NONE = white(0.16);
const COLS = [
  { key: "espresso" as const, fill: COFFEE_FILL.espresso, dark: false },
  { key: "cappuccino" as const, fill: COFFEE_FILL.cappuccino, dark: true },
  { key: "latte" as const, fill: COFFEE_FILL.latte, dark: true },
];
const level = (v: number, max: number) => (v === 0 ? 0 : 0.2 + 0.8 * Math.sqrt(v / Math.max(1, max)));

const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-white/80";

function Cell({ value, fill, max, dark, filters, label }: { value: number; fill: string; max: number; dark: boolean; filters: DrillFilters; label: string }) {
  const o = level(value, max);
  return (
    <DrillLink title={label} filters={filters} aria-label={`${label}: ${value} students. Open in Master data`} className={cn("group relative grid h-11 place-items-center rounded-md transition-transform hover:-translate-y-px sm:h-12", FOCUS)} style={{ background: white(0.05) }}>
      <span className="absolute inset-0 rounded-md" style={{ background: fill, opacity: o }} aria-hidden />
      <span className="absolute inset-0 rounded-md ring-1 ring-white/0 transition-colors group-hover:ring-white/50" aria-hidden />
      <span className={cn("nums relative text-sm", dark && o >= 0.55 ? "font-medium text-brand-950" : "text-white")}>{n(value)}</span>
    </DrillLink>
  );
}

/** A plain number or header that opens Master data; underline on hover so it reads as a link. */
function NumLink({ filters, title, label, className, children }: { filters: DrillFilters; title: string; label: string; className?: string; children: React.ReactNode }) {
  return (
    <DrillLink title={title} filters={filters} aria-label={`${label}. Open in Master data`} className={cn("rounded-sm underline-offset-4 hover:underline", FOCUS, className)}>
      {children}
    </DrillLink>
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

/** One block of the right column: its own heading, separated from the next by space and a faint line. */
function Block({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("min-w-0 border-white/15 pt-5 first:pt-0 [&+&]:border-t", className)}>
      <h3 className="text-[13px] font-medium text-white">{title}</h3>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function HeatMatrix({ data }: { data: CategoriesData }) {
  const max = Math.max(1, ...data.degrees.flatMap((d) => [d.coffee.espresso, d.coffee.cappuccino, d.coffee.latte, d.students - d.interviewed]));
  const maxMarks = Math.max(1, ...data.marks.map((b) => b.students));
  const grid = "grid grid-cols-[3.5rem_repeat(4,minmax(0,1fr))_2.5rem] items-center gap-1.5 sm:grid-cols-[5rem_repeat(4,minmax(0,1fr))_3rem]";
  const bandName = (k: string) => data.coffee.find((x) => x.key === k)?.name ?? k;
  return (
    <DesignFrame label="Degrees by Findtern band as a heat matrix" finding={finding(data, "degree")}>
      <div className="grid gap-8 lg:grid-cols-[1fr_19rem] lg:gap-10">
        <div className="min-w-0">
          <div className={cn(grid, "mb-1.5 text-[11px] text-on-dark sm:text-xs")}>
            <span />
            {COLS.map((c) => {
              const b = data.coffee.find((x) => x.key === c.key)!;
              return (
                <NumLink key={c.key} filters={{ band: c.key }} title={`${b.name}, all degrees`} label={`${b.name}, all degrees`} className="min-w-0">
                  <span className="flex items-center gap-1 text-white">
                    <Swatch fill={c.fill} className="size-2 sm:size-2.5" />
                    <span className="hidden truncate sm:inline">{b.name}</span>
                  </span>
                  <span className="nums hidden truncate sm:block">{b.range}</span>
                </NumLink>
              );
            })}
            <NumLink filters={{ band: "none" }} title="Not interviewed yet, all degrees" label="Not interviewed yet, all degrees" className="min-w-0">
              <span className="flex items-center gap-1 text-white">
                <Swatch fill={NONE} className="size-2 sm:size-2.5" />
                <span className="hidden truncate sm:inline">Not yet</span>
              </span>
              <span className="hidden truncate sm:block">no interview</span>
            </NumLink>
            <span className="text-right">Total</span>
          </div>
          <div className="space-y-1.5">
            {data.degrees.map((d) => (
              <div key={d.name} className={grid}>
                <NumLink filters={{ course: d.name }} title={`${d.name}, all students`} label={`${d.name}, all students`} className="truncate text-sm text-white">
                  {d.name}
                </NumLink>
                {COLS.map((c) => (
                  <Cell key={c.key} value={d.coffee[c.key]} fill={c.fill} max={max} dark={c.dark} filters={{ course: d.name, band: c.key }} label={`${d.name}, ${bandName(c.key)}`} />
                ))}
                <Cell value={Math.max(0, d.students - d.interviewed)} fill={NONE} max={max} dark={false} filters={{ course: d.name, band: "none" }} label={`${d.name}, not interviewed yet`} />
                <NumLink filters={{ course: d.name }} title={`${d.name}, all students`} label={`${d.name}: ${d.students} students`} className="nums text-right text-sm text-white">
                  {n(d.students)}
                </NumLink>
              </div>
            ))}
            <div className={cn(grid, "pt-1")}>
              <span className="text-sm text-on-dark">All</span>
              {COLS.map((c) => {
                const v = data.coffee.find((x) => x.key === c.key)?.students ?? 0;
                return (
                  <NumLink key={c.key} filters={{ band: c.key }} title={`${bandName(c.key)}, all degrees`} label={`${bandName(c.key)}: ${v} students`} className={cn("nums text-center text-sm", c.key === "latte" ? "text-accent-300" : "text-white")}>
                    {n(v)}
                  </NumLink>
                );
              })}
              <NumLink filters={{ band: "none" }} title="Not interviewed yet, all degrees" label={`Not interviewed yet: ${notInterviewed(data)} students`} className="nums text-center text-sm text-white">
                {n(notInterviewed(data))}
              </NumLink>
              <NumLink filters={{}} title="All students" label={`All ${data.students} students`} className="nums text-right text-sm text-white">
                {n(data.students)}
              </NumLink>
            </div>
          </div>
          <Legend
            className="mt-3 sm:hidden"
            items={[...COLS.map((c) => ({ label: bandName(c.key), fill: c.fill })), { label: "Not yet interviewed", fill: NONE }]}
          />
        </div>

        <div className="min-w-0 max-lg:order-first">
          <Block title="Done with the AI interview">
            <NumLink filters={{ band: "done" }} title="Done with the AI interview" label={`${data.interviewed} students done with the AI interview`} className="flex items-baseline gap-2">
              <span className="nums text-[2.5rem] font-light leading-none tracking-[-0.03em] text-white">{n(data.interviewed)}</span>
              <span className="nums text-sm text-on-dark">
                of {n(data.students)} students · {pct(data.interviewed, data.students)}%
              </span>
            </NumLink>
          </Block>
          <Block title="CGPA / % bands" className="mt-5">
            <ul className="grid grid-cols-4 gap-1.5" aria-label="CGPA and percentage bands">
              {data.marks.map((b) => {
                const o = level(b.students, maxMarks);
                return (
                  <li key={b.key} className="min-w-0 text-[11px] text-on-dark sm:text-xs">
                    <DrillLink title={`CGPA / % ${b.name} (${b.range})`} filters={{ marks: b.key }} aria-label={`CGPA / % ${b.name} (${b.range}): ${b.students} students. Open in Master data`} className={cn("group block rounded-md", FOCUS)}>
                      <span className="relative grid h-11 place-items-center rounded-md transition-transform group-hover:-translate-y-px sm:h-12" style={{ background: white(0.05) }}>
                        <span className="absolute inset-0 rounded-md" style={{ background: MARKS_FILL[b.key], opacity: o }} aria-hidden />
                        <span className="absolute inset-0 rounded-md ring-1 ring-white/0 transition-colors group-hover:ring-white/50" aria-hidden />
                        <span className={cn("nums relative text-sm", b.key !== "foundation" && b.key !== "rising" && o >= 0.55 ? "font-medium text-brand-950" : "text-white")}>{n(b.students)}</span>
                      </span>
                      <span className="mt-1 block whitespace-nowrap text-white">{b.name}</span>
                      <span className="nums block truncate">{b.range}</span>
                    </DrillLink>
                  </li>
                );
              })}
            </ul>
            {data.marksMissing > 0 ? <p className="nums mt-1.5 text-xs text-on-dark">{n(data.marksMissing)} with no CGPA or % on file</p> : null}
          </Block>
          <Block title="Year of study, share interviewed" className="mt-5">
            <ul className="flex flex-wrap gap-x-4 gap-y-2" aria-label="Students by year">
              {data.years.map((y) => (
                <li key={y.year}>
                  <DrillLink title={`Year ${y.year}`} filters={{ year: y.year }} aria-label={`Year ${y.year}: ${y.interviewed} of ${y.students} interviewed. Open in Master data`} className={cn("group flex items-center gap-2 whitespace-nowrap rounded-md pr-1", FOCUS)}>
                    <Ring share={pct(y.interviewed, y.students)} />
                    <span className="nums text-xs text-on-dark">
                      <span className="block text-[13px] text-white group-hover:underline">Year {y.year}</span>
                      <span className="text-white">{n(y.interviewed)}</span>/{n(y.students)}
                    </span>
                  </DrillLink>
                </li>
              ))}
            </ul>
          </Block>
        </div>
      </div>
    </DesignFrame>
  );
}
