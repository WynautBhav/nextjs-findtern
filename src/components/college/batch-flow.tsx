import { Fragment } from "react";
import Link from "next/link";

import { cn } from "@/lib/utils";
import type { RibbonStage } from "./overview-charts";

/**
 * The placement office's hero: the batch walked through step by step. Each step says how many students reached it
 * and its share of the list, and draws the students who stopped there as dots (one hue, ink). Between two steps:
 * how many walked on and how many were left behind. Gold marks the one finding: the step that loses the most and
 * the students it leaves behind. Server-rendered; motion is CSS only, behind prefers-reduced-motion.
 */

const n = (v: number) => v.toLocaleString("en-IN");
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

/** Students by the furthest step they reached: each step minus the next, never below zero. */
function furthest(v: number[]) {
  return v.map((x, i) => Math.max(0, x - (v[i + 1] ?? 0)));
}

function Dots({ count, per, gold }: { count: number; per: number; gold: boolean }) {
  const m = Math.round(count / per);
  return (
    <span aria-hidden className="flex w-[5.75rem] flex-wrap-reverse content-start justify-center gap-1">
      {Array.from({ length: m }, (_, j) => (
        <span key={j} className={cn("dot-drop size-2 rounded-full", gold ? "bg-accent-400" : "bg-white/75")} style={{ animationDelay: `${j * 8}ms` }} />
      ))}
    </span>
  );
}

export function BatchFlow({ stages }: { stages: RibbonStage[] }) {
  const v = stages.map((s) => s.value);
  const total = v[0] ?? 0;
  const stopped = furthest(v);
  const per = Math.max(1, Math.ceil(Math.max(...stopped) / 70));
  // The step between i and i+1 that leaves the most students behind; they stopped at i.
  let worst = 0;
  for (let i = 1; i < v.length - 1; i++) if (v[i] - v[i + 1] > v[worst] - v[worst + 1]) worst = i;
  const left = (i: number) => v[i] - v[i + 1];

  return (
    <div className="mt-8">
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
        <div>
          <p className="text-sm text-on-dark-subtle">Students in this batch</p>
          <p className="nums mt-1 text-[2.5rem] font-light leading-none tracking-[-0.03em] text-white">{n(total)}</p>
        </div>
        {left(worst) > 0 ? (
          <p className="max-w-md text-sm text-white sm:text-right">
            Biggest drop: <span className="nums font-medium text-accent-300">{n(left(worst))}</span> of {n(v[worst])} stop at {stages[worst].label}.
          </p>
        ) : null}
      </div>

      {/* Wide: steps across, the walk-on rate in the gutter between each pair. */}
      <ol className="mt-8 hidden grid-cols-[repeat(4,minmax(0,1fr)_auto)_minmax(0,1fr)] items-end sm:grid" aria-label="Your batch, step by step">
        {stages.map((s, i) => (
          <Fragment key={s.label}>
            <li className="min-w-0">
              <Link href={s.href} className="flex flex-col items-center rounded-xl px-2 pb-3 pt-2 text-center outline-none hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-white/70">
                <Dots count={stopped[i]} per={per} gold={i === worst} />
                <span className="mt-4 text-[13px] text-on-dark-subtle">{s.label}</span>
                <span className="nums mt-1 text-[1.75rem] font-light leading-none text-white">{n(s.value)}</span>
                <span className="nums mt-1.5 text-xs text-on-dark-subtle">{pct(s.value, total)}% of list</span>
                <span className={cn("nums mt-1 text-xs", i === worst ? "text-accent-300" : "text-on-dark-subtle")}>
                  {i === v.length - 1 ? `${n(stopped[i])} hired` : `${n(stopped[i])} stopped here`}
                </span>
              </Link>
            </li>
            {i < v.length - 1 ? (
              <li aria-hidden className="self-center px-1 pb-14 text-center lg:px-3">
                <span className={cn("nums block text-base font-medium", i === worst ? "text-accent-300" : "text-white")}>{pct(v[i + 1], v[i])}%</span>
                <span className="nums block whitespace-nowrap text-[11px] text-on-dark-subtle">walk on</span>
                <span className={cn("nums mt-1 block whitespace-nowrap text-[11px]", i === worst ? "text-accent-300" : "text-on-dark-subtle")}>−{n(left(i))}</span>
              </li>
            ) : null}
          </Fragment>
        ))}
      </ol>

      {/* Phone: steps down the screen, the walk-on rate between rows. */}
      <ol className="mt-6 sm:hidden" aria-label="Your batch, step by step">
        {stages.map((s, i) => (
          <li key={s.label}>
            <Link href={s.href} className="flex items-center gap-4 rounded-xl py-2 outline-none focus-visible:ring-2 focus-visible:ring-white/70">
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] text-on-dark-subtle">{s.label}</span>
                <span className="nums mt-0.5 flex items-baseline gap-2">
                  <span className="text-2xl font-light leading-none text-white">{n(s.value)}</span>
                  <span className="text-xs text-on-dark-subtle">{pct(s.value, total)}%</span>
                </span>
                <span className={cn("nums mt-1 block text-xs", i === worst ? "text-accent-300" : "text-on-dark-subtle")}>
                  {i === v.length - 1 ? `${n(stopped[i])} hired` : `${n(stopped[i])} stopped here`}
                </span>
              </span>
              <Dots count={stopped[i]} per={per} gold={i === worst} />
            </Link>
            {i < v.length - 1 ? (
              <p aria-hidden className={cn("nums py-1 text-xs", i === worst ? "text-accent-300" : "text-on-dark-subtle")}>
                {pct(v[i + 1], v[i])}% walk on · −{n(left(i))}
              </p>
            ) : null}
          </li>
        ))}
      </ol>
      {per > 1 ? <p className="mt-2 text-xs text-on-dark-subtle">One dot, {per} students.</p> : null}
    </div>
  );
}
