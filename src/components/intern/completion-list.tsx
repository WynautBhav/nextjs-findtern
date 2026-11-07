import Link from "next/link";
import { Check } from "lucide-react";

import { Surface } from "@/components/app/primitives";
import { buttonClass } from "@/components/ui/button";
import type { CompletionItem } from "@/lib/onboarding";
import { cn } from "@/lib/utils";
import { completionWhy } from "./completion-why";

/**
 * Profile completeness, from the same rule the payment gate uses
 * (`profileCompletion` in lib/onboarding). One rule, so this list can never
 * say "complete" while activation still refuses (INT-20). Each open step says
 * why it matters; one primary button resumes the form at the first open step.
 */
export function CompletionList({
  completion,
  className,
}: {
  completion: { items: CompletionItem[]; done: number; total: number; complete: boolean };
  className?: string;
}) {
  const pct = completion.total ? Math.round((completion.done / completion.total) * 100) : 0;
  const open = completion.items.filter((i) => !i.done);
  const doneItems = completion.items.filter((i) => i.done);
  const first = open[0];
  return (
    <Surface as="section" aria-labelledby="completion-head" className={cn("p-5", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="completion-head" className="text-base font-semibold text-ink-900">
          Finish your profile
        </h2>
        <p className="nums text-sm font-semibold text-ink-900">
          {completion.done} of {completion.total}
          <span className="sr-only"> steps done, {pct}%</span>
        </p>
      </div>
      <div
        role="progressbar"
        aria-label="Profile steps done"
        aria-valuemin={0}
        aria-valuemax={completion.total}
        aria-valuenow={completion.done}
        className="mt-3 h-2 overflow-hidden rounded-full bg-ink-100"
      >
        <span className="block h-full rounded-full bg-brand-700" style={{ width: `${pct}%` }} />
      </div>
      {first ? (
        <Link href={first.href} className={buttonClass({ className: "mt-4 w-full" })}>
          Continue: {completionWhy(first.id).label ?? first.label}
        </Link>
      ) : null}
      <ul className="mt-3 divide-y divide-ink-100">
        {open.map((item) => {
          const w = completionWhy(item.id);
          return (
            <li key={item.id} className="flex gap-3 py-3">
              <span aria-hidden className="mt-0.5 size-5 shrink-0 rounded-full border-2 border-ink-300" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink-900">
                  {w.label ?? item.label}
                  <span className="sr-only"> (still needed)</span>
                </p>
                <p className="text-sm text-text-subtle">{w.why}</p>
              </div>
            </li>
          );
        })}
      </ul>
      {doneItems.length > 0 ? (
        <details className="mt-1 border-t border-ink-100">
          <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium text-ink-700">
            {doneItems.length} done
          </summary>
          <ul className="pb-2">
            {doneItems.map((item) => (
              <li key={item.id} className="flex min-h-9 items-center gap-3 text-sm text-ink-600">
                <span aria-hidden className="grid size-5 shrink-0 place-items-center rounded-full bg-brand-700 text-white">
                  <Check className="size-3" strokeWidth={3} />
                </span>
                {completionWhy(item.id).label ?? item.label}
                <span className="sr-only"> (done)</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </Surface>
  );
}
