import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { cn } from "@/lib/utils";

export type ProjectProgressProps = {
  id: string;
  name: string;
  /** Not open for hiring (closed, taken down). */
  closed: boolean;
  hired: number;
  /** Offers in play (awaiting a reply or accepted). */
  open: number;
  /** Declined, withdrawn or expired. */
  declined: number;
  /** The one action for this project, or null when closed with nothing to do. */
  action: { label: string; href: string } | null;
  /** True from the 4th project: hide below `sm` so phones show 3 rows. */
  hiddenOnPhone: boolean;
};

/**
 * One project as a ruled row (an `<li>`: put it in a `<ul>`): its name, what its proposals add up
 * to in words (2 hired, 1 offer open, 1 declined), and the one next action. The name links to its
 * candidates; a different action sits above that link.
 */
export function ProjectProgress({ id, name, closed, hired, open, declined, action, hiddenOnPhone }: ProjectProgressProps) {
  const candidatesHref = `/employer/candidates?project=${encodeURIComponent(id)}`;
  const same = action?.href === candidatesHref;
  const parts = [
    hired ? { key: "hired", text: `${hired} hired`, strong: true } : null,
    open ? { key: "open", text: `${open} ${open === 1 ? "offer" : "offers"} open`, strong: false } : null,
    declined ? { key: "declined", text: `${declined} declined`, strong: false } : null,
  ].filter((p): p is { key: string; text: string; strong: boolean } => p !== null);
  const num = (n: number) => (n > 0 ? n : <span className="text-ink-600" aria-label="none">–</span>);
  return (
    <li className={cn("group relative grid gap-x-4 border-b border-ink-200 py-3.5 sm:grid-cols-[minmax(0,1fr)_5rem_5rem_5rem_10rem] sm:items-center", hiddenOnPhone && "max-sm:hidden")}>
      <p className="flex min-w-0 items-start gap-2">
        <Link
          href={candidatesHref}
          className={cn(
            "line-clamp-2 min-w-0 break-words text-base font-medium outline-none after:absolute after:inset-0 after:content-[''] focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-brand-700 group-hover:underline group-hover:underline-offset-4",
            closed ? "text-ink-700" : "text-ink-900",
          )}
        >
          {name}
        </Link>
        {closed ? <span className="inline-flex h-5 shrink-0 items-center rounded-md bg-ink-100 px-2 text-xs font-medium text-ink-700">Closed</span> : null}
      </p>

      {/* From sm: the three counts as ruled columns, so projects can be read across. */}
      <span className="nums hidden text-right font-display text-lg font-semibold text-brand-800 sm:block">{num(hired)}</span>
      <span className="nums hidden text-right font-display text-lg font-semibold text-ink-900 sm:block">{num(open)}</span>
      <span className="nums hidden text-right font-display text-lg font-semibold text-ink-700 sm:block">{num(declined)}</span>

      <div className="mt-1 flex flex-wrap items-center justify-between gap-x-4 text-sm sm:mt-0 sm:justify-end">
        <p className="nums text-ink-700 sm:sr-only">
          {parts.length
            ? parts.map((p, i) => (
                <span key={p.key} className="whitespace-nowrap">
                  {i > 0 ? <span aria-hidden> · </span> : null}
                  <span className={p.strong ? "font-semibold text-brand-800" : undefined}>{p.text}</span>
                </span>
              ))
            : "No proposals yet"}
        </p>
        {action ? (
          same ? (
            <span className="ml-auto inline-flex shrink-0 items-center gap-1 whitespace-nowrap font-medium text-ink-900">
              {action.label}
              <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden />
            </span>
          ) : (
            <Link
              href={action.href}
              className="relative z-10 -my-2.5 ml-auto inline-flex min-h-11 shrink-0 items-center gap-1 whitespace-nowrap rounded-md font-medium text-ink-900 outline-none transition-colors hover:text-brand-700 focus-visible:ring-2 focus-visible:ring-brand-700"
            >
              {action.label}
              <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          )
        ) : null}
      </div>
    </li>
  );
}
