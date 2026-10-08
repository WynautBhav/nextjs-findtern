"use client";

import { useEffect, useRef, useState } from "react";

import { formatMoney, formatRate } from "@/lib/format";
import { BANDS, DISTRIBUTION, bandFor } from "@/lib/score";
import { gsap, prefersReducedMotion } from "@/lib/gsap";
import { cn } from "@/lib/utils";

/**
 * The Findtern Score card — the hero's proof artifact.
 *
 * Replaces the background video that used to sit behind the headline. A video
 * of a graduation ceremony says "we are about education"; this says what
 * Findtern actually does and how it prices it, which is the thing a visitor
 * is trying to find out. Across 28 measured premium sites, every strong hero
 * leads with a real artifact — a product frame, a live data card — and not one
 * ships an autoplaying background video.
 *
 * The score is draggable and keyboard-operable, and the rate is derived from
 * the same constants the pricing table uses, so moving it cannot disagree with
 * the table. Under reduced motion the value snaps instead of tweening, and the
 * control is still fully operable.
 */
export function ScoreCard() {
  const [score, setScore] = useState(8.4);
  const [dragging, setDragging] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);

  const band = bandFor(score);

  // Tween the thumb and the fill to the new score. A range input cannot be
  // styled into this shape cross-browser, so the control is a custom
  // slider over a real <input type="range"> kept invisible but focusable for
  // keyboard and assistive tech.
  useEffect(() => {
    const pct = (score / 10) * 100;
    if (prefersReducedMotion()) {
      if (fillRef.current) fillRef.current.style.width = `${pct}%`;
      if (thumbRef.current) thumbRef.current.style.left = `${pct}%`;
      return;
    }
    if (fillRef.current) {
      gsap.to(fillRef.current, { width: `${pct}%`, duration: 0.5, ease: "power3.out" });
    }
    if (thumbRef.current) {
      gsap.to(thumbRef.current, { left: `${pct}%`, duration: 0.5, ease: "power3.out" });
    }
  }, [score]);

  const fromPointer = (clientX: number) => {
    const el = trackRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    // Snap to 0.1 so the number never shows a floating-point artefact.
    setScore(Math.round(ratio * 10 * 10) / 10);
  };

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
                {formatRate(band.rateMinor)}
              </p>
            </div>
          </div>

          {/* ── The control ──────────────────────────────────────── */}
          <div className="relative mt-6">
            {/* Band track: three segments, so the control shows where the
                price steps are rather than being an abstract 0–10 line. */}
            <div className="absolute inset-x-0 top-1/2 flex -translate-y-1/2 gap-1">
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

            {/* Progress overlay, clipped to the active band. */}
            <div
              className="pointer-events-none absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 overflow-hidden rounded-full"
              aria-hidden
            >
              <div
                ref={fillRef}
                className="h-full rounded-full bg-primary/25"
                style={{ width: `${(score / 10) * 100}%` }}
              />
            </div>

            {/* Thumb */}
            <div
              ref={thumbRef}
              aria-hidden
              className="pointer-events-none absolute top-1/2 size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white bg-primary shadow-lg transition-transform duration-150"
              style={{ left: `${(score / 10) * 100}%`, transform: `translate(-50%, -50%) scale(${dragging ? 1.15 : 1})` }}
            />

            {/* The real control, transparent, on top. Kept as a native
                range input so keyboard, touch, and screen readers all work
                without reimplementation. */}
            <div
              ref={trackRef}
              onPointerDown={(e) => {
                setDragging(true);
                (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
                fromPointer(e.clientX);
              }}
              onPointerMove={(e) => dragging && fromPointer(e.clientX)}
              onPointerUp={() => setDragging(false)}
              onPointerCancel={() => setDragging(false)}
              className="relative h-8 cursor-grab active:cursor-grabbing"
            >
              <input
                type="range"
                min={0}
                max={10}
                step={0.1}
                value={score}
                onChange={(e) => setScore(Number(e.target.value))}
                aria-label="Findtern Score out of 10"
                aria-valuetext={`${score.toFixed(1)} out of 10, ${band.name} band`}
                className="absolute inset-0 h-full w-full cursor-grab appearance-none bg-transparent opacity-0 active:cursor-grabbing"
              />
            </div>
          </div>

          <div className="mt-1 flex justify-between text-2xs text-text-subtle">
            <span>0</span>
            <span>6</span>
            <span>10</span>
          </div>
        </div>

        {/* ── Why the rate is what it is ────────────────────────── */}
        <dl className="grid grid-cols-2 gap-px border-t border-ink-100 bg-ink-100">
          <Cell
            label="Per hire"
            value={
              band.perHireMinor > 0
                ? formatMoney(band.perHireMinor)
                : "Waived"
            }
            muted={band.perHireMinor === 0}
          />
          <Cell label="Band" value={`${band.min}–${band.max}/10`} />
        </dl>

        <p className="border-t border-ink-100 px-5 py-4 text-sm text-text-subtle">
          {band.blurb} Move the slider — the rate is not negotiated, it is
          arithmetic.
        </p>
      </div>

      {/* Cohort distribution — the same histogram the rate card publishes. */}
      <div className="mt-4 rounded-2xl border border-ink-200 bg-white/70 px-5 py-4 backdrop-blur-sm">
        <p className="text-2xs font-semibold uppercase tracking-[0.14em] text-text-subtle">
          Where the cohort sits
        </p>
        {/* Cohort distribution. Fixed-width bars, not flex-grow: at ten bins
            across a full-width flex row each bin becomes ~55px wide and as
            tall as the container, which renders as a row of white blobs
            rather than a histogram. */}
        <div className="mt-3 flex h-14 items-end gap-[3px]" aria-hidden>
          {DISTRIBUTION.map((n, i) => {
            const lo = (i / DISTRIBUTION.length) * 10;
            const inBand = lo >= band.min && lo < band.max;
            return (
              <div
                key={i}
                style={{ height: `${Math.max(8, (n / 388) * 100)}%` }}
                className={cn(
                  "w-full rounded-[2px] transition-colors duration-300",
                  inBand ? "bg-primary" : "bg-ink-200",
                )}
              />
            );
          })}
        </div>
        <div className="mt-2 flex justify-between text-2xs text-text-subtle">
          {BANDS.map((b) => (
            <span key={b.id} className={cn(b.id === band.id && "font-semibold text-on-dark-accent")}>
              {b.name}
            </span>
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
