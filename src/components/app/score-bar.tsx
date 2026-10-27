"use client";

/**
 * The score bar, animated once.
 *
 * The bar fills from zero to the real value on first paint and then stays. It
 * does not loop and it does not re-animate on re-render, because a score that
 * keeps moving stops being a fact. Under reduced motion it renders at its
 * final width immediately.
 */

import { motion, useReducedMotion } from "motion/react";

export function ScoreBar({ value, max = 10 }: { value: number; max?: number }) {
  const reduce = useReducedMotion();
  const pct = Math.max(0, Math.min(1, value / max)) * 100;

  return (
    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-ink-200">
      {/* Grows by scaleX from a fixed width, so the start state is the same on
          the server and the client and `data-reveal` can show the end state
          to reduced-motion readers before hydration (QA-002b). */}
      <motion.div
        data-reveal
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ duration: reduce ? 0 : 0.7, ease: [0.16, 1, 0.3, 1] }}
        style={{ width: `${pct}%`, transformOrigin: "left" }}
        className="h-full rounded-full bg-brand-600"
      />
    </div>
  );
}
