"use client";

/**
 * Count-up for the figures that matter.
 *
 * Runs once on mount, over ~600ms, and then stays put. It is not a ticker and
 * it never re-runs on re-render, because a number that keeps moving stops
 * being a fact and starts being a slot machine. Under reduced motion it
 * renders the final value immediately.
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
  const [display, setDisplay] = useState(0);
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

  if (reduce) return <>{format ? format(value) : Math.round(value).toLocaleString("en-IN")}</>;
  return <>{format ? format(display) : Math.round(display).toLocaleString("en-IN")}</>;
}
