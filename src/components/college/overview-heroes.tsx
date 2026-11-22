import type React from "react";
import Link from "next/link";

import { cn } from "@/lib/utils";
import { biggestDrop, FILL_TONE, type RibbonStage } from "./overview-charts";

/**
 * Five more hero drawings for the placement office's Overview, each made from a thing of the campus itself.
 * All server-rendered from the same five funnel stages; positions come from a seeded jitter, never Math.random,
 * so a reload draws the same picture. Motion is CSS only, behind prefers-reduced-motion (globals.css).
 */

/** SVG fills matching FILL_TONE: not joined, verified, AI interview, offer, hired. */
const FILL = ["rgb(255 255 255 / 0.18)", "var(--color-sky-300)", "var(--color-data-on-dark)", "var(--color-accent-400)", "var(--color-rose-300)"];

/** Students by the furthest stage they reached: each stage minus the next, never below zero. */
function furthest(stages: RibbonStage[]) {
  const v = stages.map((s) => s.value);
  return v.map((x, i) => Math.max(0, x - (v[i + 1] ?? 0)));
}

/** Deterministic 0..1 jitter for index i (and a salt), so the drawing is stable across renders. */
function jitter(i: number, salt = 1) {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

const n = (v: number) => v.toLocaleString("en-IN");

/** The stage list every drawing shares: a dot in the stage colour, the label, the count, a link to the students. */
function StageLegend({ stages, className }: { stages: RibbonStage[]; className?: string }) {
  return (
    <ol className={cn("flex flex-wrap gap-x-6 gap-y-3", className)} aria-label="Your batch, step by step">
      {stages.map((s, i) => (
        <li key={s.label} className="relative">
          <Link
            href={s.href}
            className="flex items-baseline gap-2 rounded-md text-sm outline-none after:absolute after:-inset-1.5 after:rounded-lg after:content-[''] hover:after:bg-white/5 focus-visible:after:ring-2 focus-visible:after:ring-white/70"
          >
            <span aria-hidden className={cn("size-2.5 self-center rounded-full", FILL_TONE[i])} />
            <span className="text-on-dark-subtle">{s.label}</span>
            <span className="nums font-medium text-white">{n(s.value)}</span>
          </Link>
        </li>
      ))}
    </ol>
  );
}

function DropLine({ stages }: { stages: RibbonStage[] }) {
  const d = biggestDrop(stages);
  return (
    <p className="text-sm text-on-dark-subtle">
      Biggest drop: <span className="nums font-medium text-accent-300">{n(d.lost)}</span> students between <span className="text-white">{d.from}</span> and{" "}
      <span className="text-white">{d.to}</span>.
    </p>
  );
}

/**
 * Caps: the batch throws its caps. Every student is a mortarboard; the further they got, the higher it flies.
 * Hired caps are at the top of the sky, students not joined yet still hold theirs on the ground.
 */
export function BatchCaps({ stages }: { stages: RibbonStage[] }) {
  const counts = furthest(stages);
  const total = counts.reduce((a, b) => a + b, 0);
  const per = total > 160 ? Math.ceil(total / 160) : 1;
  const W = 1000;
  const H = 300;
  const caps: { x: number; y: number; r: number; stage: number; i: number }[] = [];
  let k = 0;
  counts.forEach((c, stage) => {
    const m = Math.round(c / per);
    const band = H - 34 - stage * ((H - 70) / 4); // ground for stage 0, sky for hired
    for (let j = 0; j < m; j++, k++) {
      caps.push({
        x: 30 + ((j + 0.5) / Math.max(m, 1)) * (W - 60) + (jitter(k, 2) - 0.5) * Math.min(60, (W - 60) / Math.max(m, 1)),
        y: band + (jitter(k, 3) - 0.5) * 34,
        r: (jitter(k, 4) - 0.5) * 50,
        stage,
        i: k,
      });
    }
  });
  return (
    <div className="mt-6">
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img" aria-label={`Every student as a graduation cap, higher the further they got: ${stages.map((s) => `${s.label} ${s.value}`).join(", ")}`}>
        {caps.map((c) => (
          <g key={c.i} transform={`translate(${c.x.toFixed(1)} ${c.y.toFixed(1)}) rotate(${c.r.toFixed(1)})`}>
            <g className="cap-fly" style={{ animationDelay: `${Math.min(c.i, 90) * 9}ms`, ["--fly" as string]: `${40 + c.stage * 30}px` } as React.CSSProperties}>
              <path d="M-16 0 L0 -8 L16 0 L0 8 Z" fill={FILL[c.stage]} />
              <path d="M-9 3.5 V9 Q0 14 9 9 V3.5 L0 8 Z" fill={FILL[c.stage]} opacity="0.75" />
              {c.stage === 4 ? <path d="M10 1 V12" stroke="var(--color-rose-300)" strokeWidth="1.5" /> : null}
            </g>
          </g>
        ))}
      </svg>
      <div className="mt-4 flex flex-wrap items-baseline justify-between gap-x-8 gap-y-3">
        <StageLegend stages={stages} />
        <p className="text-xs text-on-dark-subtle">{per === 1 ? "One cap, one student." : `One cap, ${per} students.`} Highest: hired. On the ground: not joined.</p>
      </div>
    </div>
  );
}

/**
 * Departures: the season as a split-flap board, from the college to a hire. Each count is set in flap tiles that
 * turn over on arrival; the gate with the biggest drop is the one marked for attention.
 */
export function BatchDepartures({ stages, college }: { stages: RibbonStage[]; college: string }) {
  const d = biggestDrop(stages);
  const width = Math.max(3, String(stages[0]?.value ?? 0).length);
  return (
    <div className="mt-8 rounded-2xl bg-black/25 p-4 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <p className="text-lg font-medium text-white">Departures</p>
        <p className="text-sm text-on-dark-subtle">
          {college} <span aria-hidden>→</span><span className="sr-only">to</span> Hired
        </p>
      </div>
      <table className="nums mt-4 w-full text-left">
        <caption className="sr-only">Your batch, step by step</caption>
        <thead>
          <tr className="text-xs text-on-dark-subtle">
            <th scope="col" className="pb-2 font-medium">Gate</th>
            <th scope="col" className="pb-2 font-medium">Students</th>
            <th scope="col" className="hidden pb-2 text-right font-medium sm:table-cell">Left behind</th>
            <th scope="col" className="pb-2 text-right font-medium">Remark</th>
          </tr>
        </thead>
        <tbody>
          {stages.map((s, i) => {
            const lost = i > 0 ? stages[i - 1].value - s.value : 0;
            const digits = String(s.value).padStart(width, " ").split("");
            return (
              <tr key={s.label}>
                <th scope="row" className="py-1.5 pr-3 font-normal">
                  <Link href={s.href} className="inline-flex min-h-9 items-center gap-2 text-sm text-on-dark outline-none hover:text-white focus-visible:ring-2 focus-visible:ring-white/70 sm:text-base">
                    <span aria-hidden className={cn("size-2 rounded-full", FILL_TONE[i])} />
                    {s.label}
                  </Link>
                </th>
                <td className="py-1.5">
                  <span className="inline-flex gap-1" aria-label={String(s.value)}>
                    {digits.map((ch, j) => (
                      <span key={j} aria-hidden className="relative grid h-9 w-6 place-items-center overflow-hidden rounded-[5px] sm:h-11 sm:w-8">
                        <span className="absolute inset-x-0 top-0 h-1/2 bg-white/[0.11]" />
                        <span className="absolute inset-x-0 bottom-0 h-[calc(50%-1px)] bg-white/[0.07]" />
                        <span className="flap relative text-xl font-light text-white sm:text-2xl" style={{ animationDelay: `${i * 140 + j * 70}ms` }}>
                          {ch.trim() ? ch : " "}
                        </span>
                      </span>
                    ))}
                  </span>
                </td>
                <td className="hidden py-1.5 text-right text-sm text-on-dark-subtle sm:table-cell">{i === 0 ? "—" : lost > 0 ? `−${n(lost)}` : "±0"}</td>
                <td className="py-1.5 text-right text-sm">
                  {i === d.at && d.lost > 0 ? (
                    <span className="font-medium text-accent-300">Biggest drop</span>
                  ) : i === stages.length - 1 ? (
                    <span className="text-rose-300">{s.value ? "Arrived" : "None yet"}</span>
                  ) : (
                    <span className="text-on-dark-subtle">{stages[0]?.value ? `${Math.round((s.value / stages[0].value) * 100)}%` : "—"}</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Orbit: Hired is the gold core; every other student is a dot circling it, on the orbit of the furthest step they
 * reached. The closer the orbit, the nearer that student is to a hire. Each orbit turns at its own slow speed.
 */
export function BatchOrbit({ stages }: { stages: RibbonStage[] }) {
  const counts = furthest(stages);
  const S = 360;
  const c = S / 2;
  const hired = stages[stages.length - 1];
  const orbits = [0, 1, 2, 3].map((stage) => ({ stage, r: 168 - stage * 30, count: counts[stage] }));
  // An orbit seats about one dot per 12 units of its length.
  const per = Math.max(1, Math.ceil(Math.max(...orbits.map((o) => o.count / ((2 * Math.PI * o.r) / 12)))));
  return (
    <div className="mt-8 grid items-center gap-x-12 gap-y-8 lg:grid-cols-[auto_minmax(0,1fr)]">
      <figure className="mx-auto w-full max-w-[18rem] lg:w-[22rem] lg:max-w-none">
        <svg viewBox={`0 0 ${S} ${S}`} className="block w-full" role="img" aria-label={`Students orbiting Hired, closer the further they got: ${stages.map((s) => `${s.label} ${s.value}`).join(", ")}`}>
          {orbits.map((o) => {
            const m = Math.round(o.count / per);
            return (
              <g key={o.stage}>
                <circle cx={c} cy={c} r={o.r} fill="none" stroke="white" strokeOpacity="0.08" />
                <g className="orbit-spin" style={{ transformOrigin: `${c}px ${c}px`, animationDuration: `${60 + o.stage * 25}s`, animationDirection: o.stage % 2 ? "reverse" : "normal" }}>
                  {Array.from({ length: m }, (_, j) => {
                    const a = (j / Math.max(m, 1)) * Math.PI * 2 + o.stage;
                    return <circle key={j} cx={c + o.r * Math.cos(a)} cy={c + o.r * Math.sin(a)} r={o.stage === 3 ? 6 : 4.5} fill={FILL[o.stage]} />;
                  })}
                </g>
              </g>
            );
          })}
          <circle cx={c} cy={c} r="52" fill="var(--color-accent-400)" className="core-pulse" />
          <text x={c} y={c + 4} textAnchor="middle" className="nums" fontSize="40" fontWeight="300" fill="var(--color-ink-900)">
            {n(hired.value)}
          </text>
          <text x={c} y={c + 26} textAnchor="middle" fontSize="12" fontWeight="500" fill="var(--color-ink-900)" opacity="0.75">
            Hired
          </text>
        </svg>
      </figure>
      <div className="min-w-0">
        <ol className="grid grid-cols-2 gap-x-8 gap-y-6" aria-label="Where each student is now">
          {[3, 2, 1, 0].map((stage) => (
            <li key={stage} className="relative min-w-0">
              <Link href={stages[stage].href} className="block rounded-lg outline-none after:absolute after:-inset-2 after:rounded-xl after:content-[''] hover:after:bg-white/5 focus-visible:after:ring-2 focus-visible:after:ring-white/70">
                <span className="flex items-center gap-2 text-[13px] font-medium text-on-dark-subtle">
                  <span aria-hidden className={cn("size-2 rounded-full", FILL_TONE[stage])} />
                  {["Not joined yet", "Verified, no interview", "Interviewed, no offer", "Offer, not hired"][stage]}
                </span>
                <span className="nums mt-1.5 block text-[clamp(2rem,3.4vw,2.75rem)] font-light leading-none tracking-[-0.04em]">{n(counts[stage])}</span>
              </Link>
            </li>
          ))}
        </ol>
        <div className="mt-6">
          <DropLine stages={stages} />
          <p className="mt-1 text-xs text-on-dark-subtle">{per === 1 ? "One dot, one student." : `One dot, ${per} students.`} Inner orbit is nearest to a hire.</p>
        </div>
      </div>
    </div>
  );
}

/**
 * Report card: the batch as the marksheet a placement office would print. Each step is a subject, the list is the
 * maximum marks, the students who reached it are the marks obtained. The biggest drop gets the rubber stamp.
 */
export function BatchReportCard({ stages, college, asOf }: { stages: RibbonStage[]; college: string; asOf: string }) {
  const top = stages[0]?.value ?? 0;
  const d = biggestDrop(stages);
  return (
    <div className="mt-8 flex justify-center">
      {/* taste-skill-ignore: the sheet is a physical paper lying tilted on the desk; its shadow is what makes it read as one. */}
      <div className="paper-in relative w-full max-w-3xl rotate-[-0.6deg] rounded-md bg-white p-5 pb-24 text-ink-900 shadow-[0_18px_40px_-18px_rgb(0_0_0/0.55)] sm:p-8 sm:pb-24">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
          <p className="text-lg font-semibold tracking-[-0.02em]">Placement report</p>
          <p className="nums text-sm text-ink-600">{asOf}</p>
        </div>
        <p className="text-sm text-ink-600">{college}</p>
        <table className="nums mt-5 w-full text-left text-sm">
          <caption className="sr-only">Your batch, step by step, as marks out of your list</caption>
          <thead>
            <tr className="bg-brand-700 text-xs text-white">
              <th scope="col" className="rounded-l-md px-3 py-2 font-medium">Step</th>
              <th scope="col" className="hidden px-3 py-2 text-right font-medium sm:table-cell">Out of</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Students</th>
              <th scope="col" className="rounded-r-md px-3 py-2 text-right font-medium">Per cent</th>
            </tr>
          </thead>
          <tbody>
            {stages.map((s, i) => (
              <tr key={s.label} className={i % 2 ? "bg-ink-50" : undefined}>
                <th scope="row" className="px-3 py-2.5 font-normal">
                  <Link href={s.href} className="font-medium text-ink-900 underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-brand-500">
                    {s.label}
                  </Link>
                </th>
                <td className="hidden px-3 py-2.5 text-right text-ink-600 sm:table-cell">{n(top)}</td>
                <td className="px-3 py-2.5 text-right text-base font-semibold">{n(s.value)}</td>
                <td className="px-3 py-2.5 text-right text-ink-600">{top ? `${Math.round((s.value / top) * 100)}%` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-5 text-xs text-ink-600">Issued by Findtern from your live student records.</p>
        {d.lost > 0 ? (
          <div
            aria-label={`Stamp: ${d.lost} students lost before ${d.to}`}
            className="stamp-in pointer-events-none absolute bottom-4 right-5 rotate-[-7deg] rounded-xl border-[3px] border-accent-700/80 bg-white/70 px-4 py-2 text-center text-accent-700/90 sm:bottom-5 sm:right-10"
          >
            <p className="nums text-2xl font-bold leading-none">{n(d.lost)} lost</p>
            <p className="mt-1 text-[11px] font-semibold">before {d.to}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Campus walk: the season as a walk across campus, from the gate to the joining desk. Every student is a dot standing
 * at the building where they stopped; the path between buildings marches toward a hire.
 */
export function BatchCampusWalk({ stages }: { stages: RibbonStage[] }) {
  const counts = furthest(stages);
  const W = 1000;
  const H = 250;
  const xs = [100, 300, 500, 700, 900];
  const ground = 200;
  const per = Math.max(1, Math.ceil(Math.max(...counts) / 60));
  const PLACES = ["Gate", "Admin block", "Exam hall", "Interview room", "Joining desk"];
  const path = `M20,${ground + 22} ` + xs.map((x, i) => `${i === 0 ? "L" : "S"}${x - 60},${ground + (i % 2 ? 34 : 14)} ${x},${ground + 22}`).join(" ") + ` L${W - 20},${ground + 22}`;
  return (
    <div className="mt-6">
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img" aria-label={`Students standing at the building where they stopped: ${PLACES.map((p, i) => `${p} ${counts[i]}`).join(", ")}`}>
        <path d={path} fill="none" stroke="var(--color-accent-300)" strokeOpacity="0.5" strokeWidth="2.5" strokeDasharray="2 10" strokeLinecap="round" className="walk-march" />
        {xs.map((x, i) => {
          const m = Math.round(counts[i] / per);
          const cols = 6;
          return (
            <g key={i}>
              {/* The building: a block with a roof, one tone step lighter the further along the walk. */}
              <path d={`M${x - 34},${ground} V${ground - 30} L${x},${ground - 52} L${x + 34},${ground - 30} V${ground} Z`} fill="white" fillOpacity={0.06 + i * 0.025} />
              <rect x={x - 7} y={ground - 18} width="14" height="18" rx="2" fill={FILL[i]} opacity={i === 0 ? 0.6 : 0.9} />
              {Array.from({ length: m }, (_, j) => {
                const col = j % cols;
                const row = Math.floor(j / cols);
                return (
                  <circle
                    key={j}
                    cx={x - 30 + col * 12 + (row % 2) * 6}
                    cy={ground - 62 - row * 12}
                    r="4.5"
                    fill={FILL[i]}
                    className="dot-drop"
                    style={{ animationDelay: `${i * 120 + j * 12}ms` }}
                  />
                );
              })}
            </g>
          );
        })}
      </svg>
      <ol className="mt-2 grid grid-cols-5 gap-2 text-center" aria-label="Your batch, step by step">
        {stages.map((s, i) => (
          <li key={s.label} className="relative min-w-0">
            <Link href={s.href} className="block rounded-lg px-1 py-1 outline-none hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-white/70">
              <span className="block truncate text-[11px] font-medium text-on-dark sm:text-[13px]">{PLACES[i]}</span>
              <span className="nums block text-lg font-light leading-tight text-white sm:text-2xl">{n(counts[i])}</span>
              <span className="hidden truncate text-[11px] text-on-dark-subtle sm:block">{["not joined yet", "verified only", "interviewed", "have an offer", "hired"][i]}</span>
            </Link>
          </li>
        ))}
      </ol>
      <div className="mt-4">
        <DropLine stages={stages} />
      </div>
    </div>
  );
}
