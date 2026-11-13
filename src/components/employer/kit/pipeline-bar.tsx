"use client";

import { motion, MotionConfig } from "motion/react";

export type PipelineStage = { key: string; label: string; count: number; tone: "open" | "won" | "lost" };

const TONE: Record<PipelineStage["tone"], string> = {
  open: "bg-white/80",
  won: "bg-accent",
  lost: "bg-white/25",
};

/**
 * The dashboard's signature: every proposal ever sent, laid end to end as one
 * segmented bar (open, accepted, closed out), so the pipeline's shape reads at
 * a glance. Widths are proportional to the real counts.
 */
export function PipelineBar({ stages }: { stages: PipelineStage[] }) {
  const total = stages.reduce((n, s) => n + s.count, 0);
  return (
    <MotionConfig reducedMotion="user">
      <div>
        <div className="flex items-baseline justify-between gap-4">
          <p className="text-[13px] font-medium text-on-dark-subtle">Proposal pipeline</p>
          <p className="nums text-sm text-on-dark-subtle">{total} sent in total</p>
        </div>
        {total === 0 ? (
          <div className="mt-3 h-3 rounded-full border border-dashed border-white/25" aria-hidden />
        ) : (
          <div className="mt-3 flex h-3 gap-1" role="img" aria-label={stages.map((s) => `${s.count} ${s.label.toLowerCase()}`).join(", ")}>
            {stages.filter((s) => s.count > 0).map((s, i) => (
              <motion.div
                key={s.key}
                className={`h-full origin-left rounded-full ${TONE[s.tone]}`}
                style={{ flexGrow: s.count, flexBasis: 0 }}
                initial={{ scaleX: 0, opacity: 0 }}
                animate={{ scaleX: 1, opacity: 1 }}
                transition={{ duration: 0.3, delay: Math.min(i, 3) * 0.04, ease: [0.22, 1, 0.36, 1] }}
              />
            ))}
          </div>
        )}
        <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-1">
          {stages.map((s) => (
            <li key={s.key} className="flex items-center gap-2 text-sm text-white">
              <span className={`size-2 rounded-full ${TONE[s.tone]}`} aria-hidden />
              <span className="nums font-medium">{s.count}</span>
              <span className="text-on-dark-subtle">{s.label}</span>
            </li>
          ))}
        </ul>
      </div>
    </MotionConfig>
  );
}
