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
  const tone = (i: number) => (i >= 16 ? "bg-accent-500" : i >= 12 ? "bg-brand-600" : "bg-ink-300");
  return (
    <div>
      <div
        role="img"
        aria-label={`Findtern scores of ${scores.length} interviewed students. ${below} below 6, ${mid} from 6 to 8, ${high} at 8 or above.${median !== null ? ` Median ${median.toFixed(1)}.` : ""}`}
        className="relative mt-5 h-40"
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
          { label: "Below 6", n: below, dot: "bg-ink-300" },
          { label: "6 to 8", n: mid, dot: "bg-brand-600" },
          { label: "8 and above", n: high, dot: "bg-accent-500" },
        ].map((b) => (
          <div key={b.label} className="min-w-0">
            <dt className="flex items-center gap-1.5 text-xs text-text-subtle">
              <span aria-hidden className={cn("size-2 shrink-0 rounded-full", b.dot)} />
              {b.label}
            </dt>
            <dd className="nums mt-0.5 text-xl font-semibold tracking-[-0.02em] text-ink-900">{b.n}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export type BranchRow = { branch: string; students: number; interviewed: number; avg: number | null };

/** Branch by branch: how many students, how many have interviewed (the filled part), and the average score. */
export function BranchBoard({ rows }: { rows: BranchRow[] }) {
  const most = Math.max(1, ...rows.map((r) => r.students));
  return (
    <ul className="space-y-3.5">
      {rows.map((r, i) => (
        <li key={r.branch} className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-x-4 gap-y-1.5">
          <span className="truncate text-sm font-medium text-ink-900">{r.branch}</span>
          <span className="nums text-sm text-ink-700">
            {r.avg === null ? <span className="text-text-subtle">no scores yet</span> : <><span className="font-semibold text-ink-900">{r.avg.toFixed(1)}</span> avg</>}
          </span>
          <span
            className="col-span-2 block h-2.5 overflow-hidden rounded-full bg-ink-100"
            role="img"
            aria-label={`${r.branch}: ${r.interviewed} of ${r.students} students interviewed`}
          >
            <span className="block h-full rounded-full bg-brand-100" style={{ width: `${(r.students / most) * 100}%` }}>
              <span className="bar-slide block h-full origin-left rounded-full bg-brand-600" style={{ width: `${r.students ? (r.interviewed / r.students) * 100 : 0}%`, animationDelay: `${i * 60}ms` }} />
            </span>
          </span>
          <span className="nums col-span-2 text-xs text-text-subtle">
            {r.interviewed} of {r.students} interviewed
          </span>
        </li>
      ))}
    </ul>
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
      <ul className="mt-3 grid grid-cols-2 gap-2">
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
