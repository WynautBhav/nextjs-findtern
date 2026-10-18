"use client";

import { useEffect, useRef, useState } from "react";

import { useRegionBands } from "@/components/marketing/region-rates";
import { formatMoney, formatRate } from "@/lib/format";
import { prefersReducedMotion } from "@/lib/gsap";
import { useRevealFlag } from "@/lib/motion";
import { HOURS_PER_MONTH } from "@/lib/plan-offer";
import { BANDS, bandFor } from "@/lib/score";
import type { CmsPlan } from "@/lib/content/types";
import { cn } from "@/lib/utils";

/**
 * Where the money goes - the score as an instrument on the dark wash.
 *
 * The hero owns the site's strongest move: drag a Findtern Score and the
 * rate follows. Here that move answers the question a rate card raises.
 * One month, 160 hours. The band the score lands in sets the hourly rate;
 * what you pay splits into the two places it goes. The two destinations are
 * not drawn as a bar with a legend: they ARE the bar. Two panels share one
 * row, their widths proportional to the money in them, so the intern's
 * panel grows as the score climbs and shrinks to its floor on a free 2026
 * Espresso hire. Area is the argument.
 *
 * Motion: one authored entrance (the score rising from 0 to the default when
 * the instrument scrolls in); after that everything follows the hand, with
 * the panels re-proportioning on a 500ms expo curve. Reduced motion renders
 * the final state and lets the grid snap.
 */
const DEFAULT_SCORE = 7.2;
/** A panel never collapses past this share of the row, so its copy stays readable. */
const MIN_SHARE = 0.28;

export function WhereMoneyGoes({ plansInr, plansUsd }: { plansInr: CmsPlan[]; plansUsd: CmsPlan[] }) {
  const { isIndia, currency, bands } = useRegionBands();
  const plans = isIndia ? plansInr : plansUsd;

  const [score, setScore] = useState(DEFAULT_SCORE);
  const [dragging, setDragging] = useState(false);
  const { ref, revealed } = useRevealFlag<HTMLDivElement>({ threshold: 0.35 });
  const played = useRef(false);

  // The one entrance: 0 → default, once, when the instrument is in view.
  useEffect(() => {
    if (!revealed || played.current) return;
    played.current = true;
    if (prefersReducedMotion()) return;
    let raf = 0;
    const start = performance.now();
    const dur = 1000;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 4);
      setScore(Math.round(DEFAULT_SCORE * eased * 10) / 10);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [revealed]);

  const band = bandFor(score);
  const idx = Math.max(0, BANDS.findIndex((b) => b.id === band.id));
  const plan = plans[idx];
  const regionBand = bands[idx] ?? band;
  const planName = plan?.displayName ?? band.name;
  const rateMinor = plan?.priceHourlyMinor ?? regionBand.rateMinor;
  const wasMinor = plan?.compareAtHourlyMinor ?? null;
  const perHireMinor = plan?.perHireChargeMinor ?? regionBand.perHireMinor;
  const stipendMinor = rateMinor * HOURS_PER_MONTH;
  const totalMinor = stipendMinor + perHireMinor;
  const share = totalMinor > 0 ? stipendMinor / totalMinor : 0;
  const internCol = Math.max(MIN_SHARE, share);
  const findternCol = Math.max(MIN_SHARE, 1 - share);

  const shownTotal = useTween(totalMinor);
  const shownStipend = useTween(stipendMinor);
  const pct = Math.max(0, Math.min(100, (score / 10) * 100));
  const money = (minor: number) => formatMoney(minor, currency, { zeroLabel: false });

  return (
    <div ref={ref} className="mx-auto mt-14 max-w-5xl">
      {/* ── Score and rate ──────────────────────────────────────── */}
      <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-6">
        <div>
          <p className="text-sm text-on-dark-subtle">Findtern Score</p>
          <p className="mt-1 flex items-baseline gap-2 text-[clamp(4rem,9vw,6.5rem)] font-semibold leading-none tracking-[-0.045em] text-white tabular-nums">
            {score.toFixed(1)}
            <span className="text-2xl font-medium tracking-normal text-on-dark-subtle">/10</span>
          </p>
        </div>
        <div className="sm:text-right">
          <p className="text-sm text-on-dark-subtle">
            {planName} · {band.min}–{band.max}
          </p>
          <p className="mt-1 flex items-baseline gap-3 text-[clamp(2.25rem,4.5vw,3.5rem)] font-semibold leading-none tracking-[-0.035em] text-accent-300 tabular-nums sm:justify-end">
            {wasMinor && wasMinor > rateMinor ? (
              <del className="text-xl font-medium tracking-normal text-on-dark-subtle decoration-[1.5px]">
                <span className="sr-only">Was </span>
                {formatRate(wasMinor, currency)}
              </del>
            ) : null}
            {formatRate(rateMinor, currency)}
          </p>
        </div>
      </div>

      {/* ── The instrument ──────────────────────────────────────── */}
      <div className="mt-8">
        <div className="relative flex justify-between text-xs" aria-hidden>
          {BANDS.map((b, i) => (
            <button
              key={b.id}
              type="button"
              tabIndex={-1}
              onClick={() => setScore(b.min === 0 ? 3 : b.min === 6 ? 7.2 : 9)}
              style={{ flexGrow: b.max - b.min }}
              className={cn(
                "cursor-pointer pb-2.5 transition-colors duration-200",
                i === 0 ? "text-left" : i === BANDS.length - 1 ? "text-right" : "text-center",
                b.id === band.id ? "font-semibold text-white" : "text-on-dark-subtle hover:text-white",
              )}
            >
              {plans[i]?.displayName ?? b.name}
            </button>
          ))}
        </div>
        <div className="group relative h-10 w-full cursor-pointer select-none">
          <input
            type="range"
            min="0"
            max="10"
            step="0.1"
            value={score}
            onChange={(e) => setScore(Math.round(parseFloat(e.target.value) * 10) / 10)}
            onPointerDown={() => setDragging(true)}
            onPointerUp={() => setDragging(false)}
            onPointerCancel={() => setDragging(false)}
            aria-label="Findtern Score out of 10"
            aria-valuetext={`${score.toFixed(1)} out of 10, ${planName} band, ${formatRate(rateMinor, currency)}`}
            className="absolute inset-0 z-20 h-full w-full cursor-pointer opacity-0"
          />
          <div className="pointer-events-none absolute inset-x-0 top-1/2 flex -translate-y-1/2 gap-1.5" aria-hidden>
            {BANDS.map((b) => (
              <div
                key={b.id}
                style={{ flexGrow: b.max - b.min }}
                className={cn("h-3 rounded-full transition-colors duration-300", b.id === band.id ? "bg-white/25" : "bg-white/10")}
              />
            ))}
          </div>
          <div className="pointer-events-none absolute inset-x-0 top-1/2 h-3 -translate-y-1/2 overflow-hidden rounded-full" aria-hidden>
            <div
              className={cn("h-full rounded-full bg-accent", dragging ? "transition-none" : "transition-[width] duration-150 ease-out")}
              style={{ width: `${pct}%` }}
            />
          </div>
          <div
            aria-hidden
            className={cn(
              "pointer-events-none absolute top-1/2 size-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-brand-950 bg-accent shadow-[0_6px_18px_rgb(0_0_0/0.35)]",
              dragging ? "scale-125 transition-none" : "transition-[left,transform] duration-150 ease-out group-hover:scale-110",
            )}
            style={{ left: `${pct}%` }}
          />
        </div>
      </div>

      {/* ── The split ───────────────────────────────────────────── */}
      <div className="mt-12 flex flex-wrap items-baseline justify-between gap-x-8 gap-y-2">
        <p className="text-base text-on-dark-subtle">
          First month, {HOURS_PER_MONTH} hours. You pay
        </p>
        <p className="text-[clamp(2rem,4vw,3rem)] font-semibold leading-none tracking-[-0.03em] text-white tabular-nums" aria-live="polite">
          {money(shownTotal)}
        </p>
      </div>

      {/* Stacked on phones; proportional columns from md up. */}
      <div
        className="mt-5 grid grid-cols-1 gap-3 motion-safe:transition-[grid-template-columns] motion-safe:duration-500 motion-safe:ease-out-expo md:gap-4 md:[grid-template-columns:var(--split)]"
        style={{ "--split": `minmax(0, ${internCol}fr) minmax(0, ${findternCol}fr)` } as React.CSSProperties}
        role="group"
        aria-label={`${money(stipendMinor)} to the intern, ${money(perHireMinor)} to Findtern`}
      >
        <Panel
          tone="intern"
          title="To the intern"
          amount={money(shownStipend)}
          body={
            rateMinor > 0
              ? `Their stipend: ${formatRate(rateMinor, currency)} × ${HOURS_PER_MONTH} approved hours, paid out by Findtern.`
              : `Free through 2026: no hourly charge on an Espresso hire this year. From 2027, ${formatRate(wasMinor ?? 0, currency)} × ${HOURS_PER_MONTH} approved hours.`
          }
          share={share}
        />
        <Panel
          tone="findtern"
          title="To Findtern"
          amount={money(perHireMinor)}
          body="Once per hire: verification, the AI interview and tests, the score report, the engagement managed end to end."
          share={1 - share}
        />
      </div>

      <p className="mt-6 text-sm text-on-dark-subtle">
        No other charges. {isIndia ? "Prices include GST. " : ""}Take an intern on full time later and 8.33% of CTC applies then, not before.
      </p>
    </div>
  );
}

