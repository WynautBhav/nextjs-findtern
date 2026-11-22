import type { CategoriesData } from "@/lib/college/overview-modes";
import { COFFEE_FILL, DesignFrame, n, pct, Swatch } from "../kit";
import { arcPath, BAND_KEYS, finding, MarksBars, NOT_YET, notInterviewed, segments, step, YearBars } from "./parts";

/**
 * Categories 4, "Rings": two thin rings round the interview count. The inner ring is the degrees, each arc as long as
 * its students; the outer ring splits every degree's arc by Findtern band, so each band arc sits on the degree it
 * belongs to. The tables beside it carry the values, so nothing is labelled on a slice.
 */
const C = 160;

export function Rings({ data }: { data: CategoriesData }) {
  const total = Math.max(1, data.degrees.reduce((s, d) => s + d.students, 0));
  const arcs = data.degrees.map((d, i) => {
    const t0 = data.degrees.slice(0, i).reduce((s, x) => s + x.students, 0) / total;
    return { d, i, t0, t1: t0 + d.students / total };
  });
  const gap = data.degrees.length > 1 ? 0.004 : 0;
  return (
    <DesignFrame label="Degrees and Findtern bands as two rings" finding={finding(data, "band")}>
      <div className="grid items-center gap-8 md:grid-cols-[auto_1fr]">
        <div className="relative mx-auto w-[17.5rem] sm:w-[20rem]">
          <svg viewBox="0 0 320 320" className="block w-full" aria-hidden>
            {arcs.map(({ d, i, t0, t1 }) => {
              if (d.students === 0) return null;
              const a0 = t0 + gap;
              const a1 = t1 - gap;
              let run = a0;
              return (
                <g key={d.name}>
                  <path d={arcPath(C, C, 98, 118, a0, a1)} fill={step(i)} fillRule="evenodd" />
                  {segments(d).map((s, k) => {
                    if (s.count === 0) return null;
                    const s0 = run;
                    run += (s.count / d.students) * (a1 - a0);
                    return <path key={k} d={arcPath(C, C, 124, 144, s0, run)} fill={s.fill} fillRule="evenodd" className="dot-drop" />;
                  })}
                </g>
              );
            })}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="nums text-[2.5rem] font-light leading-none tracking-[-0.03em] text-white">{n(data.interviewed)}</span>
            <span className="mt-1.5 text-[13px] text-on-dark-subtle">done with the</span>
            <span className="text-[13px] text-on-dark-subtle">AI interview</span>
            <span className="nums mt-1 text-xs text-on-dark-subtle">
              of {n(data.students)} · {pct(data.interviewed, data.students)}%
            </span>
          </div>
        </div>
        <div className="grid min-w-0 gap-x-8 gap-y-5 sm:grid-cols-2">
          <div>
            <p className="text-[13px] text-on-dark-subtle">Degree (inner ring)</p>
            <ul className="mt-2 space-y-1.5" aria-label="Degrees">
              {data.degrees.map((d, i) => (
                <li key={d.name} className="grid grid-cols-[1fr_auto] items-center gap-2 text-[13px]">
                  <span className="flex min-w-0 items-center gap-1.5 text-white">
                    <Swatch fill={step(i)} />
                    <span className="truncate">{d.name}</span>
                  </span>
                  <span className="nums text-on-dark-subtle">
                    <span className="text-white">{n(d.students)}</span> · {n(d.interviewed)} done
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-[13px] text-on-dark-subtle">Findtern band (outer ring)</p>
            <ul className="mt-2 space-y-1.5" aria-label="Findtern bands">
              {BAND_KEYS.slice()
                .reverse()
                .map((k) => {
                  const b = data.coffee.find((x) => x.key === k)!;
                  return (
                    <li key={k} className="grid grid-cols-[1fr_auto] items-center gap-2 text-[13px]">
                      <span className="flex items-center gap-1.5 text-white">
                        <Swatch fill={COFFEE_FILL[k]} />
                        {b.name} <span className="nums text-[11px] text-on-dark-subtle">{b.range}</span>
                      </span>
                      <span className="nums text-on-dark-subtle">
                        <span className={k === "latte" ? "text-accent-300" : "text-white"}>{n(b.students)}</span> · {pct(b.students, data.interviewed)}%
                      </span>
                    </li>
                  );
                })}
              <li className="grid grid-cols-[1fr_auto] items-center gap-2 text-[13px]">
                <span className="flex items-center gap-1.5 text-white">
                  <Swatch fill={NOT_YET} />
                  Not interviewed
                </span>
                <span className="nums text-white">{n(notInterviewed(data))}</span>
              </li>
            </ul>
          </div>
          <YearBars data={data} />
          <MarksBars data={data} />
        </div>
      </div>
    </DesignFrame>
  );
}
