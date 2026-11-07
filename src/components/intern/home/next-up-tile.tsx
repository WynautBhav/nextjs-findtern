import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Surface } from "@/components/app/primitives";
import { buttonClass } from "@/components/ui/button";
import { formatIstClock, shortDate } from "@/lib/format";

import { daysAway, type NextUp } from "./next-up";

/**
 * "Next up": the one dated thing coming, in the same Surface voice as every
 * other card. Every word comes from a row (PRODUCT.md: no invented urgency).
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
  /** The tile's own primary action (Join for an interview). */
  children?: React.ReactNode;
}) {
  // Midday UTC is the same calendar day in India.
  const day = new Date(`${next.day}T12:00:00Z`);
  return (
    <Surface as="section" aria-labelledby="next-up-title" className="flex flex-col p-5 lg:p-6">
      <h2 id="next-up-title" className="text-base font-semibold text-ink-900">
        {heading}
      </h2>
      <p className="mt-2 flex flex-wrap items-baseline gap-x-2">
        <time dateTime={next.at?.toISOString() ?? next.day} className="nums text-2xl font-semibold tracking-tight text-ink-900">
          {shortDate(day, { day: "numeric", month: "short", timeZone: "UTC" })}
        </time>
        <span className="text-sm text-text-subtle">
          {shortDate(day, { weekday: "short", timeZone: "UTC" })}
          {next.kind === "interview" && next.at ? `, ${formatIstClock(next.at)}` : null}
          {" · "}
          {daysAway(today, next.day)}
        </span>
      </p>
      {detail ? <p className="mt-1 text-sm text-text-subtle">{detail}</p> : null}
      <div className="mt-4">
        {children ?? (
          <Link href={href} className={buttonClass({ className: "max-sm:w-full" })}>
            {hrefLabel}
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        )}
      </div>
    </Surface>
  );
}
