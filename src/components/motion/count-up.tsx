"use client";

import { useEffect, useRef } from "react";

import { EASE, gsap, prefersReducedMotion } from "@/lib/gsap";
import { cn } from "@/lib/utils";

/**
 * Counts up to `value` when scrolled into view.
 *
 * Respecting `prefers-reduced-motion` here is not optional polish: a counting
 * number is exactly the kind of looping visual change that triggers vestibular
 * symptoms, so the final value is rendered directly and the tween never runs.
 */
export function CountUp({
  value,
  decimals = 0,
  prefix = "",
  suffix = "",
  duration = 1.9,
  className,
}: {
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  duration?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (prefersReducedMotion()) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();

        const obj = { n: 0 };
        gsap.to(obj, {
          n: value,
          duration,
          ease: EASE.outExpo,
          onUpdate: () => {
            if (el) el.textContent = prefix + format(obj.n, decimals) + suffix;
          },
        });
      },
      { threshold: 0.1, rootMargin: "0px 0px -50px 0px" },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [value, decimals, prefix, suffix, duration]);

  return (
    <span ref={ref} className={cn("tabular-nums", className)}>
      {prefix + format(value, decimals) + suffix}
    </span>
  );
}

function format(n: number, decimals: number) {
  return n.toLocaleString("en-IN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}
