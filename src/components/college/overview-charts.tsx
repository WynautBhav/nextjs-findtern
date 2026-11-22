import Link from "next/link";

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

export type TopStudent = { userId: string; name: string; meta: string; score: number };

/** The students an employer will reach first: the highest scores in the batch. */
export function TopOfBatch({ students }: { students: TopStudent[] }) {
  return (
    <ol className="mt-2 divide-y divide-ink-100">
      {students.map((s, i) => (
        <li key={s.userId} className="relative flex items-center gap-3 py-3">
          <span className="nums w-4 shrink-0 text-sm font-medium text-text-subtle">{i + 1}</span>
          <span aria-hidden className={cn("grid size-9 shrink-0 place-items-center rounded-full text-xs font-semibold", avatarTint(s.userId))}>
            {s.name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("")}
          </span>
          <span className="min-w-0 flex-1">
            <Link href={`/college/students/${s.userId}`} className="block truncate text-sm font-medium text-ink-900 outline-none after:absolute after:inset-0 after:content-[''] hover:text-brand-700 focus-visible:after:rounded-lg focus-visible:after:ring-2 focus-visible:after:ring-brand-500">
              {s.name}
            </Link>
            <span className="block truncate text-xs text-text-subtle">{s.meta}</span>
          </span>
          <span className="nums shrink-0 text-right">
            <span className="text-lg font-semibold tracking-[-0.02em] text-ink-900">{s.score.toFixed(1)}</span>
            <span className="text-xs text-text-subtle"> /10</span>
          </span>
        </li>
      ))}
    </ol>
  );
}
