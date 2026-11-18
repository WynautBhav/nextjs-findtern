import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { formatIstClock, shortDate } from "@/lib/format";

import { daysAway, type NextUp } from "./next-up";

/**
 * Next up: the one dated thing coming, set as its date. The day is the page's signature, so it is the largest thing
 * in the column; a ruled line under it says how far away it is. Every word comes from a row.
 */
export function NextUpTile({
  next,
  today,
  heading,
  detail,
  href,
  hrefLabel,
  children,
}: {
  next: NextUp;
  /** India-time today, `YYYY-MM-DD`. */
  today: string;
  heading: string;
  detail?: string;
  href: string;
  hrefLabel: string;
  /** The tile's own action (Join for an interview). */
  children?: React.ReactNode;
}) {
  // Midday UTC is the same calendar day in India.
  const day = new Date(`${next.day}T12:00:00Z`);
  return (
    <section aria-labelledby="next-up-title" className="min-w-0">
      <div className="mb-3 flex items-baseline justify-between gap-4 border-b border-ink-200 pb-2">
        <h2 id="next-up-title" className="font-display text-lg font-semibold text-ink-900">
          Next up
        </h2>
        <Link href={href} className="inline-flex min-h-8 items-center gap-1 text-sm font-medium text-brand-800 underline-offset-4 hover:underline touch:min-h-11">
          {hrefLabel}
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>
      <p className="text-sm text-ink-700">{heading}</p>
      <p className="mt-1 flex flex-wrap items-baseline gap-x-3">
        <time dateTime={next.at?.toISOString() ?? next.day} className="nums font-display text-4xl font-semibold leading-none tracking-[-0.03em] text-ink-900">
          {shortDate(day, { day: "numeric", month: "short", timeZone: "UTC" })}
        </time>
        <span className="text-base text-ink-700">
          {shortDate(day, { weekday: "short", timeZone: "UTC" })}
          {next.kind === "interview" && next.at ? `, ${formatIstClock(next.at)}` : null}
        </span>
      </p>
      {detail ? <p className="mt-2 text-sm text-ink-700">{detail}</p> : null}
      <p className="mt-3 text-sm font-medium text-signal">{daysAway(today, next.day)}</p>
      {children ? <div className="mt-4">{children}</div> : null}
    </section>
  );
}
