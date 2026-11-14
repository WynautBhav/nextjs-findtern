"use client";

import { motion, useReducedMotion } from "motion/react";

import { cn } from "@/lib/utils";

/** A small progress ring (have of total) with the fraction in the middle. Draws in once on mount. */
export function MatchRing({ have, total, size = 56, label, tone = "light", className }: { have: number; total: number; size?: number; label: string; tone?: "light" | "dark"; className?: string }) {
  const reduce = useReducedMotion();
  const r = 20;
  const frac = total > 0 ? Math.min(1, have / total) : 0;
  const dark = tone === "dark";
  return (
    <span className={cn("relative inline-grid shrink-0 place-items-center", className)} style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg viewBox="0 0 48 48" className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx="24" cy="24" r={r} fill="none" strokeWidth="4" className={dark ? "stroke-white/20" : "stroke-ink-100"} />
        <motion.circle
          cx="24"
          cy="24"
          r={r}
          fill="none"
          strokeWidth="4"
          strokeLinecap={frac > 0 ? "round" : "butt"}
          className={dark ? "stroke-data-on-dark" : "stroke-brand-600"}
          initial={{ pathLength: reduce ? frac : 0 }}
          animate={{ pathLength: frac }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
      <span className={cn("nums relative text-xs font-semibold", dark ? "text-white" : "text-ink-900")}>
        {have}/{total}
      </span>
    </span>
  );
}
