"use client";

/**
 * Money (or any figure) whose digits roll into place: each digit is a column of 0-9 that slides
 * with a transform. It rolls once on arrival and again when the value changes, then rests.
 *
 * Server render and the first client render show the final value (no-JS readers and screen readers
 * get the real figure through `aria-label`); the roll starts after mount. Reduced motion: no roll.
 */

import { useLayoutEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

function Digit({ d, armed, delay }: { d: number; armed: boolean; delay: number }) {
  return (
    <span aria-hidden className="relative inline-block h-[1em] w-[1ch] overflow-hidden align-bottom leading-none">
      <span
        className="absolute inset-x-0 top-0 flex flex-col will-change-transform"
        style={{
          transform: `translateY(${-d}em)`,
          transition: armed ? `transform var(--motion-slow) var(--ease-app) ${delay}ms` : "none",
        }}
      >
        {DIGITS.map((n) => (
          <span key={n} className="block h-[1em] text-center leading-none">
            {n}
          </span>
        ))}
      </span>
      <span className="invisible block h-[1em] text-center leading-none">{d}</span>
    </span>
  );
}

export function RollingNumber({
  value,
  currency,
  className,
}: {
  value: number;
  /** "INR" renders ₹ with Indian grouping (8,55,000). Omit for a plain figure. */
  currency?: "INR";
  className?: string;
}) {
  const text = currency
    ? new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(Math.round(value))
    : new Intl.NumberFormat("en-IN").format(value);
  const [shown, setShown] = useState<string | null>(null);
  // The value the digits last rested on. Updated only once the roll has actually started, so a
  // strict-mode double effect (which cancels the first frame) still ends on the real value.
  const rested = useRef<string | null>(null);

  useLayoutEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const from = rested.current ?? text.replace(/\d/g, "0");
    if (from === text || from.length !== text.length) {
      rested.current = text;
      return;
    }
    setShown(from);
    const raf = requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        rested.current = text;
        setShown(null);
      }),
    );
    return () => cancelAnimationFrame(raf);
  }, [text]);

  const chars = (shown ?? text).split("");
  const n = chars.length;
  return (
    <span className={cn("nums inline-flex items-baseline whitespace-nowrap", className)} role="text" aria-label={currency ? `₹${text}` : text}>
      {currency ? <span aria-hidden>₹</span> : null}
      {chars.map((c, i) =>
        /\d/.test(c) ? <Digit key={n - i} d={Number(c)} armed={shown === null} delay={(n - 1 - i) * 30} /> : <span key={n - i} aria-hidden>{c}</span>,
      )}
    </span>
  );
}
