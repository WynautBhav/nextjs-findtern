"use client";

import { motion, useReducedMotion } from "motion/react";
import { EyeOff } from "lucide-react";

import { ScoreBadge } from "@/components/app/score-badge";

/**
 * Signature of the profile page: the anonymous card an employer sees before a
 * hire, built live from the profile. Initials, city, score and skills only.
 */
export function EmployerCard({
  initials,
  place,
  score,
  skills,
}: {
  initials: string;
  place: string;
  score: number | null;
  skills: string[];
}) {
  const reduce = useReducedMotion();
  return (
    <section
      aria-labelledby="preview-head"
      className="relative isolate overflow-hidden rounded-apple-xl bg-gradient-to-br from-brand-600 via-brand-800 to-brand-950 p-5 text-white shadow-[0_1px_0_rgb(255_255_255/0.14)_inset,0_24px_48px_-24px_rgb(10_40_30/0.6)] lg:p-8"
    >
      <div aria-hidden className="pointer-events-none absolute -right-16 -top-20 -z-10 size-72 rounded-full bg-brand-400/25 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 opacity-[0.07] [background:repeating-linear-gradient(135deg,white_0_1px,transparent_1px_14px)]" />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="preview-head" className="text-lg font-semibold tracking-[-0.01em]">
            How employers see you
          </h2>
          <p className="mt-1 max-w-md text-pretty text-sm text-on-dark-subtle">
            Before a hire, employers get this card. Never your name, LinkedIn or contact details.
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white ring-1 ring-white/20">
          <EyeOff className="size-3.5" aria-hidden />
          Name hidden
        </span>
      </div>

      <motion.div
        role="group"
        aria-label="Preview of what employers see"
        initial={reduce ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        whileHover={reduce ? undefined : { y: -2 }}
        transition={{ type: "spring", stiffness: 260, damping: 26 }}
        className="mt-6 max-w-xl rounded-apple-lg bg-white p-5 text-ink-900 shadow-[0_1px_0_rgb(255_255_255)_inset,0_20px_40px_-16px_rgb(0_0_0/0.45)]"
      >
        <div className="flex items-center gap-3">
          <span aria-hidden className="nums grid size-12 shrink-0 place-items-center rounded-full bg-brand-50 text-base font-semibold text-brand-800">
            {initials}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-base font-semibold">Candidate {initials}</p>
            <p className="truncate text-sm text-text-subtle">{place || "City not added yet"}</p>
          </div>
          {score !== null ? <ScoreBadge score={score} size="sm" /> : null}
        </div>
        {skills.length > 0 ? (
          <ul className="mt-4 flex flex-wrap gap-1.5">
            {skills.slice(0, 7).map((k, i) => (
              <motion.li
                key={k}
                initial={reduce ? false : { opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.12 + i * 0.04, duration: 0.2 }}
                className="rounded-full bg-ink-50 px-2.5 py-1 text-sm text-ink-800 [overflow-wrap:anywhere]"
              >
                {k}
              </motion.li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-text-subtle">No skills yet: employers filter by skill first.</p>
        )}
      </motion.div>
    </section>
  );
}
