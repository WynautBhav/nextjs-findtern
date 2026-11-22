import Link from "next/link";

import { HIGH_CGPA, STRONG_SCORE, quadrantOf, type Quadrant } from "@/lib/college/insights";
import { cn } from "@/lib/utils";

/**
 * The drawings on the placement office's Overview. All server-rendered from the college's own students: no
 * chart library, no client state. Motion is CSS only and sits behind prefers-reduced-motion (globals.css).
 */

export type RibbonStage = { label: string; value: number; hint: string; href: string };

const BUCKETS = 20; // half a point each, 0 to 10

/**
 * Every interviewed student's Findtern score as one curve. Bars are coloured by where employers draw the line
 * (6 and 8, the cut-offs every drive filter uses); the median is marked so one glance says where the batch sits.
 */
export function ScoreCurve({ scores, median }: { scores: number[]; median: number | null }) {
  const counts = Array.from({ length: BUCKETS }, () => 0);
  for (const s of scores) counts[Math.min(BUCKETS - 1, Math.max(0, Math.floor(s * 2)))]++;
  const peak = Math.max(1, ...counts);
  const below = scores.filter((s) => s < 6).length;
  const mid = scores.filter((s) => s >= 6 && s < 8).length;
  const high = scores.filter((s) => s >= 8).length;
  // One hue, three steps: the darker, the more employers' filters let through. Amber stays for "score beats CGPA".
  const tone = (i: number) => (i >= 16 ? "bg-brand-800" : i >= 12 ? "bg-brand-500" : "bg-brand-200");
  return (
    <div>
      <div
        role="img"
        aria-label={`Findtern scores of ${scores.length} interviewed students. ${below} below 6, ${mid} from 6 to 8, ${high} at 8 or above.${median !== null ? ` Median ${median.toFixed(1)}.` : ""}`}
        className="relative mt-6 h-64"
      >
        <div className="absolute inset-0 flex items-end gap-[3px]">
          {counts.map((c, i) => (
            <div key={i} className="flex h-full min-w-0 flex-1 items-end" title={`${(i / 2).toFixed(1)} to ${((i + 1) / 2).toFixed(1)}: ${c} ${c === 1 ? "student" : "students"}`}>
              <div
                className={cn("bar-rise w-full origin-bottom rounded-t-[3px]", c ? tone(i) : "bg-ink-100")}
                style={{ height: c ? `${Math.max(6, (c / peak) * 100)}%` : "2px", animationDelay: `${i * 18}ms` }}
              />
            </div>
          ))}
        </div>
        {/* Where most employers filter, the same dashed line as Branch by branch. */}
        <div aria-hidden className="pointer-events-none absolute inset-y-0 border-l border-dashed border-ink-300" style={{ left: "60%" }} />
        {median !== null ? (
          <div aria-hidden className="pointer-events-none absolute inset-y-0" style={{ left: `${(median / 10) * 100}%` }}>
            <div className="h-full border-l border-dashed border-ink-900/60" />
            <span className="nums absolute -top-1 left-1.5 whitespace-nowrap rounded bg-ink-900 px-1.5 py-0.5 text-[11px] font-medium text-white">Median {median.toFixed(1)}</span>
          </div>
        ) : null}
      </div>
      <div aria-hidden className="nums mt-1.5 flex justify-between text-[11px] text-text-subtle">
        {[0, 2, 4, 6, 8, 10].map((n) => (
          <span key={n}>{n}</span>
        ))}
      </div>
      <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-ink-100 pt-4">
        {[
          { label: "Below 6", n: below, dot: "bg-brand-200" },
          { label: "6 to 8", n: mid, dot: "bg-brand-500" },
          { label: "8 and above", n: high, dot: "bg-brand-800" },
        ].map((b) => (
          <div key={b.label} className="min-w-0">
            <dt className="flex items-center gap-1.5 text-xs text-text-subtle">
              <span aria-hidden className={cn("size-2 shrink-0 rounded-full", b.dot)} />
              {b.label}
            </dt>
            <dd className="nums mt-0.5 text-2xl font-medium tracking-[-0.02em] text-ink-900">{b.n}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export type BranchRow = { branch: string; students: number; interviewed: number; scores: number[] };

const medianOf = (xs: number[]) => {
  if (!xs.length) return null;
  const v = [...xs].sort((a, b) => a - b);
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};

/**
 * Branch by branch, every interviewed student as a tick on one 0-10 line, so a branch's spread shows and not only its
 * average; the ink bar is the branch's median and the dashed line is 6, where most employers filter. Ranked by median.
 */
export function BranchBoard({ rows }: { rows: BranchRow[] }) {
  const ranked = rows.map((r) => ({ ...r, median: medianOf(r.scores) })).sort((a, b) => (b.median ?? -1) - (a.median ?? -1));
  return (
    <div>
      <div aria-hidden className="hidden grid-cols-[12rem_minmax(0,1fr)_4.5rem] gap-6 pb-2 text-xs text-text-subtle sm:grid">
        <span>Branch</span>
        <span className="nums relative h-4">
          {[0, 2, 4, 6, 8, 10].map((n) => (
            <span key={n} className="absolute -translate-x-1/2 first:translate-x-0 last:-translate-x-full" style={{ left: `${n * 10}%` }}>{n}</span>
          ))}
        </span>
        <span className="text-right">Median</span>
      </div>
      <ul className="divide-y divide-ink-100 border-t border-ink-100">
        {ranked.map((r, i) => (
          <li key={r.branch} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 gap-y-2 py-3 sm:grid-cols-[12rem_minmax(0,1fr)_4.5rem]">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-ink-900">{r.branch}</p>
              <p className="nums text-xs text-text-subtle">{r.interviewed} of {r.students} interviewed</p>
            </div>
            <div
              role="img"
              aria-label={`${r.branch}: ${r.scores.length} scores${r.median !== null ? `, median ${r.median.toFixed(1)}` : ""}`}
              className="relative col-span-2 h-7 sm:col-span-1 sm:col-start-2 sm:row-start-1"
            >
              <span aria-hidden className="absolute inset-x-0 top-1/2 h-px bg-ink-100" />
              <span aria-hidden className="absolute inset-y-0 border-l border-dashed border-ink-300" style={{ left: "60%" }} />
              {r.scores.map((sc, k) => (
                <span
                  key={k}
                  aria-hidden
                  className="bar-rise absolute top-1/2 h-3.5 w-[2px] -translate-y-1/2 rounded-full bg-brand-600/45"
                  style={{ left: `${Math.min(99.6, sc * 10)}%`, animationDelay: `${i * 40}ms` }}
                />
              ))}
              {r.median !== null ? <span aria-hidden className="absolute inset-y-0 w-[3px] -translate-x-1/2 rounded-full bg-ink-900" style={{ left: `${r.median * 10}%` }} /> : null}
            </div>
            <p className="nums col-start-2 row-start-1 text-right text-lg font-medium text-ink-900 sm:col-start-3">
              {r.median === null ? <span className="text-sm text-text-subtle">—</span> : r.median.toFixed(1)}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

export type ScorePoint = { userId: string; score: number; cgpa: number };

const QUADS: { id: Quadrant; view: string; name: string; hint: string; dot: string; swatch: string }[] = [
  { id: "scoreBeatsCg", view: "score-beats-cg", name: "Score beats CGPA", hint: "Interview better than marks", dot: "fill-accent-500", swatch: "bg-accent-500" },
  { id: "stars", view: "stars", name: "Strong on both", hint: "Ready for any drive", dot: "fill-brand-700", swatch: "bg-brand-700" },
  { id: "support", view: "support", name: "Needs support", hint: "Low on both", dot: "fill-ink-300", swatch: "bg-ink-300" },
  { id: "cgBeatsScore", view: "cg-beats-score", name: "CGPA beats score", hint: "Marks better than interview", dot: "fill-ink-500", swatch: "bg-ink-500" },
];

/** A small, stable nudge so students on the same score and CGPA don't sit on one dot. */
function jitter(id: string, n: number) {
  let h = n;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return ((h >>> 0) % 1000) / 1000 - 0.5;
}

/**
 * Findtern score against CGPA, one dot per interviewed student, cut at the same lines Master data's ready-made views
 * use. The four groups under it carry the counts and open those views; the dots themselves are a picture, not links,
 * so a keyboard user tabs through four groups and not three hundred dots.
 */
export function ScoreVsCgpa({ points }: { points: ScorePoint[] }) {
  const W = 400, H = 240, L = 30, R = 8, T = 8, B = 26;
  const minCg = Math.max(0, Math.min(5, Math.floor(Math.min(...points.map((p) => p.cgpa)))));
  const x = (cg: number) => L + ((cg - minCg) / (10 - minCg)) * (W - L - R);
  const y = (sc: number) => T + (1 - sc / 10) * (H - T - B);
  const counts = Object.fromEntries(QUADS.map((q) => [q.id, 0])) as Record<Quadrant, number>;
  for (const p of points) counts[quadrantOf(p)!]++;
  const xTicks = Array.from({ length: 10 - minCg + 1 }, (_, i) => minCg + i).filter((v) => (10 - minCg > 6 ? v % 2 === 0 : true));
  const dot = (p: ScorePoint) => QUADS.find((q) => q.id === quadrantOf(p))!.dot;

  return (
    <div className="mt-4">
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
        <text x={L + 2} y={T + 10} className="fill-ink-600 text-[10px]">↑ Findtern score</text>
        {/* The cut lines of the four groups. */}
        <line x1={x(HIGH_CGPA)} x2={x(HIGH_CGPA)} y1={T} y2={H - B} className="stroke-ink-400" strokeDasharray="3 3" />
        <line x1={L} x2={W - R} y1={y(STRONG_SCORE)} y2={y(STRONG_SCORE)} className="stroke-ink-400" strokeDasharray="3 3" />
        <g aria-hidden>
          {points.map((p) => (
            <circle key={p.userId} cx={x(p.cgpa + jitter(p.userId, 7) * 0.08)} cy={y(p.score + jitter(p.userId, 13) * 0.08)} r={3.2} className={cn(dot(p), "opacity-80")} />
          ))}
        </g>
      </svg>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {QUADS.map((q) => (
          <li key={q.id}>
            <Link
              href={`/college/master-data?view=${q.view}`}
              className="flex h-full items-start gap-2.5 rounded-apple-sm border border-ink-200/80 px-3 py-2.5 transition-colors hover:border-ink-300 hover:bg-ink-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
            >
              <span aria-hidden className={cn("mt-1.5 size-2.5 shrink-0 rounded-full", q.swatch)} />
              <span className="min-w-0">
                <span className="flex items-baseline gap-1.5">
                  <span className="nums text-base font-semibold text-ink-900">{counts[q.id]}</span>
                  <span className="truncate text-sm font-medium text-ink-800">{q.name}</span>
                </span>
                <span className="block truncate text-xs text-text-subtle">{q.hint}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
