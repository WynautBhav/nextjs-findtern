"use client";

/**
 * A figure that tweens from what it showed before to the new value (the
 * dashboard's "Needs you" counts tick down as items clear; a column's total
 * moves when a card lands in it). `CountUp` in components/app always restarts
 * from 0, which reads wrong for a number that merely changed.
 *
 * The server and the first client render show the final value, so no-JS
 * readers and screen readers get the real figure. Under reduced motion the
 * value is set at once.
 */

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";

const DEFAULT_FORMAT = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

export function Count({
  value,
  format = (n) => DEFAULT_FORMAT.format(n),
  duration = 0.5,
  className,
}: {
  value: number;
  /** Formats the in-between and the settled figure (rupees, hours, plain count). */
  format?: (n: number) => string;
  duration?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    if (reduce) {
      from.current = value;
      return;
    }
    const start = performance.now();
    const begin = from.current;
    if (begin === value) return;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / (duration * 1000));
      const eased = 1 - Math.pow(1 - t, 3);
      const next = t === 1 ? value : begin + (value - begin) * eased;
      from.current = next;
      setShown(next);
      if (t < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [value, duration, reduce]);

  return <span className={className}>{format(reduce ? value : Math.round(shown) === Math.round(value) ? value : shown)}</span>;
}
