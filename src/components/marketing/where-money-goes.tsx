"use client";

import { useEffect, useRef, useState } from "react";

import { PlanPrice } from "@/components/marketing/plan-price";
import { useRegionBands } from "@/components/marketing/region-rates";
import { formatMoney, formatRate } from "@/lib/format";
import { prefersReducedMotion } from "@/lib/gsap";
import { useRevealFlag } from "@/lib/motion";
import { HOURS_PER_MONTH } from "@/lib/plan-offer";
import { BANDS, bandFor } from "@/lib/score";
import type { CmsPlan } from "@/lib/content/types";
import { cn } from "@/lib/utils";

/**
 * Where the money goes - the score slider, carried to the pricing page.
 *
 * The hero already owns the site's strongest move: drag a Findtern Score and
 * the rate follows. This section reuses that motif at full strength to
 * answer the question a rate card raises. One month, 160 hours: the band the
 * score lands in sets the hourly rate, and the bar underneath splits what
 * you pay into the two places it goes - the intern's stipend and the one
 * per-hire charge. Move the score and both numbers move with it, so the
 * reader sees the model instead of reading about it.
 *
 * Motion: one authored entrance (the score rising from 0 to the default
 * when the card scrolls in), then everything follows the hand. Reduced
 * motion skips the entrance and renders the final state.
 */
const DEFAULT_SCORE = 7.2;

