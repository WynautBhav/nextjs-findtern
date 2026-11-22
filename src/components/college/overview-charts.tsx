import Link from "next/link";

import { COFFEE, coffeeOf } from "@/lib/college/overview-modes";
import { avatarTint } from "@/components/app/avatar-helpers";
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
          { label: COFFEE[0].name, range: COFFEE[0].range, n: below, dot: "bg-brand-200" },
          { label: COFFEE[1].name, range: COFFEE[1].range, n: mid, dot: "bg-brand-500" },
          { label: COFFEE[2].name, range: COFFEE[2].range, n: high, dot: "bg-brand-800" },
        ].map((b) => (
          <div key={b.label} className="min-w-0">
            <dt className="flex flex-wrap items-center gap-x-1.5 text-xs">
              <span aria-hidden className={cn("size-2 shrink-0 rounded-full", b.dot)} />
              <span className="font-medium text-ink-800">{b.label}</span>
              <span className="text-text-subtle">{b.range}</span>
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

export type TopStudent = { userId: string; name: string; meta: string; score: number; cgpa: number | null };

/**
 * The batch's highest Findtern scores, each with the band employers see and the CGPA beside it, so a strong interview
 * from a modest CGPA is visible here too. Each row opens the student.
 */
export function TopStudents({ students }: { students: TopStudent[] }) {
  return (
    <ol className="mt-3 divide-y divide-ink-100">
      {students.map((s, i) => {
        const band = COFFEE.find((c) => c.key === coffeeOf(s.score))!;
        return (
          <li key={s.userId} className="group relative flex items-center gap-3 py-2.5">
            <span className="nums w-5 shrink-0 text-sm text-text-subtle">{i + 1}</span>
            <span aria-hidden className={cn("grid size-9 shrink-0 place-items-center rounded-full text-xs font-semibold", avatarTint(s.userId))}>
              {s.name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("")}
            </span>
            <span className="min-w-0 flex-1">
              <Link
                href={`/college/students/${s.userId}`}
                className="block truncate text-sm font-medium text-ink-900 outline-none after:absolute after:inset-0 after:content-[''] group-hover:underline group-hover:underline-offset-4 focus-visible:after:rounded-lg focus-visible:after:ring-2 focus-visible:after:ring-brand-500"
              >
                {s.name}
              </Link>
              <span className="block truncate text-xs text-text-subtle">{s.meta}</span>
            </span>
            <span className="hidden shrink-0 rounded-full border border-ink-200 px-2 py-0.5 text-xs text-ink-700 sm:inline">{band.name}</span>
            <span className="nums w-14 shrink-0 text-right text-xs text-text-subtle">CGPA <span className="text-ink-800">{s.cgpa?.toFixed(1) ?? "—"}</span></span>
            <span className="nums w-10 shrink-0 text-right text-lg font-medium text-ink-900">{s.score.toFixed(1)}</span>
          </li>
        );
      })}
    </ol>
  );
}
