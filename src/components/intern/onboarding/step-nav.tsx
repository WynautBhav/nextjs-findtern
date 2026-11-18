"use client";

import { useState } from "react";
import { Check, Lock } from "lucide-react";

import { cn } from "@/lib/utils";

import { STEPS } from "./types";

const LAST = STEPS.length - 1;

/** The wizard's one figure: how much of the CV is written, as a number and one segment per step (desktop rail). */
export function Progress({ step, done, total }: { step: number; done: number; total: number }) {
  const pct = Math.round((done / total) * 100);
  return (
    <div className="mb-5 border-t border-ink-300 pt-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-medium text-ink-800">
          Step <span className="nums">{step + 1}</span> of <span className="nums">{STEPS.length}</span>
        </p>
        <p className="nums font-display text-4xl font-bold leading-none text-ink-900">
          {pct}
          <span className="text-lg font-semibold text-ink-700">%</span>
        </p>
      </div>
      <div className="mt-3 flex gap-1" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-valuetext={`${done} of ${total} steps complete`} aria-label="Steps complete">
        {Array.from({ length: total }, (_, i) => (
          <span key={i} aria-hidden className={cn("h-2 flex-1 rounded-md transition-colors duration-300", i < done ? "bg-brand-800" : "bg-ink-200")} />
        ))}
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
    <nav aria-label="Profile steps" className="border-y border-ink-300">
      <ol className="relative divide-y divide-ink-200">
        {/* The spine the dots hang on. */}
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
                  "apple-spring relative flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-left text-sm",
                  current ? "font-semibold text-ink-900" : open ? "text-ink-700 hover:bg-ink-50" : "cursor-not-allowed text-ink-700",
                )}
              >
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
        current ? "bg-brand-800 text-white ring-surface" : done ? "bg-brand-100 text-brand-700 ring-surface" : open ? "bg-ink-100 text-ink-600 ring-surface" : "bg-ink-50 text-ink-700 ring-surface",
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
          <span key={s.id} className={cn("h-2 flex-1 rounded-md transition-colors duration-300", i === step ? "bg-brand-800" : passes[i] && i !== LAST ? "bg-brand-700/50" : "bg-ink-200")} />
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
        <div id="mobile-steps" className="mt-1 border-y border-ink-300">
          <ol className="divide-y divide-ink-200">
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
                      "apple-spring flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-left text-sm",
                      current ? "font-semibold text-ink-900" : can ? "text-ink-700 hover:bg-ink-50" : "cursor-not-allowed text-ink-700",
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
