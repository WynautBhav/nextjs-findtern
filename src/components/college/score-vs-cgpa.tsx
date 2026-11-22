"use client";

import { useState } from "react";
import Link from "next/link";

import { HIGH_CGPA, STRONG_SCORE, quadrantOf, type Quadrant } from "@/lib/college/insights";
import { cn } from "@/lib/utils";

export type ScorePoint = { userId: string; name: string; score: number; cgpa: number };

const QUADS: { id: Quadrant; name: string; hint: string; dot: string; swatch: string }[] = [
  { id: "scoreBeatsCg", name: "Score beats CGPA", hint: "Interview better than marks", dot: "fill-accent-500", swatch: "bg-accent-500" },
  { id: "stars", name: "Strong on both", hint: "Ready for any drive", dot: "fill-brand-700", swatch: "bg-brand-700" },
  { id: "support", name: "Needs support", hint: "Low on both", dot: "fill-ink-300", swatch: "bg-ink-300" },
  { id: "cgBeatsScore", name: "CGPA beats score", hint: "Marks better than interview", dot: "fill-ink-500", swatch: "bg-ink-500" },
];

/** A small, stable nudge so students on the same score and CGPA don't sit on one dot. */
function jitter(id: string, n: number) {
  let h = n;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return ((h >>> 0) % 1000) / 1000 - 0.5;
}

const LIST = 6;

/**
 * Findtern score against CGPA, one dot per interviewed student, cut at score 7 and CGPA 7.5. The four groups beside the
 * chart are buttons: pressing one lights its dots and lists its students, highest score first, each opening the student.
 * It lives on the Dashboard only. The dots are a picture, so a keyboard user tabs through four groups, not 300 dots.
 */
export function ScoreVsCgpa({ points }: { points: ScorePoint[] }) {
  const [pick, setPick] = useState<Quadrant | null>(null);
  const W = 520, H = 260, L = 30, R = 8, T = 8, B = 26;
  const minCg = Math.max(0, Math.min(5, Math.floor(Math.min(...points.map((p) => p.cgpa)))));
  const x = (cg: number) => L + ((cg - minCg) / (10 - minCg)) * (W - L - R);
  const y = (sc: number) => T + (1 - sc / 10) * (H - T - B);
  const groupOf = new Map(points.map((p) => [p.userId, quadrantOf(p)!]));
  const counts = Object.fromEntries(QUADS.map((q) => [q.id, 0])) as Record<Quadrant, number>;
  for (const p of points) counts[groupOf.get(p.userId)!]++;
  const xTicks = Array.from({ length: 10 - minCg + 1 }, (_, i) => minCg + i);
  const listed = pick ? points.filter((p) => groupOf.get(p.userId) === pick).sort((a, b) => b.score - a.score || b.cgpa - a.cgpa) : [];

  return (
    <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Findtern score against CGPA for ${points.length} students. ${QUADS.map((q) => `${q.name}: ${counts[q.id]}`).join(", ")}.`}>
        {[0, 2, 4, 6, 8, 10].map((v) => (
          <g key={`y${v}`}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className="stroke-ink-100" />
            <text x={L - 6} y={y(v) + 3.5} textAnchor="end" className="nums fill-ink-500 text-[10px]">{v}</text>
          </g>
        ))}
        {xTicks.map((v) => (
          <text key={`x${v}`} x={x(v)} y={H - B + 14} textAnchor="middle" className="nums fill-ink-500 text-[10px]">{v}</text>
        ))}
        <text x={W - R} y={H - 2} textAnchor="end" className="fill-ink-600 text-[10px]">CGPA →</text>
        <text x={L + 4} y={T + 10} className="fill-ink-600 text-[10px]">↑ Findtern score</text>
        <line x1={x(HIGH_CGPA)} x2={x(HIGH_CGPA)} y1={T} y2={H - B} className="stroke-ink-400" strokeDasharray="3 3" />
        <line x1={L} x2={W - R} y1={y(STRONG_SCORE)} y2={y(STRONG_SCORE)} className="stroke-ink-400" strokeDasharray="3 3" />
        <g aria-hidden>
          {points.map((p) => {
            const q = QUADS.find((g) => g.id === groupOf.get(p.userId))!;
            return (
              <circle
                key={p.userId}
                cx={x(p.cgpa + jitter(p.userId, 7) * 0.08)}
                cy={y(p.score + jitter(p.userId, 13) * 0.08)}
                r={pick === q.id ? 4 : 3.2}
                className={cn(q.dot, "transition-opacity duration-200 motion-reduce:transition-none", pick && pick !== q.id ? "opacity-15" : "opacity-85")}
              >
                <title>{`${p.name}: score ${p.score.toFixed(1)}, CGPA ${p.cgpa.toFixed(1)}`}</title>
              </circle>
            );
          })}
        </g>
      </svg>

      <div className="min-w-0">
        <div role="group" aria-label="Show a group" className="grid grid-cols-2 gap-2">
          {QUADS.map((q) => {
            const on = pick === q.id;
            return (
              <button
                key={q.id}
                type="button"
                aria-pressed={on}
                onClick={() => setPick(on ? null : q.id)}
                className={cn(
                  "flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600",
                  on ? "border-ink-900 bg-ink-50" : "border-ink-200/80 hover:border-ink-300 hover:bg-ink-50",
                )}
              >
                <span aria-hidden className={cn("mt-1.5 size-2.5 shrink-0 rounded-full", q.swatch)} />
                <span className="min-w-0">
                  <span className="nums block text-xl font-medium leading-tight text-ink-900">{counts[q.id]}</span>
                  <span className="block text-sm font-medium text-ink-800">{q.name}</span>
                  <span className="block text-xs text-text-subtle">{q.hint}</span>
                </span>
              </button>
            );
          })}
        </div>
        {pick ? (
          <div className="mt-4">
            <p className="text-xs text-text-subtle">
              {QUADS.find((q) => q.id === pick)!.name}, highest score first{listed.length > LIST ? ` · ${LIST} of ${listed.length}` : ""}
            </p>
            <ul className="mt-1 divide-y divide-ink-100">
              {listed.slice(0, LIST).map((p) => (
                <li key={p.userId}>
                  <Link href={`/college/students/${p.userId}`} className="flex items-center gap-3 py-2 text-sm hover:underline hover:underline-offset-4 focus-visible:outline-2 focus-visible:outline-brand-600">
                    <span className="min-w-0 flex-1 truncate font-medium text-ink-900">{p.name}</span>
                    <span className="nums text-xs text-text-subtle">CGPA <span className="text-ink-800">{p.cgpa.toFixed(1)}</span></span>
                    <span className="nums w-8 text-right font-medium text-ink-900">{p.score.toFixed(1)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="mt-4 text-sm text-text-subtle">Press a group to see its students.</p>
        )}
      </div>
    </div>
  );
}
