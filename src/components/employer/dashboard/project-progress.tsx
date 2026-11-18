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
  /** Declined, withdrawn or expired: the hatched share of the bar. */
  declined: number;
  /** The one action for this project, or null when closed with nothing to do. */
  action: { label: string; href: string } | null;
  /** True from the 4th project: hide below `sm` so phones show 3 rows. */
  hiddenOnPhone: boolean;
};

const HATCH = "bg-[repeating-linear-gradient(135deg,var(--color-ink-300)_0_3px,transparent_3px_6px)]";

/**
 * One project as a row (an `<li>`: put it in a `<ul>`): its name, the real
 * split of its proposals as one segmented bar (hired solid, in play light,
 * declined hatched = "not yet"), the same numbers as words, and the one next
 * action. Segment widths are the counts; each grows from the left once on
 * first paint (CSS `starting:`, transform only, off under reduced motion).
 */
export function ProjectProgress({ id, name, closed, hired, open, declined, action, hiddenOnPhone }: ProjectProgressProps) {
  const total = hired + open + declined;
  const candidatesHref = `/employer/candidates?project=${encodeURIComponent(id)}`;
  const same = action?.href === candidatesHref;
  const parts = [
    { key: "hired", n: hired, label: "hired", bar: "bg-brand-700", text: "font-medium text-brand-700" },
    { key: "open", n: open, label: "open", bar: "bg-brand-300", text: "text-ink-900" },
    { key: "declined", n: declined, label: "declined", bar: HATCH, text: "text-text-subtle" },
  ].filter((p) => p.n > 0);
  const summary = total ? parts.map((p) => `${p.n} ${p.label}`).join(", ") : "No proposals yet";
  return (
    // The name's link stretches over the row; a different next action sits above it.
    <li className={cn("group relative py-3", hiddenOnPhone && "max-sm:hidden")}>
      <p className="flex items-start gap-2">
        <Link
          href={candidatesHref}
          className={cn(
            "line-clamp-2 min-w-0 break-words text-base font-medium leading-5 outline-none after:absolute after:inset-0 after:content-[''] focus-visible:after:rounded-lg focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-brand-500 group-hover:underline group-hover:underline-offset-4",
            closed ? "text-ink-600" : "text-ink-900",
          )}
        >
          {name}
        </Link>
        {closed ? <span className="inline-flex h-5 shrink-0 items-center rounded-full bg-ink-100 px-2 text-xs font-medium text-ink-700">Closed</span> : null}
      </p>

      {total === 0 ? (
        <div aria-hidden className={cn("mt-2.5 h-2.5 rounded-full border border-dashed border-ink-300")} />
      ) : (
        <div className="mt-2.5 flex h-2.5 gap-0.5" role="img" aria-label={summary}>
          {parts.map((p, i) => (
            <div
              key={p.key}
              className={cn(
                "h-full min-w-1.5 origin-left rounded-full transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] starting:scale-x-0 motion-reduce:transition-none",
                p.bar,
                closed && "opacity-60",
              )}
              style={{ flexGrow: p.n, flexBasis: 0, transitionDelay: `${i * 60}ms` }}
            />
          ))}
        </div>
      )}

      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-0 text-sm">
        <p className="nums text-text-subtle" aria-hidden={total ? true : undefined}>
          {total ? (
            parts.map((p, i) => (
              <span key={p.key} className="whitespace-nowrap">
                {i > 0 ? <span aria-hidden> · </span> : null}
                <span className={p.text}>
                  {p.n} {p.label}
                </span>
              </span>
            ))
          ) : (
            "No proposals yet"
          )}
        </p>
        {action ? (
          same ? (
            <span className="ml-auto inline-flex shrink-0 items-center gap-1 whitespace-nowrap font-medium text-ink-700">
              {action.label}
              <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden />
            </span>
          ) : (
            <Link
              href={action.href}
              className="relative z-10 -my-3 ml-auto inline-flex min-h-11 shrink-0 items-center gap-1 whitespace-nowrap rounded-md font-medium text-ink-800 outline-none transition-colors hover:text-brand-700 focus-visible:ring-2 focus-visible:ring-brand-500"
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
