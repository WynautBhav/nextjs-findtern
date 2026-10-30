import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";

import { Surface } from "@/components/app/primitives";
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
  return (
    <Surface as="section" aria-labelledby="completion-head" className={cn("p-5", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="completion-head" className="text-base font-semibold tracking-[-0.01em] text-ink-900">
          Profile completeness
        </h2>
        <p className="nums text-sm font-semibold text-ink-900">
          {pct}%<span className="sr-only"> complete</span>
        </p>
      </div>
      <ul className="mt-3 divide-y divide-ink-100">
        {completion.items.map((item) => (
          <li key={item.id}>
            {item.done ? (
              <p className="flex min-h-11 items-center gap-3 py-1.5 text-sm text-ink-600">
                <span aria-hidden className="grid size-5 shrink-0 place-items-center rounded-full bg-brand-600 text-white">
                  <Check className="size-3" strokeWidth={3} />
                </span>
                {item.label}
                <span className="sr-only"> (done)</span>
              </p>
            ) : (
              <Link
                href={item.href}
                className="group flex min-h-11 items-center gap-3 py-1.5 text-sm font-medium text-ink-900 hover:text-brand-700"
              >
                <span aria-hidden className="size-5 shrink-0 rounded-full border-2 border-ink-200" />
                <span className="flex-1">{item.label}</span>
                <ArrowRight className="size-4 text-ink-300 group-hover:text-brand-700" aria-hidden />
              </Link>
            )}
          </li>
        ))}
      </ul>
    </Surface>
  );
}
