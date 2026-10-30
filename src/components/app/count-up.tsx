"use client";

/**
 * Count-up for the figures that matter.
 *
 * Runs once on mount, over ~600ms, and then stays put. It is not a ticker and
 * it never re-runs on re-render, because a number that keeps moving stops
 * being a fact and starts being a slot machine. Under reduced motion it
 * renders the final value immediately.
 *
 * The server and the first client render both show the final value (QA-002:
 * the server used to render 0 while a reduced-motion client rendered the
 * value, a hydration mismatch). The count from 0 starts only after mount, so
 * no-JS readers and screen readers get the real figure, never 0.
 */

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";

export function CountUp({
  value,
  currency,
  duration = 0.6,
}: {
  value: number;
  /** When set, render as currency in this ISO code instead of a plain number. */
  currency?: string;
  duration?: number;
}) {
  const format = currency
    ? (n: number) =>
        new Intl.NumberFormat(currency === "USD" ? "en-US" : "en-IN", {
          style: "currency",
          currency,
          maximumFractionDigits: 0,
        }).format(n)
    : undefined;
  const reduce = useReducedMotion();
  const [display, setDisplay] = useState(value);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    if (reduce) return;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / (duration * 1000));
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(value * eased);
      if (t < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [value, duration, reduce]);

  const shown = reduce ? value : display;
  // Whole numbers while counting; the settled figure keeps its decimals (26.5 h must not read 27 h).
  return <>{format ? format(shown) : shown.toLocaleString("en-IN", { maximumFractionDigits: shown === value ? 2 : 0 })}</>;
}
