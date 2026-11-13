import Link from "next/link";
import { ArrowRight, Check, ChevronDown } from "lucide-react";

import type { CompletionItem } from "@/lib/onboarding";
import { cn } from "@/lib/utils";

/**
 * Profile completeness, from the same rule the payment gate uses
 * (`profileCompletion` in lib/onboarding). One rule, so this list can never
 * say "complete" while activation still refuses (INT-20).
 */
export function CompletionList({
  completion,
  className,
}: {
  completion: { items: CompletionItem[]; done: number; total: number; complete: boolean };
  className?: string;
}) {
  const pct = completion.total ? Math.round((completion.done / completion.total) * 100) : 0;
  const left = completion.total - completion.done;
  // What is missing is the list; what is done folds away, so on a phone the preview is not pushed far down.
  const todo = completion.items.filter((i) => !i.done);
  const done = completion.items.filter((i) => i.done);
  return (
    <section data-first-content aria-labelledby="completion-head" className={cn("border-b border-ink-200/70 pb-6", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="completion-head" className="text-base font-semibold tracking-[-0.01em] text-ink-900">
          {left === 1 ? "1 thing left to add" : `${left} things left to add`}
        </h2>
        <p className="nums text-sm font-semibold text-ink-900">
          {pct}%<span className="sr-only"> complete</span>
        </p>
      </div>
      <div aria-hidden className="mt-3 h-1.5 overflow-hidden rounded-full bg-ink-200">
        <div className="h-full rounded-full bg-brand-600" style={{ width: `${pct}%` }} />
      </div>
      <ul className="mt-3 divide-y divide-ink-100">
        {todo.map((item) => (
          <li key={item.id}>
            <Link href={item.href} className="group flex min-h-11 items-center gap-3 py-1.5 text-sm font-medium text-ink-900 hover:text-brand-700">
              <span aria-hidden className="size-5 shrink-0 rounded-full border-2 border-ink-300" />
              <span className="flex-1">{item.label}</span>
              <ArrowRight className="size-4 text-ink-500 group-hover:text-brand-700" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
      {done.length > 0 ? (
        <details className="group mt-1">
          <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 rounded-md text-sm font-medium text-ink-700 outline-none hover:text-ink-900 focus-visible:ring-2 focus-visible:ring-brand-500 [&::-webkit-details-marker]:hidden">
            <Check className="size-4 text-brand-700" strokeWidth={2.5} aria-hidden />
            {done.length} done
            <ChevronDown className="size-4 transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden />
          </summary>
          <ul className="divide-y divide-ink-100">
            {done.map((item) => (
              <li key={item.id} className="flex min-h-10 items-center gap-3 py-1.5 text-sm text-ink-600">
                <span aria-hidden className="grid size-5 shrink-0 place-items-center rounded-full bg-brand-600 text-white">
                  <Check className="size-3" strokeWidth={3} />
                </span>
                {item.label}
                <span className="sr-only"> (done)</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
