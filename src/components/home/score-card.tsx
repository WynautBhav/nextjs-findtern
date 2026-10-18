"use client";

import { useRef, useState } from "react";

import { formatMoney, formatRate } from "@/lib/format";
import { useRegionBands } from "@/components/marketing/region-rates";
import { BANDS, DISTRIBUTION, bandFor } from "@/lib/score";
import { cn } from "@/lib/utils";

/**
 * The Findtern Score card - the hero's proof artifact.
 *
 * Replaces the background video that used to sit behind the headline. A video
 * of a graduation ceremony says "we are about education"; this says what
 * Findtern actually does and how it prices it, which is the thing a visitor
 * is trying to find out. Across 28 measured premium sites, every strong hero
 * leads with a real artifact - a product frame, a live data card - and not one
 * ships an autoplaying background video.
 *
 * The score is draggable and keyboard-operable, and the rate is derived from
 * the same constants the pricing table uses, so moving it cannot disagree with
 * the table.
 */
export function ScoreCard() {
  const [score, setScore] = useState(8.4);
  const [dragging, setDragging] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);

  const band = bandFor(score);
  // Money follows the visitor's region; geometry (band id) does not.
  const { bands: regionBands, currency } = useRegionBands();
  const money = regionBands.find((b) => b.id === band.id) ?? band;

  const pct = Math.max(0, Math.min(100, (score / 10) * 100));


  return (
    <div className="w-full max-w-md">
      <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-2xl">
        {/* ── Header ─────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-4 border-b border-ink-100 px-5 py-4">
          <div>
            <p className="text-2xs font-semibold uppercase tracking-[0.14em] text-text-subtle">
              Findtern Score
            </p>
            <p className="mt-1 text-sm text-text-subtle">Illustrative example</p>
          </div>
          <span
            className={cn(
              "shrink-0 rounded-full px-2.5 py-1 text-2xs font-semibold uppercase tracking-[0.1em] transition-colors duration-300",
              band.id === "assured"
                ? "bg-accent/20 text-accent-700"
                : band.id === "skilled"
                  ? "bg-brand-100 text-brand-800"
                  : "bg-ink-100 text-ink-600",
            )}
          >
            {band.name}
          </span>
        </div>

        {/* ── Score + rate ───────────────────────────────────────── */}
        <div className="px-5 pt-6 pb-5">
          <div className="flex items-end justify-between gap-4">
            <p className="flex items-baseline gap-1 text-5xl font-bold tracking-[-0.03em] text-ink-900 tabular-nums">
              {score.toFixed(1)}
              <span className="text-xl font-medium text-text-subtle">/10</span>
            </p>
            <div className="text-right">
              <p className="text-2xs font-semibold uppercase tracking-[0.12em] text-text-subtle">
                Your rate
              </p>
              <p className="mt-0.5 text-xl font-bold text-primary tabular-nums">
                {formatRate(money.rateMinor, currency)}
              </p>
            </div>
          </div>

          {/* ── The interactive control track ─────────────────────── */}
          <div
            ref={trackRef}
            className="group relative mt-6 h-10 w-full cursor-pointer select-none rounded-lg"
          >
            {/* Native range input overlay: 100% reliable clicks anywhere on the track & smooth sliding */}
            <input
              type="range"
              min="0"
              max="10"
              step="0.1"
              value={score}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                if (!isNaN(val)) setScore(Math.round(val * 10) / 10);
              }}
              onInput={(e) => {
                const val = parseFloat((e.target as HTMLInputElement).value);
                if (!isNaN(val)) setScore(Math.round(val * 10) / 10);
              }}
              onPointerDown={() => setDragging(true)}
              onPointerUp={() => setDragging(false)}
              onPointerCancel={() => setDragging(false)}
              aria-label="Findtern Score out of 10"
              aria-valuenow={score}
              aria-valuemin={0}
              aria-valuemax={10}
              aria-valuetext={`${score.toFixed(1)} out of 10, ${band.name} band`}
              className="absolute inset-0 z-20 h-full w-full cursor-pointer opacity-0"
            />

            {/* Band track: three segments */}
            <div
              className="pointer-events-none absolute inset-x-0 top-1/2 flex -translate-y-1/2 gap-1"
              aria-hidden
            >
              {BANDS.map((b) => (
                <div
                  key={b.id}
                  style={{ flexGrow: b.max - b.min }}
                  className={cn(
                    "h-2 rounded-full transition-colors duration-300",
                    b.id === band.id ? "bg-primary" : "bg-ink-200",
                  )}
                />
              ))}
            </div>

            {/* Progress overlay */}
            <div
              className="pointer-events-none absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 overflow-hidden rounded-full"
              aria-hidden
            >
              <div
                className={cn(
                  "h-full rounded-full bg-primary/25",
                  dragging
                    ? "transition-none"
                    : "transition-[width] duration-150 ease-out",
                )}
                style={{ width: `${pct}%` }}
              />
            </div>

            {/* Thumb */}
            <div
              aria-hidden
              className={cn(
                "pointer-events-none absolute top-1/2 size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white bg-primary shadow-lg",
                dragging
                  ? "scale-125 transition-none"
                  : "transition-[left,transform] duration-150 ease-out group-hover:scale-110",
              )}
              style={{ left: `${pct}%` }}
            />
          </div>

          <div className="mt-1 flex justify-between text-2xs text-text-subtle select-none">
            <button
              type="button"
              onClick={() => setScore(0)}
              className="cursor-pointer py-1 px-2.5 -mx-1 rounded-md transition-colors hover:bg-ink-100 hover:text-ink-900"
              aria-label="Set score to 0"
            >
              0
            </button>
            <button
              type="button"
              onClick={() => setScore(6.0)}
              className="cursor-pointer py-1 px-2.5 -mx-1 rounded-md transition-colors hover:bg-ink-100 hover:text-ink-900"
              aria-label="Set score to 6.0 (Skilled threshold)"
            >
              6
            </button>
            <button
              type="button"
              onClick={() => setScore(10.0)}
              className="cursor-pointer py-1 px-2.5 -mx-1 rounded-md transition-colors hover:bg-ink-100 hover:text-ink-900"
              aria-label="Set score to 10.0"
            >
              10
            </button>
          </div>
        </div>

        {/* ── Why the rate is what it is ────────────────────────── */}
        <dl className="grid grid-cols-2 gap-px border-t border-ink-100 bg-ink-100">
          <Cell
            label="Per hire"
            value={formatMoney(money.perHireMinor, currency)}
          />
          <Cell label="Band" value={`${band.min}–${band.max}/10`} />
        </dl>

        <p className="border-t border-ink-100 px-5 py-4 text-sm text-text-subtle">
          {band.blurb} Move the slider - the rate is not negotiated, it is
          arithmetic.
        </p>
      </div>

      {/* Cohort distribution - the same histogram the rate card publishes. */}
      <div className="mt-4 rounded-2xl border border-ink-200 bg-white/70 px-5 py-4 backdrop-blur-sm">
        <p className="text-2xs font-semibold uppercase tracking-[0.14em] text-text-subtle">
          Where the cohort sits
        </p>
        <div className="mt-3 flex h-14 items-stretch gap-[3px]" aria-label="Cohort score distribution">
          {DISTRIBUTION.map((n, i) => {
            const lo = (i / DISTRIBUTION.length) * 10;
            const mid = Math.round((lo + 0.5) * 10) / 10;
            const inBand = lo >= band.min && lo < band.max;
            return (
              <button
                type="button"
                key={i}
                onClick={() => setScore(mid)}
                aria-label={`Jump to score ${mid}`}
                className="group flex h-full w-full cursor-pointer flex-col justify-end rounded-[2px] focus:outline-hidden"
              >
                <div
                  style={{ height: `${Math.max(8, (n / 388) * 100)}%` }}
                  className={cn(
                    "w-full rounded-[2px] transition-colors duration-200 group-hover:opacity-80",
                    inBand ? "bg-primary" : "bg-ink-200 group-hover:bg-ink-300",
                  )}
                />
              </button>
            );
          })}
        </div>
        <div className="mt-2 flex justify-between text-2xs text-text-subtle">
          {BANDS.map((b) => (
            <button
              type="button"
              key={b.id}
              onClick={() => setScore(b.min === 0 ? 3.0 : b.min === 6 ? 7.0 : 9.0)}
              className={cn(
                "cursor-pointer py-1 px-2 -mx-1 rounded-md transition-colors hover:bg-ink-100 hover:text-ink-900",
                b.id === band.id ? "font-semibold text-on-dark-accent" : "text-text-subtle",
              )}
            >
              {b.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Cell({
  label,
  value,
  muted,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className="bg-white px-5 py-3.5">
      <dt className="text-2xs font-semibold uppercase tracking-[0.12em] text-text-subtle">
        {label}
      </dt>
      <dd
        className={cn(
          "mt-0.5 text-sm font-semibold tabular-nums",
          muted ? "text-primary" : "text-ink-900",
        )}
      >
        {value}
      </dd>
    </div>
  );
}
