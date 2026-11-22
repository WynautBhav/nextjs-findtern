import Link from "next/link";

import { avatarTint } from "@/components/app/avatar-helpers";
import { cn } from "@/lib/utils";

/**
 * The drawings on the placement office's Overview. All server-rendered from the college's own students: no
 * chart library, no client state. Motion is CSS only and sits behind prefers-reduced-motion (globals.css).
 */

export type RibbonStage = { label: string; value: number; hint: string; href: string };

/**
 * The batch as one ribbon that narrows from the college's list to an offer. Each stage's height is its share of
 * the first, so the step down between two stages IS the drop-off; the percentage under each figure says it in words.
 * On a phone the ribbon gives way to one bar per stage (a 390px ribbon is four slivers).
 */
export function BatchRibbon({ stages }: { stages: RibbonStage[] }) {
  const top = stages[0]?.value ?? 0;
  const W = 1000;
  const H = 120;
  const seg = W / stages.length;
  const ys = stages.map((s) => H - (top ? Math.max(s.value ? 8 : 2, (s.value / top) * (H - 6)) : 2));
  const flat = seg * 0.62;
  let edge = `M0,${ys[0]} H${flat}`;
  for (let i = 1; i < stages.length; i++) {
    const x0 = seg * (i - 1) + flat;
    const x1 = seg * i;
    const mid = (x0 + x1) / 2;
    edge += ` C${mid},${ys[i - 1]} ${mid},${ys[i]} ${x1},${ys[i]} H${i === stages.length - 1 ? W : x1 + flat}`;
  }
  return (
    <div className="mt-8">
      <ol className={`grid grid-cols-2 gap-x-6 gap-y-6 ${stages.length === 5 ? "sm:grid-cols-3 lg:grid-cols-5" : "lg:grid-cols-4"}`} aria-label="Your batch, step by step">
        {stages.map((s, i) => {
          const share = top ? Math.round((s.value / top) * 100) : 0;
          return (
            <li key={s.label} className="relative min-w-0">
              <Link
                href={s.href}
                className="block rounded-lg outline-none after:absolute after:-inset-2 after:rounded-xl after:content-[''] hover:after:bg-white/5 focus-visible:after:ring-2 focus-visible:after:ring-white/70"
              >
                <span className="block text-[13px] font-medium text-on-dark-subtle">{s.label}</span>
                <span className="mt-1.5 flex items-baseline gap-2.5">
                  <span className="nums text-[clamp(2.25rem,4.4vw,3.5rem)] font-light leading-none tracking-[-0.04em]">{s.value.toLocaleString("en-IN")}</span>
                  {i > 0 && top ? <span className="nums rounded-full bg-white/10 px-2 py-0.5 text-xs font-medium text-accent-300">{share}%</span> : null}
                </span>
                {/* Phone: one bar per stage. */}
                <span aria-hidden className="mt-3 block h-1 overflow-hidden rounded-full bg-white/15 lg:hidden">
                  <span className="block h-full rounded-full bg-accent-400" style={{ width: `${Math.max(s.value ? 3 : 0, share)}%` }} />
                </span>
                <span className="mt-2 block text-xs text-on-dark-subtle">{s.hint}</span>
              </Link>
            </li>
          );
        })}
      </ol>
      {/* Bleeds to the panel's left, right and bottom edges, so the ribbon reads as the floor of the hero. */}
      <div className="-mx-6 -mb-6 mt-5 hidden sm:-mx-8 sm:-mb-8 lg:block">
      <svg aria-hidden viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="ribbon-reveal block h-24 w-full">
        <defs>
          <linearGradient id="ribbon-fill" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" style={{ stopColor: "var(--color-accent-400)", stopOpacity: 0.55 }} />
            <stop offset="1" style={{ stopColor: "var(--color-accent-300)", stopOpacity: 0.2 }} />
          </linearGradient>
        </defs>
        <path d={`${edge} V${H} H0 Z`} fill="url(#ribbon-fill)" />
        <path d={edge} fill="none" className="stroke-accent-300" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        {stages.slice(1).map((_, i) => (
          <line key={i} x1={seg * (i + 1)} x2={seg * (i + 1)} y1="0" y2={H} stroke="white" strokeOpacity="0.14" strokeDasharray="3 5" vectorEffect="non-scaling-stroke" />
        ))}
      </svg>
      </div>
    </div>
  );
}

/** One colour per stage, outside in, each readable on the dark green: list, verified, AI interview, offer, hired. */
const RING_TONE = ["stroke-slate-300", "stroke-sky-300", "stroke-data-on-dark", "stroke-accent-400", "stroke-rose-300"];
const DOT_TONE = ["bg-slate-300", "bg-sky-300", "bg-data-on-dark", "bg-accent-400", "bg-rose-300"];

