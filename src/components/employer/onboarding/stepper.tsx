import { Check } from "lucide-react";

import { HeroPanel } from "@/components/employer/kit/hero-panel";
import { cn } from "@/lib/utils";

export type Step = { id: string; title: string; blurb: string };

/**
 * The wizard header: one brand hero carrying the step title and a progress
 * rail. The step buttons keep their old behaviour (the caller decides what a
 * click does); only the look changed.
 */
export function Stepper({
  steps,
  stage,
  onStep,
}: {
  steps: readonly Step[];
  stage: number;
  onStep: (i: number) => void;
}) {
  const pct = ((stage + 1) / steps.length) * 100;
  return (
    <HeroPanel className="mb-5 p-5 sm:p-7">
      <p className="nums text-[13px] font-medium text-on-dark-subtle">
        Step {stage + 1} of {steps.length}
      </p>
      <p className="mt-1 text-[clamp(1.5rem,3.4vw,2.25rem)] font-light leading-tight tracking-[-0.03em]">{steps[stage].title}</p>
      <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-white/15" role="progressbar" aria-label="Setup progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
        <div className="h-full origin-left rounded-full bg-white transition-[width] duration-300 ease-out motion-reduce:transition-none" style={{ width: `${pct}%` }} />
      </div>
      <nav aria-label="Setup steps" className="mt-4">
        <ol className="grid grid-cols-2 gap-2 sm:gap-3">
          {steps.map((item, i) => {
            const state = i === stage ? "current" : i < stage ? "done" : "todo";
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => onStep(i)}
                  aria-current={state === "current" ? "step" : undefined}
                  className={cn(
                    "apple-spring flex min-h-11 w-full items-center gap-3 rounded-apple-lg px-3 py-2.5 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white",
                    state === "current" ? "bg-white/15 ring-1 ring-inset ring-white/30" : "hover:bg-white/10",
                  )}
                >
                  <span
                    className={cn(
                      "nums grid size-7 shrink-0 place-items-center rounded-full text-sm font-semibold",
                      state === "todo" ? "bg-transparent text-white ring-1 ring-inset ring-white/40" : "bg-white text-brand-800",
                    )}
                  >
                    {state === "done" ? <Check className="size-4" aria-hidden /> : i + 1}
                  </span>
                  <span className="min-w-0 break-words text-sm font-medium">{item.title}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>
    </HeroPanel>
  );
}
