"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Check, Lock } from "lucide-react";

import { cn } from "@/lib/utils";

import { STEPS } from "./types";

const LAST = STEPS.length - 1;

/** Progress ring on a brand-gradient card: the one hero of the wizard (desktop rail). */
export function Progress({ step, done, total }: { step: number; done: number; total: number }) {
  const pct = Math.round((done / total) * 100);
  const reduce = useReducedMotion();
  const R = 26;
  const C = 2 * Math.PI * R;
  return (
    <div className="relative isolate mb-4 overflow-hidden rounded-apple-xl bg-gradient-to-br from-brand-600 to-brand-950 p-4 text-white shadow-[0_1px_0_rgb(255_255_255/0.12)_inset,0_14px_32px_-14px_rgb(10_40_30/0.55)]">
      <div aria-hidden className="pointer-events-none absolute -right-8 -top-10 -z-10 size-36 rounded-full bg-brand-400/30 blur-2xl" />
      <div className="flex items-center gap-4">
        <div className="relative size-16 shrink-0">
          <svg viewBox="0 0 64 64" className="size-16 -rotate-90" aria-hidden>
            <circle cx="32" cy="32" r={R} fill="none" stroke="rgb(255 255 255 / 0.18)" strokeWidth="5" />
            <motion.circle
              cx="32"
              cy="32"
              r={R}
              fill="none"
              stroke="white"
              strokeWidth="5"
              strokeLinecap="round"
              strokeDasharray={C}
              initial={reduce ? false : { strokeDashoffset: C }}
              animate={{ strokeDashoffset: C * (1 - pct / 100) }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            />
          </svg>
          <span className="nums absolute inset-0 grid place-items-center text-sm font-medium">{pct}%</span>
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-white">Profile</p>
          <p className="nums mt-0.5 text-sm text-on-dark-subtle">
            Step <span className="font-semibold text-white">{step + 1}</span> of {STEPS.length}
          </p>
          <p className="sr-only" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-valuetext={`${done} of ${total} steps complete`} aria-label="Steps complete" />
        </div>
      </div>
    </div>
  );
}

type RailProps = { step: number; passes: boolean[]; reachable: (i: number) => boolean; onSelect: (i: number) => void };

const LOCK_NOTE = "Steps with a lock open once the steps before them are finished. Review opens when every step is.";

/** The lock reason, in text: a tooltip never reaches touch or screen-reader users. */
function LockNote({ id, show }: { id: string; show: boolean }) {
  return show ? (
    <p id={id} className="flex items-start gap-2 px-3 pb-2 pt-3 text-xs leading-relaxed text-ink-600">
      <Lock className="mt-0.5 size-3 shrink-0" aria-hidden />
      {LOCK_NOTE}
    </p>
  ) : null;
}

export function StepRail({ step, passes, reachable, onSelect }: RailProps) {
  const anyLocked = STEPS.some((_, i) => !reachable(i));
  return (
    <nav aria-label="Profile steps" className="rounded-apple-xl border border-ink-200/80 bg-white p-2 shadow-[0_1px_2px_rgb(15_40_30/0.05)]">
      <ol className="relative space-y-0.5">
        {/* The spine the dots hang on. */}
        <span aria-hidden className="absolute bottom-5 left-[1.375rem] top-5 w-px bg-ink-200" />
        {STEPS.map((s, i) => {
          const current = i === step;
          const open = reachable(i);
          const done = passes[i] && i !== LAST;
          return (
            <li key={s.id} className="relative">
              <button
                type="button"
                onClick={() => open && onSelect(i)}
                aria-disabled={!open}
                aria-describedby={open ? undefined : "rail-lock-note"}
                aria-current={current ? "step" : undefined}
                className={cn(
                  "apple-spring relative flex min-h-11 w-full items-center gap-3 rounded-apple-sm px-3 text-left text-sm",
                  current ? "bg-brand-50 font-semibold text-brand-900" : open ? "text-ink-700 hover:bg-ink-50" : "cursor-not-allowed text-text-subtle",
                )}
              >
                {current ? <span aria-hidden className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-brand-600" /> : null}
                <StepDot index={i} current={current} done={done} open={open} />
                <span className="truncate">{s.title}</span>
              </button>
            </li>
          );
        })}
      </ol>
      <LockNote id="rail-lock-note" show={anyLocked} />
    </nav>
  );
}

function StepDot({ index, current, done, open }: { index: number; current: boolean; done: boolean; open: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "nums relative z-10 grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold ring-4",
        current ? "bg-brand-700 text-white ring-brand-50" : done ? "bg-brand-100 text-brand-700 ring-white" : open ? "bg-ink-100 text-ink-600 ring-white" : "bg-ink-50 text-text-subtle ring-white",
      )}
    >
      {done && !current ? <Check className="size-3.5" /> : !open ? <Lock className="size-3" /> : index + 1}
    </span>
  );
}

/** Phones and tablets: a segmented bar plus a disclosure listing the steps. */
export function MobileSteps({ step, passes, reachable, onSelect }: RailProps) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mb-4 lg:hidden">
      <div className="flex gap-1" aria-hidden>
        {STEPS.map((s, i) => (
          <span key={s.id} className={cn("h-1.5 flex-1 rounded-full transition-colors duration-300", i === step ? "bg-brand-700" : passes[i] && i !== LAST ? "bg-brand-300" : "bg-ink-200")} />
        ))}
      </div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="mobile-steps"
        className="mt-2 flex min-h-11 w-full items-center justify-between text-sm text-ink-700"
      >
        <span className="nums">
          Step <span className="font-semibold text-ink-900">{step + 1}</span> of {STEPS.length} · {STEPS[step].title}
        </span>
        <span className="font-medium text-brand-700">{open ? "Hide steps" : "All steps"}</span>
      </button>
      {open ? (
        <div id="mobile-steps" className="mt-1 rounded-apple-xl border border-ink-200/80 bg-white p-2 shadow-[0_1px_2px_rgb(15_40_30/0.05)]">
          <ol className="space-y-0.5">
            {STEPS.map((s, i) => {
              const current = i === step;
              const can = reachable(i);
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    aria-disabled={!can}
                    aria-describedby={can ? undefined : "mobile-lock-note"}
                    aria-current={current ? "step" : undefined}
                    onClick={() => {
                      if (!can) return;
                      setOpen(false);
                      onSelect(i);
                    }}
                    className={cn(
                      "apple-spring flex min-h-11 w-full items-center gap-3 rounded-apple-sm px-3 text-left text-sm",
                      current ? "bg-brand-50 font-semibold text-brand-900" : can ? "text-ink-700 hover:bg-ink-50" : "cursor-not-allowed text-text-subtle",
                    )}
                  >
                    <StepDot index={i} current={current} done={passes[i] && i !== LAST} open={can} />
                    {s.title}
                  </button>
                </li>
              );
            })}
          </ol>
          <LockNote id="mobile-lock-note" show={STEPS.some((_, i) => !reachable(i))} />
        </div>
      ) : null}
    </div>
  );
}
