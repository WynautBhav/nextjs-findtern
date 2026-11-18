import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

export type Step = { id: string; title: string; blurb: string };

/**
 * The setup ledger: each step is an entry with its number at display size, what it covers, and where it stands (Done,
 * Now, Next) in words. From lg it is a rail beside the form; on a phone it is the same list above it. The caller
 * decides what a click does, so jumping ahead still saves the company first.
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
  return (
    <nav aria-label="Setup steps">
      <ol className="divide-y divide-ink-200 border-y border-ink-200">
        {steps.map((item, i) => {
          const state = i === stage ? "current" : i < stage ? "done" : "todo";
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onStep(i)}
                aria-current={state === "current" ? "step" : undefined}
                className="group flex min-h-11 w-full items-start gap-4 py-4 text-left outline-none transition-colors duration-[var(--motion-fast)] hover:bg-ink-200/40 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-700"
              >
                <span aria-hidden className={cn("nums w-8 shrink-0 font-display text-4xl font-semibold leading-none", state === "current" ? "text-brand-800" : "text-ink-600")}>
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={cn("block font-display text-lg leading-tight", state === "current" ? "font-semibold text-ink-900" : "font-medium text-ink-800")}>{item.title}</span>
                  <span className="mt-1 block text-sm text-ink-700 max-lg:hidden">{item.blurb}</span>
                </span>
                <span className={cn("inline-flex shrink-0 items-center gap-1 pt-1 text-sm font-medium", state === "current" ? "text-[#9a4a08]" : state === "done" ? "text-brand-800" : "text-ink-600")}>
                  {state === "done" ? <Check className="size-4" aria-hidden /> : null}
                  {state === "done" ? "Done" : state === "current" ? "Now" : "Next"}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
