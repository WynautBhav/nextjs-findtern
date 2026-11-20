import { CornerLink } from "@/components/app/tiles";
import { cn } from "@/lib/utils";
import { formatIstClock, shortDate } from "@/lib/format";

import { daysAway, type NextUp } from "./next-up";

/**
 * The "Next up" tile (the reference's time tracker): the one dated
 * thing coming, set as its date. Every word comes from a row; the only
 * motion is the dot, which pulses three times and then rests.
 */
export function NextUpTile({
  next,
  today,
  heading,
  detail,
  href,
  hrefLabel,
  children,
  strip = false,
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
  /** The tile runs the whole row (from `@4xl` of the page column): date on the left, the countdown and action on the right. */
  strip?: boolean;
}) {
  // Midday UTC is the same calendar day in India.
  const day = new Date(`${next.day}T12:00:00Z`);
  return (
    <section
      aria-labelledby="next-up-title"
      className="flex min-w-0 flex-col rounded-apple-xl border border-ink-200/70 bg-white p-5 lg:p-6"
    >
      <div className="mb-4 flex min-h-9 items-center justify-between gap-3">
        <h2 id="next-up-title" className="text-base font-medium text-ink-900">
          Next up
        </h2>
        <CornerLink href={href} label={hrefLabel} />
      </div>
      <div className={cn("flex flex-1 flex-col", strip && "@4xl:flex-row @4xl:items-end @4xl:justify-between @4xl:gap-8")}>
        <div className="min-w-0">
          <p className="text-sm text-ink-600">{heading}</p>
          <p className="mt-2 flex flex-wrap items-baseline gap-x-2">
            <time dateTime={next.at?.toISOString() ?? next.day} className="nums text-4xl font-medium tracking-tight text-ink-900">
              {shortDate(day, { day: "numeric", month: "short", timeZone: "UTC" })}
            </time>
            <span className="text-base text-ink-600">
              {shortDate(day, { weekday: "short", timeZone: "UTC" })}
              {next.kind === "interview" && next.at ? `, ${formatIstClock(next.at)}` : null}
            </span>
          </p>
          {detail ? <p className="mt-1 text-sm text-ink-600">{detail}</p> : null}
        </div>
        <div className={cn("mt-auto flex flex-col", strip && "@4xl:mt-0 @4xl:w-72 @4xl:shrink-0")}>
          <p className="flex items-center gap-2 pt-4 text-sm font-medium text-ink-900">
            <span aria-hidden className="size-2 rounded-full bg-accent-400" />
            {daysAway(today, next.day)}
          </p>
          {children ? <div className="mt-4">{children}</div> : null}
        </div>
      </div>
    </section>
  );
}
