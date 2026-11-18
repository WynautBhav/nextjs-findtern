"use client";

/**
 * The score bar, animated once.
 *
 * The bar fills from zero to the real value on first paint and then stays. It
 * does not loop and it does not re-animate on re-render, because a score that
 * keeps moving stops being a fact. Under reduced motion it renders at its
 * final width immediately. CSS only (`.score-grow` in globals.css): no script.
 */

export function ScoreBar({ value, max = 10 }: { value: number; max?: number }) {
  const pct = Math.max(0, Math.min(1, value / max)) * 100;

  return (
    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-ink-200">
      <div
        data-reveal
        style={{ width: `${pct}%`, transformOrigin: "left" }}
        className="score-grow h-full rounded-full bg-brand-600"
      />
    </div>
  );
}
