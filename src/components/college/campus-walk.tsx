import Link from "next/link";

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
const PLACES = ["Gate", "Admin block", "Exam hall", "Interview room", "Joining desk"];
const STOPPED = ["not joined yet", "verified only", "interviewed", "have an offer", "hired"];

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
      {per > 1 ? <p className="mt-1 text-xs text-on-dark-subtle">One dot, {per} students.</p> : null}
    </div>
  );
}

export function BatchCampusWalk({ stages }: { stages: RibbonStage[] }) {
  const counts = furthest(stages);
  const total = stages[0]?.value ?? 0;
  const reached = stages.map((s) => s.value);
  // The station where most students are stuck (the joining desk is the goal, not a place to be stuck).
  let stuck = 0;
  for (let i = 1; i < 4; i++) if (counts[i] > counts[stuck]) stuck = i;

  return (
    <div className="mt-8">
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
        <div>
          <p className="text-sm text-on-dark-subtle">Students on the walk</p>
          <p className="nums mt-1 text-[2.5rem] font-light leading-none tracking-[-0.03em] text-white">{n(total)}</p>
        </div>
        {counts[stuck] > 0 ? (
          <p className="max-w-md text-sm text-white sm:text-right">
            Most are stuck at the {PLACES[stuck]}: <span className="nums font-medium text-accent-300">{n(counts[stuck])}</span> {STOPPED[stuck]}, no further yet.
          </p>
        ) : null}
      </div>

      <figure className="mt-4" role="img" aria-label={`${total} students. ${PLACES.map((p, i) => `${p}: ${reached[i]} reached, ${counts[i]} stopped here`).join("; ")}`}>
        <Scene counts={counts} stuck={stuck} W={1000} cols={7} className="hidden sm:block" />
        <Scene counts={counts} stuck={stuck} W={520} cols={5} className="sm:hidden" />
      </figure>

      {/* Under each building, everything Findtern knows about that stop. */}
      <ol className="mt-4 hidden grid-cols-5 gap-3 sm:grid" aria-label="Each stop on the walk">
        {stages.map((s, i) => {
          const next = reached[i + 1];
          return (
            <li key={s.label} className="min-w-0">
              <Link href={s.href} className="block h-full rounded-xl bg-white/[0.05] px-3 py-3 text-center outline-none hover:bg-white/[0.09] focus-visible:ring-2 focus-visible:ring-white/70">
                <span className="block text-[13px] text-on-dark-subtle">{PLACES[i]}</span>
                <span className="nums mt-1 block text-[1.75rem] font-light leading-none text-white">{n(reached[i])}</span>
                <span className="mt-1 block text-xs text-on-dark-subtle">{s.label}</span>
                <span className="mt-3 block space-y-1 text-xs">
                  <span className={cn("nums block", i === stuck ? "font-medium text-accent-300" : "text-white")}>
                    {i === 4 ? `${n(counts[i])} made it` : `${n(counts[i])} stopped here`}
                  </span>
                  <span className="nums block text-on-dark-subtle">{total ? Math.round((reached[i] / total) * 100) : 0}% of your list</span>
                  {next !== undefined ? (
                    <span className="nums block text-on-dark-subtle">
                      {n(next)} went on · {reached[i] ? Math.round((next / reached[i]) * 100) : 0}%
                    </span>
                  ) : null}
                  {i > 0 ? <span className="block text-on-dark-subtle">{s.hint}</span> : null}
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
      <ol className="mt-4 space-y-2 sm:hidden" aria-label="Each stop on the walk">
        {stages.map((s, i) => {
          const next = reached[i + 1];
          return (
            <li key={s.label}>
              <Link href={s.href} className="flex items-start justify-between gap-4 rounded-xl bg-white/[0.05] px-4 py-3 outline-none focus-visible:ring-2 focus-visible:ring-white/70">
                <span className="min-w-0">
                  <span className="block text-[13px] text-white">{PLACES[i]}</span>
                  <span className="block text-xs text-on-dark-subtle">{s.hint}</span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="nums block text-xl font-light leading-none text-white">{n(reached[i])}</span>
                  <span className={cn("nums mt-1 block text-xs", i === stuck ? "text-accent-300" : "text-on-dark-subtle")}>
                    {i === 4 ? `${n(counts[i])} made it` : `${n(counts[i])} here`}
                    {next !== undefined && reached[i] ? ` · ${Math.round((next / reached[i]) * 100)}% on` : ""}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
