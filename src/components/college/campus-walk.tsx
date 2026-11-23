import Link from "next/link";

import { HIDDEN_REASONS } from "@/lib/college/labels";
import type { HiddenReason } from "@/lib/college/student-readiness";
import { cn } from "@/lib/utils";
import type { RibbonStage } from "./overview-charts";

/**
 * The placement office's hero: the season as a walk across campus, from the gate to the joining desk. Every student
 * is a dot standing at the building where they stopped; the path between buildings marches toward a hire.
 * Server-rendered from the five funnel stages; motion is CSS only, behind prefers-reduced-motion (globals.css).
 */

/** One hue on the data: every student in ink; gold only on the stop where most are stuck (the screen's finding). */
const INK = "rgb(255 255 255 / 0.78)";
const GOLD = "var(--color-accent-400)";
const DETAIL = "rgb(255 255 255 / 0.32)";

/** One-word step names for a phone, where five long labels would wrap to three lines. */
const SHORT = ["List", "Verified", "Interview", "Offer", "Hired"];

const n = (v: number) => v.toLocaleString("en-IN");

/** Students by the furthest stage they reached: each stage minus the next, never below zero. */
function furthest(stages: RibbonStage[]) {
  const v = stages.map((s) => s.value);
  return v.map((x, i) => Math.max(0, x - (v[i + 1] ?? 0)));
}

/** The building at each stop, drawn on its own baseline (y = 0 is the ground, x = 0 its centre). */
function Building({ i }: { i: number }) {
  const wall = `rgb(255 255 255 / ${0.07 + i * 0.025})`;
  const accent = DETAIL;
  switch (i) {
    case 0: // Gate: two pillars under an arch
      return (
        <g>
          <path d="M-34 0 V-40 Q0 -66 34 -40 V0 H22 V-34 Q0 -50 -22 -34 V0 Z" fill={wall} />
          <rect x="-38" y="-46" width="12" height="6" rx="1.5" fill={wall} />
          <rect x="26" y="-46" width="12" height="6" rx="1.5" fill={wall} />
        </g>
      );
    case 1: // Admin block: a wide two-storey block with a row of windows
      return (
        <g>
          <rect x="-42" y="-44" width="84" height="44" rx="3" fill={wall} />
          {[-28, -14, 0, 14, 28].map((x) => (
            <rect key={x} x={x - 4} y="-36" width="8" height="9" rx="1.5" fill={accent} opacity="0.55" />
          ))}
          <rect x="-6" y="-16" width="12" height="16" rx="1.5" fill={accent} />
        </g>
      );
    case 2: // Exam hall: a pediment over columns
      return (
        <g>
          <path d="M-44 -40 L0 -62 L44 -40 Z" fill={wall} />
          <rect x="-40" y="-40" width="80" height="6" fill={wall} />
          {[-30, -15, 0, 15, 30].map((x) => (
            <rect key={x} x={x - 3.5} y="-32" width="7" height="28" rx="1" fill={wall} />
          ))}
          <rect x="-44" y="-4" width="88" height="4" fill={wall} />
          <rect x="-6" y="-24" width="12" height="20" rx="1.5" fill={accent} />
        </g>
      );
    case 3: // Interview room: a small house
      return (
        <g>
          <path d="M-32 0 V-28 L0 -50 L32 -28 V0 Z" fill={wall} />
          <rect x="-7" y="-18" width="14" height="18" rx="2" fill={accent} />
        </g>
      );
    default: // Joining desk: an office tower with a flag
      return (
        <g>
          <rect x="-24" y="-66" width="48" height="66" rx="3" fill={wall} />
          {[-54, -42, -30].map((y) => (
            <g key={y}>
              <rect x="-14" y={y} width="10" height="6" rx="1" fill={accent} opacity="0.5" />
              <rect x="4" y={y} width="10" height="6" rx="1" fill={accent} opacity="0.5" />
            </g>
          ))}
          <rect x="-7" y="-16" width="14" height="16" rx="2" fill={accent} />
          <path d="M18 -66 V-88" stroke="white" strokeOpacity="0.5" strokeWidth="1.5" />
          <path d="M18 -88 L32 -83 L18 -78 Z" fill={accent} />
        </g>
      );
  }
}

/**
 * The scene itself, at one width. The wide screen gets five stops 200 units apart; a phone gets them closer (W 520)
 * with narrower stacks, so the buildings and dots draw about twice as large instead of shrinking to specks.
 */
function Scene({ counts, stuck, W, cols, className }: { counts: number[]; stuck: number; W: number; cols: number; className?: string }) {
  const xs = [0.1, 0.3, 0.5, 0.7, 0.9].map((f) => f * W);
  const GAP = 12;
  const per = Math.max(1, Math.ceil(Math.max(...counts) / (cols * 9)));
  const stacks = counts.map((c) => Math.round(c / per));
  // Height of each building above the ground (the joining desk's flag included); a stack stands just above its roof.
  const ROOF = [56, 46, 64, 52, 90];
  const top = Math.min(...stacks.map((m, i) => -(ROOF[i] + 12 + Math.max(1, Math.ceil(m / cols)) * GAP)));
  const bottom = 40;
  const bend = W / 16;
  const path = `M8,22 ` + xs.map((x, i) => `${i === 0 ? "L" : "S"}${x - bend},${i % 2 ? 32 : 14} ${x},22`).join(" ") + ` L${W - 8},22`;
  return (
    <div className={className}>
      <div className="relative">
      <svg viewBox={`0 ${top} ${W} ${bottom - top}`} className="block w-full" aria-hidden>
        <path d={path} fill="none" stroke="var(--color-accent-300)" strokeOpacity="0.45" strokeWidth="2.5" strokeDasharray="2 10" strokeLinecap="round" className="walk-march" />
        {xs.map((x, i) => {
          const m = stacks[i];
          const base = -ROOF[i] - 10;
          return (
            <g key={i}>
              <g transform={`translate(${x} 0)`}>
                <Building i={i} />
              </g>
              {Array.from({ length: m }, (_, j) => {
                const row = Math.floor(j / cols);
                const inRow = Math.min(cols, m - row * cols);
                const col = j % cols;
                return (
                  <circle
                    key={j}
                    cx={x + (col - (inRow - 1) / 2) * GAP}
                    cy={base - row * GAP}
                    r="4.5"
                    fill={i === stuck ? GOLD : INK}
                    className="dot-drop"
                    style={{ animationDelay: `${i * 120 + j * 10}ms` }}
                  />
                );
              })}
            </g>
          );
        })}
      </svg>
      </div>
      {per > 1 ? <p className="mt-1 text-xs text-on-dark">One dot, {per} students.</p> : null}
    </div>
  );
}

