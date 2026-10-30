import { CornerLink } from "@/components/app/tiles";
import { formatIstClock, shortDate } from "@/lib/format";

import { daysAway, type NextUp } from "./next-up";

/**
 * The dark "Next up" tile (the reference's time tracker): the one dated
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
    <section
      aria-labelledby="next-up-title"
      className="flex min-w-0 flex-col rounded-apple-xl bg-brand-950 p-5 text-white shadow-tile-brand lg:p-6"
    >
      <div className="mb-4 flex min-h-9 items-center justify-between gap-3">
        <h2 id="next-up-title" className="text-base font-medium text-white/85">
          Next up
        </h2>
        <CornerLink href={href} label={hrefLabel} onDark />
      </div>
      <p className="text-sm text-white/75">{heading}</p>
      <p className="mt-2 flex flex-wrap items-baseline gap-x-2">
        <time dateTime={next.at?.toISOString() ?? next.day} className="nums text-4xl font-medium tracking-tight">
          {shortDate(day, { day: "numeric", month: "short", timeZone: "UTC" })}
        </time>
        <span className="text-base text-white/70">
          {shortDate(day, { weekday: "short", timeZone: "UTC" })}
          {next.kind === "interview" && next.at ? `, ${formatIstClock(next.at)}` : null}
        </span>
      </p>
      {detail ? <p className="mt-1 text-sm text-white/75">{detail}</p> : null}
      <p className="mt-auto flex items-center gap-2 pt-4 text-sm font-medium">
        <span
          aria-hidden
          className="size-2 rounded-full bg-accent-400 motion-safe:animate-pulse-dot motion-safe:[animation-iteration-count:3]"
        />
        {daysAway(today, next.day)}
      </p>
      {children ? <div className="mt-4">{children}</div> : null}
    </section>
  );
}
