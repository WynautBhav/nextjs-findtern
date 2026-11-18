import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";

import { ButtonLink } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Empty state for the Orders tabs: left-aligned on a hairline, the title as the statement, one readable sentence, then
 * the path to the first row as a ruled list (`steps`) or a single `hint`, and the next action. `primary` is false when
 * the page header already carries the one filled button (a payment is due). Pass no `next` for a search that matched nothing.
 */
export function OrdersEmpty({
  title,
  body,
  steps,
  hint,
  next,
  primary = true,
  compact = false,
}: {
  /** Kept for callers that still pass one; the state is typographic, no icon tile. */
  icon?: ReactNode;
  title: string;
  body: string;
  /** The path to the first row, in order. */
  steps?: string[];
  /** One line on what to do, when there are no steps. */
  hint?: string;
  next?: { label: string; href: string };
  primary?: boolean;
  compact?: boolean;
}) {
  return (
    <section className={cn("max-w-2xl border-t border-ink-200", compact ? "py-6" : "py-8")}>
      <h2 className="text-balance font-display text-2xl font-semibold tracking-[-0.02em] text-ink-900">{title}</h2>
      <p className="mt-2 max-w-lg text-pretty text-base text-ink-700">{body}</p>
      {steps ? (
        <ol className="mt-6 divide-y divide-ink-200 border-y border-ink-200">
          {steps.map((s, i) => (
            <li key={s} className="flex items-baseline gap-4 py-3">
              <span aria-hidden className="nums w-5 font-display text-lg font-semibold text-ink-600">
                {i + 1}
              </span>
              <span className="text-base text-ink-900">{s}</span>
            </li>
          ))}
        </ol>
      ) : hint ? (
        <p className="mt-4 text-sm font-medium text-ink-800">{hint}</p>
      ) : null}
      {next ? (
        <ButtonLink href={next.href} variant={primary ? "primary" : "outline"} size="md" className="mt-6">
          {next.label}
          <ArrowRight className="size-4" aria-hidden />
        </ButtonLink>
      ) : null}
    </section>
  );
}
