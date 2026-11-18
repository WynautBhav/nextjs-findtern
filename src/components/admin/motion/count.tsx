"use client";

/**
 * A figure that tweens from what it showed before to the new value (the
 * dashboard's "Needs you" counts and the rail's queue badges tick down as
 * items clear; a column's total moves when a card lands in it). `CountUp` in
 * components/app always restarts from 0, which reads wrong for a number that
 * merely changed.
 *
 * The tween is `aria-hidden`; the settled value sits beside it as sr-only
 * text, so a screen reader never hears the in-between numbers and the figure
 * is safe inside a live region. The server and the first client render show
 * the final value. Reduced motion: no tween; the figure changes at once with a
 * 120ms opacity fade (`.admin-fade`).
 */

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";

import { ADMIN_DUR, seconds } from "./constants";

const DEFAULT_FORMAT = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

export function Count({
  value,
  format = (n) => DEFAULT_FORMAT.format(n),
  duration = seconds(ADMIN_DUR.count),
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

  // Counts value changes (not the first render) so the reduced-motion fade runs only on a change.
  const [seen, setSeen] = useState(value);
  const [changes, setChanges] = useState(0);
  if (seen !== value) {
    setSeen(value);
    setChanges((c) => c + 1);
  }

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

  const visible = reduce ? value : Math.round(shown) === Math.round(value) ? value : shown;
  return (
    <span className={className}>
      <span key={reduce ? changes : 0} aria-hidden className={reduce && changes > 0 ? "admin-fade" : undefined}>
        {format(visible)}
      </span>
      <span className="sr-only">{format(value)}</span>
    </span>
  );
}
