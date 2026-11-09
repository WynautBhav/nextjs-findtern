import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import { SURFACE_CLASS } from "@/components/app/primitives";
import { cn } from "@/lib/utils";

/** The hatch for "not yet / never happened" on the employer charts: ink stripes on a pale ground. */
export const HATCH = "bg-[repeating-linear-gradient(135deg,var(--color-brand-400)_0_2px,var(--color-brand-100)_2px_6px)]";

/**
 * The card both dashboard charts sit in: white tile, title 16/600, one quiet
 * description line, and an optional corner link. `@container` lets the content
 * switch layout on the card's own width, not the viewport's (the card is 8
 * columns wide on desktop and full width on a phone).
 */
export function ChartCard({
  title,
  titleId,
  description,
  aside,
  link,
  className,
  children,
}: {
  title: string;
  titleId: string;
  description?: React.ReactNode;
  /** Right of the title: a legend. */
  aside?: React.ReactNode;
  link?: { href: string; label: string };
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={titleId} className={cn("@container flex h-full flex-col p-5 @xl:p-6", SURFACE_CLASS, className)}>
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 id={titleId} className="text-base font-semibold leading-6 text-ink-900">
            {title}
          </h2>
          {description ? <p className="mt-0.5 text-sm text-text-subtle">{description}</p> : null}
        </div>
        {aside ? <div className="shrink-0 pt-1">{aside}</div> : null}
        {link ? (
          <Link
            href={link.href}
            aria-label={link.label}
            className="-m-1.5 grid size-11 shrink-0 place-items-center rounded-full text-ink-700 transition-colors hover:bg-ink-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2"
          >
            <ArrowUpRight className="size-4" aria-hidden />
          </Link>
        ) : null}
      </header>
      {children}
    </section>
  );
}
