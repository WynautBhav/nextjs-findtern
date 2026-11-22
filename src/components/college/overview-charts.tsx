import type React from "react";
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

/** Biggest drop between two neighbouring stages: the finding the newer hero styles lead with. */
export function biggestDrop(stages: RibbonStage[]) {
  let at = 1;
  for (let i = 2; i < stages.length; i++) if (stages[i - 1].value - stages[i].value > stages[at - 1].value - stages[at].value) at = i;
  const lost = Math.max(0, (stages[at - 1]?.value ?? 0) - (stages[at]?.value ?? 0));
  return { at, lost, from: stages[at - 1]?.label ?? "", to: stages[at]?.label ?? "" };
}

export const FILL_TONE = ["bg-white/[0.13]", "bg-sky-300", "bg-data-on-dark", "bg-accent-400", "bg-rose-300"];

/**
 * Seats: the batch as an exam hall. One seat per student on the list (or per N students for a big college), filled with
 * the colour of the furthest stage that student has reached; an unfilled seat is a student who has not joined yet.
 * The legend under the hall is the stage list, each a link to its students.
 */
export function BatchSeats({ stages }: { stages: RibbonStage[] }) {
  const v = stages.map((s) => s.value);
  // Furthest stage reached: each stage minus the next, never below zero.
  const counts = v.map((x, i) => Math.max(0, x - (v[i + 1] ?? 0)));
  const total = counts.reduce((a, b) => a + b, 0);
  const per = total > 240 ? Math.ceil(total / 240) : 1;
  const seats: number[] = [];
  counts.forEach((c, i) => {
    for (let k = 0; k < Math.round(c / per); k++) seats.push(i);
  });
  seats.reverse(); // hired first, front row
  // Column count that leaves the back row as full as possible (no lone seat at the end).
  const fit = (lo: number, hi: number) => {
    let best = lo;
    let score = -1;
    for (let c = lo; c <= hi; c++) {
      const rem = seats.length % c;
      const sc = rem === 0 ? 1 : rem / c;
      if (sc > score) [best, score] = [c, sc];
    }
    return best;
  };
  const drop = biggestDrop(stages);
  return (
    <div className="mt-8 grid gap-x-10 gap-y-6 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
      <div className="min-w-0">
        <p className="nums text-[clamp(2.5rem,5vw,4rem)] font-light leading-none tracking-[-0.04em]">{drop.lost.toLocaleString("en-IN")}</p>
        <p className="mt-2 text-sm text-on-dark-subtle">
          students lost between <span className="whitespace-nowrap text-white">{drop.from}</span> and <span className="whitespace-nowrap text-white">{drop.to}</span>
        </p>
        <p className="mt-1 text-xs text-on-dark-subtle">Your biggest drop. Each seat is {per === 1 ? "one student" : `${per} students`}, front row hired.</p>
      </div>
      <div className="min-w-0">
        <ul
          aria-hidden
          style={{ "--cols": fit(9, 12), "--cols-lg": fit(18, 26) } as React.CSSProperties}
          className="grid grid-cols-[repeat(var(--cols),minmax(0,1fr))] gap-x-1.5 gap-y-2.5 sm:gap-x-2 sm:gap-y-3 lg:grid-cols-[repeat(var(--cols-lg),minmax(0,1fr))]"
        >
          {seats.map((stage, i) => (
            <li key={i} className={cn("seat-pop aspect-[5/6] rounded-t-[0.6rem] rounded-b-[0.2rem]", FILL_TONE[stage])} style={{ animationDelay: `${Math.min(i, 120) * 6}ms` }} />
          ))}
        </ul>
        <ol className="mt-6 flex flex-wrap gap-x-6 gap-y-3" aria-label="Your batch, step by step">
          {stages.map((s, i) => (
            <li key={s.label} className="relative">
              <Link href={s.href} className="flex items-baseline gap-2 rounded-md text-sm outline-none after:absolute after:-inset-1.5 after:rounded-lg after:content-[''] hover:after:bg-white/5 focus-visible:after:ring-2 focus-visible:after:ring-white/70">
                <span aria-hidden className={cn("size-2.5 self-center rounded-[3px]", FILL_TONE[i])} />
                <span className="text-on-dark-subtle">{s.label}</span>
                <span className="nums font-medium text-white">{s.value.toLocaleString("en-IN")}</span>
              </Link>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

/**
 * Steps: the batch as a staircase down from the list to a hire. Elevation by lightness alone: each step one tone lighter
 * than the one before, no borders, no shadows; colour only on the last step (the hire). The riser between two steps
 * carries the students lost there as a signed figure.
 */
export function BatchSteps({ stages }: { stages: RibbonStage[] }) {
  const top = stages[0]?.value ?? 0;
  const TONE = ["bg-white/[0.04]", "bg-white/[0.07]", "bg-white/[0.10]", "bg-white/[0.14]", "bg-accent-400 text-ink-900"];
  const drop = biggestDrop(stages);
  return (
    <div className="mt-8">
      <ol className="grid grid-cols-5 items-end gap-1.5 sm:gap-2" aria-label="Your batch, step by step">
        {stages.map((s, i) => {
          const h = top ? Math.max(14, Math.round((s.value / top) * 100)) : 14;
          const lost = i > 0 ? stages[i - 1].value - s.value : 0;
          const last = i === stages.length - 1;
          return (
            <li key={s.label} className="relative flex min-w-0 flex-col justify-end">
              {i > 0 ? (
                <span className={cn("nums mb-1.5 block text-xs", i === drop.at ? "font-semibold text-accent-300" : "text-on-dark-subtle")}>{lost > 0 ? `−${lost.toLocaleString("en-IN")}` : "±0"}</span>
              ) : (
                <span className="mb-1.5 block text-xs text-on-dark-subtle">&nbsp;</span>
              )}
              <Link
                href={s.href}
                style={{ height: `calc(${h} * 0.11rem + 4.5rem)` }}
                className={cn(
                  "step-rise flex min-w-0 flex-col justify-between rounded-t-xl p-3 outline-none transition-colors hover:brightness-110 focus-visible:ring-2 focus-visible:ring-white/70 sm:p-4",
                  TONE[i],
                  !last && "text-white",
                )}
              >
                <span className={cn("nums text-[clamp(1.5rem,3.4vw,2.75rem)] font-light leading-none tracking-[-0.04em]")}>{s.value.toLocaleString("en-IN")}</span>
                <span className={cn("text-[11px] font-medium leading-tight sm:text-[13px]", last ? "text-ink-900/80" : "text-on-dark-subtle")}>{s.label}</span>
              </Link>
            </li>
          );
        })}
      </ol>
      <p className="mt-3 text-xs text-on-dark-subtle">
        Gold figure: your biggest drop, <span className="nums text-on-dark">{drop.lost}</span> students between {drop.from} and {drop.to}.
      </p>
    </div>
  );
}

/**
 * Ledger: the batch read like a market screen. Tabular figures that stack, every change carries its sign in the text,
 * and the one selection (the biggest drop) is a 1px gold line exactly as wide as its label. The last column is what
 * moved in the last 24 hours; a dash where Findtern keeps no time for that step.
 */
export function BatchLedger({ stages, today }: { stages: RibbonStage[]; today: (string | null)[] }) {
  const top = stages[0]?.value ?? 0;
  const drop = biggestDrop(stages);
  return (
    <div className="mt-8 overflow-x-auto">
      <table className="nums w-full text-left text-sm sm:min-w-[34rem]">
        <caption className="sr-only">Your batch, step by step</caption>
        <thead>
          <tr className="text-xs text-on-dark-subtle">
            <th scope="col" className="pb-3 font-medium">Step</th>
            <th scope="col" className="pb-3 text-right font-medium">Students</th>
            <th scope="col" className="hidden pb-3 text-right font-medium sm:table-cell">Of list</th>
            <th scope="col" className="pb-3 text-right font-medium">Lost here</th>
            <th scope="col" className="hidden w-[34%] pb-3 pl-6 font-medium sm:table-cell"><span className="sr-only">Share</span></th>
            <th scope="col" className="pb-3 text-right font-medium">24 hours</th>
          </tr>
        </thead>
        <tbody>
          {stages.map((s, i) => {
            const share = top ? (s.value / top) * 100 : 0;
            const lost = i > 0 ? stages[i - 1].value - s.value : null;
            const sel = i === drop.at;
            return (
              <tr key={s.label} className="group">
                <th scope="row" className="py-2.5 pr-4 font-normal">
                  <Link href={s.href} className="relative inline-flex min-h-8 items-center text-on-dark outline-none hover:text-white focus-visible:ring-2 focus-visible:ring-white/70">
                    {s.label}
                    {sel ? <span aria-hidden className="absolute inset-x-0 bottom-0.5 h-px bg-accent-400" /> : null}
                    {sel ? <span className="sr-only"> (biggest drop)</span> : null}
                  </Link>
                </th>
                <td className="py-2.5 text-right text-[1.375rem] font-light tracking-[-0.02em] text-white">{s.value.toLocaleString("en-IN")}</td>
                <td className="hidden py-2.5 text-right text-on-dark-subtle sm:table-cell">{i === 0 ? "100%" : `${share.toFixed(share < 10 && share > 0 ? 1 : 0)}%`}</td>
                <td className={cn("py-2.5 text-right", sel ? "text-accent-300" : "text-on-dark-subtle")}>{lost === null ? "—" : lost > 0 ? `−${lost.toLocaleString("en-IN")}` : "±0"}</td>
                <td className="hidden py-2.5 pl-6 sm:table-cell">
                  <span aria-hidden className="block h-1.5 overflow-hidden rounded-full bg-white/10">
                    <span className={cn("bar-slide block h-full origin-left rounded-full", sel ? "bg-accent-400" : "bg-white/55")} style={{ width: `${Math.max(s.value ? 1.5 : 0, share)}%` }} />
                  </span>
                </td>
                <td className={cn("py-2.5 text-right", today[i] ? "text-data-on-dark" : "text-on-dark-subtle")}>{today[i] ?? "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
