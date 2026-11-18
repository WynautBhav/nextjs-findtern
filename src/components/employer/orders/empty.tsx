import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";

import { ButtonLink } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Empty state for the Orders tabs: a white card like every other card on the
 * page, one tinted icon tile, a heading, one readable sentence, what happens
 * next, and one filled button. `steps` draws the path as numbered chips so the
 * card is not a lone sentence in an empty box. Pass no icon and no button for a
 * search that matched nothing.
 */
export function OrdersEmpty({
  icon,
  title,
  body,
  steps,
  hint,
  next,
  compact = false,
}: {
  icon?: ReactNode;
  title: string;
  body: string;
  /** The path to the first row, in order. */
  steps?: string[];
  /** One line on what to do, when there are no steps. */
  hint?: string;
  next?: { label: string; href: string };
  compact?: boolean;
}) {
  return (
    <section className={cn("flex flex-col items-center rounded-2xl border border-ink-200 bg-white px-5 text-center shadow-xs sm:px-8", compact ? "py-10" : "py-12 sm:py-14")}>
      {icon ? (
        <span aria-hidden className="mb-4 grid size-14 place-items-center rounded-2xl bg-brand-100 text-brand-700 ring-1 ring-inset ring-brand-200 [&>svg]:size-7">
          {icon}
        </span>
      ) : null}
      <h2 className="text-balance text-xl font-bold tracking-[-0.01em] text-ink-900">{title}</h2>
      <p className="mt-2 max-w-lg text-pretty text-[15px] leading-relaxed text-ink-700">{body}</p>
      {steps ? (
        <ol className="mt-6 grid w-full max-w-2xl gap-2 text-left sm:grid-cols-3">
          {steps.map((s, i) => (
            <li key={s} className="flex items-start gap-3 rounded-xl border border-ink-200 bg-ink-50/60 p-3.5 text-sm font-medium text-ink-900">
              <span aria-hidden className="nums grid size-6 shrink-0 place-items-center rounded-full bg-brand-700 text-xs font-bold text-white">
                {i + 1}
              </span>
              <span className="pt-0.5">{s}</span>
            </li>
          ))}
        </ol>
      ) : hint ? (
        <p className="mt-4 rounded-full bg-brand-50 px-3.5 py-1.5 text-sm font-medium text-brand-800 ring-1 ring-inset ring-brand-200/70">{hint}</p>
      ) : null}
      {next ? (
        <ButtonLink href={next.href} variant="primary" className="mt-6">
          {next.label}
          <ArrowRight className="size-4" aria-hidden />
        </ButtonLink>
      ) : null}
    </section>
  );
}
