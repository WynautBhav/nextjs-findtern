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

    if (prefersReducedMotion()) {
      el.textContent = prefix + format(value, decimals) + suffix;
      return;
    }

    const obj = { n: 0 };

    const ctx = gsap.context(() => {
      gsap.to(obj, {
        n: value,
        duration,
        ease: EASE.outExpo,
        scrollTrigger: { trigger: el, start: "top 90%", once: true },
        onUpdate: () => {
          el.textContent = prefix + format(obj.n, decimals) + suffix;
        },
      });
    }, el);

    return () => ctx.revert();
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