/**
 * One destination. The panel's width is the money; the share is also printed
 * so the proportion survives on a phone, where the two panels stack.
 */
function Panel({
  tone,
  title,
  amount,
  body,
  share,
}: {
  tone: "intern" | "findtern";
  title: string;
  amount: string;
  body: string;
  share: number;
}) {
  const intern = tone === "intern";
  return (
    <div
      className={cn(
        "min-w-0 rounded-2xl border p-5 sm:p-6",
        intern ? "border-accent/50 bg-accent/12" : "border-white/15 bg-white/[0.06]",
      )}
    >
      <div className="flex items-baseline justify-between gap-3">
        <p className={cn("truncate text-sm font-medium", intern ? "text-accent-300" : "text-on-dark")}>{title}</p>
        <p className="shrink-0 text-xs tabular-nums text-on-dark-subtle">{Math.round(share * 100)}%</p>
      </div>
      <p className="mt-3 text-[clamp(1.75rem,3.2vw,2.5rem)] font-semibold leading-none tracking-[-0.03em] text-white tabular-nums">
        {amount}
      </p>
      <p className="mt-4 text-sm leading-relaxed text-on-dark-subtle">{body}</p>
    </div>
  );
}

/** A number that glides to its target in ~320ms; immediate under reduced motion. */
function useTween(target: number): number {
  const [shown, setShown] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    const start = performance.now();
    const begin = from.current;
    const dur = prefersReducedMotion() ? 0 : 320;
    let raf = 0;
    const tick = (now: number) => {
      const t = dur === 0 ? 1 : Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      const v = begin + (target - begin) * eased;
      setShown(v);
      from.current = v;
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return Math.round(shown / 100) * 100;
}