/**
 * Verified students employers cannot see, by the first reason that blocks each one, so the rows add up to the total.
 * Every row opens the Students page showing just those students. Paused is listed only when someone is.
 */
function HiddenProfiles({ counts }: { counts: Partial<Record<HiddenReason, number>> }) {
  const total = Object.values(counts).reduce((a, b) => a + (b ?? 0), 0);
  const rows = HIDDEN_REASONS.filter((r) => r.id !== "paused" || (counts.paused ?? 0) > 0);
  return (
    <nav aria-label="Hidden profiles" className="min-w-0 lg:max-w-[44rem]">
      <Link href="/college/students?show=hidden" className="flex flex-wrap items-baseline gap-x-2 rounded-lg px-2 py-1 outline-none hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-white/70">
        <span className="whitespace-nowrap text-sm text-white">Hidden profiles</span>
        <span className="nums text-sm font-medium text-accent-300">{n(total)}</span>
        <span className="basis-full text-xs text-on-dark sm:basis-auto">employers can&apos;t see them yet</span>
      </Link>
      <ul className="mt-1 grid grid-cols-3 gap-1 sm:grid-flow-col sm:auto-cols-fr sm:grid-cols-none">
        {rows.map((r) => {
          const v = counts[r.id] ?? 0;
          return (
            <li key={r.id} className="min-w-0">
              <Link
                href={`/college/students?show=hidden&why=${r.id}`}
                className="flex h-full flex-col justify-between gap-1.5 rounded-xl px-2 py-2 outline-none hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-white/70"
              >
                <span className="text-[11px] leading-tight text-on-dark sm:text-xs">{r.label}</span>
                <span className={cn("nums text-[1.375rem] font-light leading-none", v ? "text-white" : "text-white/40")}>{n(v)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function BatchCampusWalk({ stages, hidden }: { stages: RibbonStage[]; hidden?: Partial<Record<HiddenReason, number>> }) {
  const counts = furthest(stages);
  const total = stages[0]?.value ?? 0;
  const reached = stages.map((s) => s.value);
  // The station where most students are stuck (the joining desk is the goal, not a place to be stuck).
  let stuck = 0;
  for (let i = 1; i < 4; i++) if (counts[i] > counts[stuck]) stuck = i;

  return (
    <div className="mt-8">
      <div className="flex flex-col gap-x-10 gap-y-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm text-on-dark">Students in your batch</p>
          <p className="nums mt-1 text-[2.5rem] font-light leading-none tracking-[-0.03em] text-white">{n(total)}</p>
          {counts[stuck] > 0 ? (
            <p className="mt-3 max-w-md text-sm text-white">
              Most are stuck at {stages[stuck].label}: <span className="nums font-medium text-accent-300">{n(counts[stuck])}</span> students, no further yet.
            </p>
          ) : null}
        </div>
        {hidden ? <HiddenProfiles counts={hidden} /> : null}
      </div>

      <figure className="mt-4" role="img" aria-label={`${total} students. ${stages.map((st, i) => `${st.label}: ${reached[i]}, ${counts[i]} stopped there`).join("; ")}`}>
        <Scene counts={counts} stuck={stuck} W={1000} cols={7} className="hidden sm:block" />
        <Scene counts={counts} stuck={stuck} W={520} cols={5} className="sm:hidden" />
      </figure>

      {/* Under each building: the step, how many reached it, how many stopped there. */}
      <ol className="mt-4 grid grid-cols-5 gap-1 text-center sm:gap-3" aria-label="Each step">
        {stages.map((s, i) => (
          <li key={s.label} className="min-w-0">
            <Link href={s.href} className="block rounded-xl px-1 py-2 outline-none hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-white/70">
              <span className="block text-[11px] leading-tight text-on-dark sm:text-[13px]">
                <span className="sm:hidden">{SHORT[i]}</span>
                <span className="hidden sm:inline">{s.label}</span>
              </span>
              <span className="nums mt-1 block text-[1.375rem] font-light leading-none text-white sm:text-[1.75rem]">{n(reached[i])}</span>
              <span className={cn("nums mt-1.5 block text-[11px] sm:text-xs", i === stuck ? "font-medium text-accent-300" : "text-on-dark")}>
                {i === 4 ? (counts[i] ? <><span className="hidden sm:inline">with an employer</span><span className="sm:hidden">working</span></> : "none yet") : <>{n(counts[i])}<span className="hidden sm:inline"> stopped here</span><span className="sm:hidden"> here</span></>}
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}