/**
 * The batch as concentric rings, one per stage, outside in. Each ring closes as far as that stage's share of the
 * list, so the gap a ring leaves IS the drop-off. The centre carries the last stage (Hired) as the headline.
 * The four earlier stages sit two either side on a wide screen and below the rings on a phone.
 */
export function BatchRings({ stages }: { stages: RibbonStage[] }) {
  const top = stages[0]?.value ?? 0;
  const S = 320;
  const STROKE = 13;
  const GAP = 7;
  const last = stages[stages.length - 1];
  const share = (v: number) => (top ? Math.round((v / top) * 100) : 0);
  const side = stages.slice(0, -1);
  const item = (s: RibbonStage, i: number, end = false) => (
    <li key={s.label} className="relative min-w-0">
      <Link
        href={s.href}
        className="block rounded-lg outline-none after:absolute after:-inset-2 after:rounded-xl after:content-[''] hover:after:bg-white/5 focus-visible:after:ring-2 focus-visible:after:ring-white/70"
      >
        <span className={cn("flex items-center gap-2 text-[13px] font-medium text-on-dark-subtle", end && "lg:flex-row-reverse")}>
          <span aria-hidden className={cn("size-2 rounded-full", DOT_TONE[i])} />
          {s.label}
        </span>
        <span className={cn("mt-1.5 flex items-baseline gap-2.5", end && "lg:flex-row-reverse")}>
          <span className="nums text-[clamp(2rem,3.6vw,3rem)] font-light leading-none tracking-[-0.04em]">{s.value.toLocaleString("en-IN")}</span>
          {i > 0 && top ? <span className="nums rounded-full bg-white/10 px-2 py-0.5 text-xs font-medium text-accent-300">{share(s.value)}%</span> : null}
        </span>
        <span className="mt-2 block text-xs text-on-dark-subtle">{s.hint}</span>
      </Link>
    </li>
  );
  return (
    <div className="mt-8 grid items-center gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
      <ol className="order-2 grid grid-cols-2 gap-6 lg:order-1 lg:grid-cols-1 lg:text-right" aria-label="Your batch, step by step">
        {side.slice(0, 2).map((s, i) => item(s, i, true))}
      </ol>
      <figure className="order-1 mx-auto w-full max-w-[13.5rem] lg:order-2 lg:w-[20rem] lg:max-w-none">
        <div className="relative">
          <svg viewBox={`0 0 ${S} ${S}`} className="block w-full -rotate-90" role="img" aria-label={stages.map((s) => `${s.label} ${s.value}`).join(", ")}>
            {stages.map((s, i) => {
              const r = S / 2 - STROKE / 2 - i * (STROKE + GAP);
              const c = 2 * Math.PI * r;
              const f = top ? Math.min(1, s.value / top) : 0;
              return (
                <g key={s.label}>
                  <circle cx={S / 2} cy={S / 2} r={r} fill="none" strokeWidth={STROKE} className="stroke-white/[0.07]" />
                  {f > 0 ? (
                    <circle
                      cx={S / 2}
                      cy={S / 2}
                      r={r}
                      fill="none"
                      strokeWidth={STROKE}
                      strokeLinecap="round"
                      className={cn("ring-draw", RING_TONE[i])}
                      style={{ strokeDasharray: `${Math.max(f * c, 0.5)} ${c}`, animationDelay: `${120 + i * 90}ms` }}
                    />
                  ) : null}
                </g>
              );
            })}
          </svg>
          <Link
            href={last.href}
            className="absolute inset-0 m-auto flex size-[42%] flex-col items-center justify-center rounded-full text-center outline-none hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-white/70"
          >
            <span className="nums text-[clamp(2.5rem,5vw,3.75rem)] font-light leading-none tracking-[-0.04em]">{last.value.toLocaleString("en-IN")}</span>
            <span className="mt-1 flex items-center gap-1.5 text-[13px] font-medium text-on-dark">
              <span aria-hidden className={cn("size-2 rounded-full", DOT_TONE[stages.length - 1])} />
              {last.label}
            </span>
            <span className="nums text-xs text-on-dark-subtle">{share(last.value)}% of your list</span>
          </Link>
        </div>
      </figure>
      <ol className="order-3 grid grid-cols-2 gap-6 lg:grid-cols-1" aria-label="Your batch, continued">
        {side.slice(2).map((s, i) => item(s, i + 2))}
      </ol>
    </div>
  );
}

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