export function WhereMoneyGoes({ plansInr, plansUsd }: { plansInr: CmsPlan[]; plansUsd: CmsPlan[] }) {
  const { isIndia, currency, bands } = useRegionBands();
  const plans = isIndia ? plansInr : plansUsd;

  const [score, setScore] = useState(DEFAULT_SCORE);
  const [dragging, setDragging] = useState(false);
  const { ref, revealed } = useRevealFlag<HTMLDivElement>({ threshold: 0.4 });
  const played = useRef(false);

  // The one entrance: 0 → default, once, when the card is in view.
  useEffect(() => {
    if (!revealed || played.current) return;
    played.current = true;
    if (prefersReducedMotion()) return;
    let raf = 0;
    const start = performance.now();
    const dur = 900;
    // The first frame lands on 0, so no state is set synchronously here.
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
  const rateMinor = plan?.priceHourlyMinor ?? regionBand.rateMinor;
  const wasMinor = plan?.compareAtHourlyMinor ?? null;
  const perHireMinor = plan?.perHireChargeMinor ?? regionBand.perHireMinor;
  const stipendMinor = rateMinor * HOURS_PER_MONTH;
  const totalMinor = stipendMinor + perHireMinor;
  const stipendShare = totalMinor > 0 ? stipendMinor / totalMinor : 0;

  const shownTotal = useTween(totalMinor);
  const shownStipend = useTween(stipendMinor);
  const pct = Math.max(0, Math.min(100, (score / 10) * 100));
  const money = (minor: number) => formatMoney(minor, currency, { zeroLabel: false });

  return (
    <div ref={ref} className="mx-auto mt-12 max-w-3xl">
      <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-2xl">
        {/* ── Score and rate ────────────────────────────────────── */}
        <div className="grid gap-6 px-5 pt-6 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end sm:px-7">
          <div>
            <p className="text-sm text-text-subtle">Findtern Score</p>
            <p className="mt-1 flex items-baseline gap-1.5 text-5xl font-semibold tracking-[-0.03em] text-ink-900 tabular-nums sm:text-6xl">
              {score.toFixed(1)}
              <span className="text-xl font-medium text-text-subtle">/10</span>
            </p>
          </div>
          <div className="sm:text-right">
            <p className="text-sm text-text-subtle">
              {plan?.displayName ?? band.name} band · {band.min}–{band.max}
            </p>
            <PlanPrice
              layout="stack"
              className="mt-1 sm:items-end"
              priceClassName="text-3xl font-semibold leading-none tracking-[-0.025em] text-primary"
              nowMinor={rateMinor}
              wasMinor={wasMinor}
              currency={currency}
            />
          </div>
        </div>

        {/* ── The slider ─────────────────────────────────────────── */}
        <div className="px-5 pb-2 pt-5 sm:px-7">
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
              aria-valuetext={`${score.toFixed(1)} out of 10, ${plan?.displayName ?? band.name} band, ${formatRate(rateMinor, currency)}`}
              className="absolute inset-0 z-20 h-full w-full cursor-pointer opacity-0"
            />
            <div className="pointer-events-none absolute inset-x-0 top-1/2 flex -translate-y-1/2 gap-1" aria-hidden>
              {BANDS.map((b) => (
                <div
                  key={b.id}
                  style={{ flexGrow: b.max - b.min }}
                  className={cn("h-2 rounded-full transition-colors duration-300", b.id === band.id ? "bg-primary" : "bg-ink-200")}
                />
              ))}
            </div>
            <div className="pointer-events-none absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 overflow-hidden rounded-full" aria-hidden>
              <div
                className={cn("h-full rounded-full bg-primary/25", dragging ? "transition-none" : "transition-[width] duration-150 ease-out")}
                style={{ width: `${pct}%` }}
              />
            </div>
            <div
              aria-hidden
              className={cn(
                "pointer-events-none absolute top-1/2 size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white bg-primary shadow-lg",
                dragging ? "scale-125 transition-none" : "transition-[left,transform] duration-150 ease-out group-hover:scale-110",
              )}
              style={{ left: `${pct}%` }}
            />
          </div>
          <div className="flex justify-between text-2xs text-text-subtle">
            {BANDS.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => setScore(b.min === 0 ? 3 : b.min === 6 ? 7.2 : 9)}
                className={cn(
                  "-mx-1 cursor-pointer rounded-md px-2 py-1 transition-colors hover:bg-ink-100 hover:text-ink-900",
                  b.id === band.id ? "font-semibold text-primary" : "",
                )}
              >
                {plans[BANDS.indexOf(b)]?.displayName ?? b.name}
              </button>
            ))}
          </div>
        </div>

        {/* ── The split ──────────────────────────────────────────── */}
        <div className="border-t border-ink-100 px-5 py-6 sm:px-7">
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
            <p className="text-sm text-text-subtle">
              First month · {HOURS_PER_MONTH} hours · you pay
            </p>
            <p className="text-2xl font-semibold tabular-nums tracking-[-0.02em] text-ink-900" aria-live="polite">
              {money(shownTotal)}
            </p>
          </div>

          <div className="mt-3 flex h-11 w-full overflow-hidden rounded-xl bg-ink-100" role="img" aria-label={`${money(stipendMinor)} to the intern, ${money(perHireMinor)} to Findtern`}>
            <div
              className="flex items-center overflow-hidden bg-accent transition-[flex-basis] duration-300 ease-out-expo"
              style={{ flexBasis: `${stipendShare * 100}%` }}
            >
              <span className="truncate px-3 text-xs font-semibold text-brand-950">
                {stipendShare > 0.22 ? `To the intern · ${money(shownStipend)}` : ""}
              </span>
            </div>
            <div className="flex flex-1 items-center justify-end overflow-hidden bg-primary">
              <span className="truncate px-3 text-xs font-semibold text-white">
                {stipendShare < 0.78 ? `To Findtern · ${money(perHireMinor)}` : ""}
              </span>
            </div>
          </div>

          <dl className="mt-6 grid gap-6 sm:grid-cols-2 sm:gap-8">
            <div>
              <dt className="flex items-center gap-2 text-sm font-semibold text-ink-900">
                <span aria-hidden className="size-2.5 rounded-[3px] bg-accent" />
                To the intern
                <span className="ml-auto tabular-nums text-ink-900">{money(stipendMinor)}</span>
              </dt>
              <dd className="mt-2 text-sm leading-relaxed text-ink-600">
                {rateMinor > 0
                  ? `Their stipend: ${formatRate(rateMinor, currency)} × ${HOURS_PER_MONTH} approved hours, paid out by Findtern. The rate is the band, the same for every employer.`
                  : `Free for the pilot batch: no hourly charge on an Espresso hire while the pilot runs. Normally ${formatRate(wasMinor ?? 0, currency)} × ${HOURS_PER_MONTH} approved hours.`}
              </dd>
            </div>
            <div>
              <dt className="flex items-center gap-2 text-sm font-semibold text-ink-900">
                <span aria-hidden className="size-2.5 rounded-[3px] bg-primary" />
                To Findtern
                <span className="ml-auto tabular-nums text-ink-900">{money(perHireMinor)}</span>
              </dt>
              <dd className="mt-2 text-sm leading-relaxed text-ink-600">
                Once per hire. Verification of academics and identity, the AI interview and tests, the score report, and the engagement managed end to end.
              </dd>
            </div>
          </dl>
        </div>

        <p className="border-t border-ink-100 px-5 py-4 text-sm text-text-subtle sm:px-7">
          No other charges. {isIndia ? "Prices include GST. " : ""}Take an intern on full time later and 8.33% of CTC applies then, not before.
        </p>
      </div>
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
