import type { CategoriesData } from "@/lib/college/overview-modes";
import { cn } from "@/lib/utils";
import { COFFEE_FILL, DesignFrame, MARKS_FILL, n, pct, Swatch, white } from "../kit";
import { BAND_KEYS, finding, Lead, notInterviewed } from "./parts";

/**
 * Categories 6, "Café board": the menu board on the left lists the bands and the marks with leader dots to the count;
 * the shelves beside it hold one cup per degree and band, each cup as tall as its count (square root, one scale across
 * the whole wall) and filled with the band's fill, the number beside it. Zero is an empty outline.
 */
const SHELF_BANDS = BAND_KEYS.slice().reverse();

function Cup({ fill, count, max }: { fill: string; count: number; max: number }) {
  const s = count === 0 ? 0.3 : Math.max(0.34, Math.sqrt(count / Math.max(1, max)));
  const body = "M8 10 H44 L40 48 Q39 52 35 52 H17 Q13 52 12 48 Z";
  return (
    <svg viewBox="0 0 60 56" className="h-9 w-9 shrink-0 sm:h-14 sm:w-14" aria-hidden>
      <g transform={`translate(30 54) scale(${s}) translate(-30 -54)`}>
        <path d={body} fill={count === 0 ? "none" : fill} stroke={white(0.4)} strokeWidth={2 / s > 6 ? 6 : 2 / s} strokeLinejoin="round" />
        <path d="M44 18 Q56 19 55 29 Q54 38 42 39" fill="none" stroke={white(0.4)} strokeWidth={Math.min(5, 3 / s)} strokeLinecap="round" />
      </g>
    </svg>
  );
}

function Leader() {
  return (
    <span aria-hidden className="min-w-4 flex-1 overflow-hidden whitespace-nowrap text-[11px] leading-none text-white/25">
      {". ".repeat(40)}
    </span>
  );
}

function MenuRow({ fill, name, note, value, share, gold }: { fill: string; name: string; note?: string; value: number; share?: string; gold?: boolean }) {
  return (
    <li className="flex items-baseline gap-2 text-sm">
      <Swatch fill={fill} className="self-center" />
      <span className="whitespace-nowrap text-white">{name}</span>
      {note ? <span className="nums whitespace-nowrap text-[11px] text-on-dark-subtle">{note}</span> : null}
      <Leader />
      <span className={cn("nums text-base", gold ? "text-accent-300" : "text-white")}>{n(value)}</span>
      {share ? <span className="nums w-8 text-right text-xs text-on-dark-subtle">{share}</span> : null}
    </li>
  );
}

export function CafeBoard({ data }: { data: CategoriesData }) {
  const max = Math.max(1, ...data.degrees.flatMap((d) => Object.values(d.coffee)));
  return (
    <DesignFrame label="Findtern bands as a café menu, degrees as shelves of cups" finding={finding(data, "band")}>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[17.5rem_minmax(0,1fr)_17rem]">
        <section className="min-w-0 rounded-xl p-4" style={{ background: white(0.06) }} aria-label="Findtern bands">
          <Lead data={data} />
          <p className="mt-4 text-[13px] text-on-dark-subtle">Findtern bands</p>
          <ul className="mt-2 space-y-1.5">
            {SHELF_BANDS.map((k) => {
              const b = data.coffee.find((x) => x.key === k)!;
              return <MenuRow key={k} fill={COFFEE_FILL[k]} name={b.name} note={b.range} value={b.students} share={`${pct(b.students, data.interviewed)}%`} gold={k === "latte"} />;
            })}
            <MenuRow fill={white(0.1)} name="Not interviewed" value={notInterviewed(data)} />
          </ul>
        </section>

        <div className="min-w-0" aria-label="Cups by degree and band">
          <div className="grid grid-cols-[3.75rem_repeat(3,minmax(0,1fr))] gap-x-1 pb-1 text-xs text-on-dark-subtle sm:grid-cols-[5.5rem_repeat(3,minmax(0,1fr))] sm:gap-x-2">
            <span />
            {SHELF_BANDS.map((k) => (
              <span key={k} className="flex items-center gap-1.5 text-white">
                <Swatch fill={COFFEE_FILL[k]} />
                <span className="max-sm:sr-only">{data.coffee.find((x) => x.key === k)?.name}</span>
              </span>
            ))}
          </div>
          {data.degrees.map((d) => (
            <div key={d.name} className="pb-2.5">
              <div className="grid grid-cols-[3.75rem_repeat(3,minmax(0,1fr))] items-end gap-x-1 sm:grid-cols-[5.5rem_repeat(3,minmax(0,1fr))] sm:gap-x-2">
                <div className="min-w-0 pb-1">
                  <p className="truncate text-sm text-white">{d.name}</p>
                  <p className="nums text-xs text-on-dark-subtle">
                    <span className="text-white">{n(d.interviewed)}</span>/{n(d.students)}
                  </p>
                </div>
                {SHELF_BANDS.map((k) => (
                  <div key={k} className="flex items-end gap-1.5 sm:gap-2">
                    <Cup fill={COFFEE_FILL[k]} count={d.coffee[k]} max={max} />
                    <span className={cn("nums pb-1 text-base", k === "latte" ? "text-accent-300" : "text-white")}>{n(d.coffee[k])}</span>
                  </div>
                ))}
              </div>
              <div className="mt-0.5 h-1.5 rounded-full" style={{ background: white(0.22) }} aria-hidden />
            </div>
          ))}
        </div>

        <section className="min-w-0 rounded-xl p-4" style={{ background: white(0.06) }} aria-label="CGPA, percentage and year">
          <p className="text-[13px] text-on-dark-subtle">CGPA / % bands</p>
          <ul className="mt-2 space-y-1.5">
            {data.marks.map((b) => (
              <MenuRow key={b.key} fill={MARKS_FILL[b.key]} name={b.name} note={b.range} value={b.students} gold={b.key === "top"} />
            ))}
          </ul>
          {data.marksMissing > 0 ? <p className="nums mt-1.5 text-xs text-on-dark-subtle">{n(data.marksMissing)} with no CGPA or % on file</p> : null}
          <p className="mt-4 text-[13px] text-on-dark-subtle">Year of study</p>
          <ul className="mt-2 space-y-1.5">
            {data.years.map((y) => (
              <li key={y.year} className="flex items-baseline gap-2 text-sm">
                <span className="text-white">Year {y.year}</span>
                <Leader />
                <span className="nums text-base text-white">{n(y.students)}</span>
                <span className="nums w-[4.5rem] text-right text-xs text-on-dark-subtle">{n(y.interviewed)} done</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </DesignFrame>
  );
}
