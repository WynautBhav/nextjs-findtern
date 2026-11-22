import type { CategoriesData } from "@/lib/college/overview-modes";
import { COFFEE_FILL, DesignFrame, Figure, Legend, MARKS_FILL, n, pct, white } from "../kit";

/**
 * Categories 1, "Coffee counter": the three Findtern bands as three cups on a counter, each filled to its share of
 * the interviewed students. Beside them, every degree as one bar split by band, and the years under it.
 */
function Cup({ fill, share, label, count, range }: { fill: string; share: number; label: string; count: number; range: string }) {
  // Cup body 0..100 tall; the liquid rises from the bottom to `share`%.
  const h = 92 * (share / 100);
  return (
    <div className="flex flex-col items-center text-center">
      <svg viewBox="0 0 120 120" className="w-24 sm:w-28" aria-hidden>
        <path d="M14 14 H96 L88 106 Q86 114 78 114 H32 Q24 114 22 106 Z" fill={white(0.06)} stroke={white(0.35)} strokeWidth="2" />
        <clipPath id={`cup-${label}`}>
          <path d="M14 14 H96 L88 106 Q86 114 78 114 H32 Q24 114 22 106 Z" />
        </clipPath>
        <rect x="0" y={114 - h} width="120" height={h} fill={fill} clipPath={`url(#cup-${label})`} className="dot-drop" />
        <path d="M96 34 Q114 36 112 56 Q110 74 92 74" fill="none" stroke={white(0.35)} strokeWidth="5" strokeLinecap="round" />
      </svg>
      <p className="mt-2 text-sm font-medium text-white">{label}</p>
      <p className="nums text-xs text-on-dark-subtle">{range}</p>
      <p className="nums mt-1 text-[1.5rem] font-light leading-none text-white">{n(count)}</p>
      <p className="nums text-xs text-on-dark-subtle">{share}%</p>
    </div>
  );
}

export function CoffeeCounter({ data }: { data: CategoriesData }) {
  const top = [...data.coffee].sort((a, b) => b.students - a.students)[0];
  const maxDeg = Math.max(1, ...data.degrees.map((d) => d.students));
  return (
    <DesignFrame
      label="Students by Findtern band, degree and year"
      finding={
        <>
          {n(data.interviewed)} of {n(data.students)} students have done the AI interview
          {top && top.students ? <>; most are {top.name} ({pct(top.students, data.interviewed)}%).</> : "."}
        </>
      }
    >
      <div className="grid gap-8 lg:grid-cols-[auto_1fr]">
        <div className="flex justify-center gap-4 sm:gap-6">
          {data.coffee.map((b) => (
            <Cup key={b.key} fill={COFFEE_FILL[b.key]} share={pct(b.students, data.interviewed)} label={b.name} count={b.students} range={b.range} />
          ))}
        </div>
        <div className="min-w-0 space-y-5">
          <ul className="space-y-2.5" aria-label="Degrees">
            {data.degrees.map((d) => (
              <li key={d.name} className="grid grid-cols-[5.5rem_1fr_4.5rem] items-center gap-3 text-sm">
                <span className="truncate text-white">{d.name}</span>
                <span className="flex h-3 overflow-hidden rounded-full" style={{ width: `${(d.students / maxDeg) * 100}%`, background: white(0.08) }} aria-hidden>
                  {(["latte", "cappuccino", "espresso"] as const).map((k) => (
                    <span key={k} style={{ width: `${pct(d.coffee[k], d.students)}%`, background: COFFEE_FILL[k] }} />
                  ))}
                </span>
                <span className="nums text-right text-xs text-on-dark-subtle">
                  <span className="text-white">{n(d.interviewed)}</span>/{n(d.students)}
                </span>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-x-8 gap-y-3">
            {data.years.map((y) => (
              <Figure key={y.year} label={`Year ${y.year}`} value={n(y.students)} note={`${n(y.interviewed)} interviewed`} />
            ))}
          </div>
          <Legend items={[...data.coffee.map((b) => ({ label: b.name, fill: COFFEE_FILL[b.key] })), { label: "Not interviewed", fill: white(0.08) }]} />
          <div>
            <p className="text-[13px] text-on-dark-subtle">CGPA / % bands</p>
            <ul className="mt-2 flex flex-wrap gap-x-6 gap-y-2" aria-label="CGPA and percentage bands">
              {data.marks.map((b) => (
                <li key={b.key} className="nums flex items-baseline gap-2 text-sm text-white">
                  <span className="size-2.5 self-center rounded-full" style={{ background: MARKS_FILL[b.key] }} aria-hidden />
                  {b.name} <span className="text-xs text-on-dark-subtle">{b.range}</span> <span className="text-base">{n(b.students)}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </DesignFrame>
  );
}
