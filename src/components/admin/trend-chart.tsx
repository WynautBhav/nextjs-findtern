"use client";

import { useId, useState } from "react";

import { cn } from "@/lib/utils";

/**
 * Trend chart - six months, two series, hand-built SVG.
 *
 * **Why no chart library:** the dashboard needs exactly one line chart.
 * Recharts/Chart.js would add ~90KB to a page whose entire job is to load fast.
 * The project's own UX skill agrees - under 1000 points, SVG is the
 * recommended tier, and this is 12 numbers.
 *
 * **Why a line chart and not bars:** the skill's chart guidance maps
 * "trend over time" to a line, with bars reserved for categorical comparison.
 * Six months is a time axis, so it is a line.
 *
 * **Why the two series are not distinguished by colour alone:** the skill
 * requires a second, non-colour channel. Proposals are a solid 2px stroke,
 * interviews are dashed - which stays readable in greyscale, in forced-colours
 * mode, and for a colour-blind reader. Direct end-labels mean neither series
 * needs to be looked up in a legend.
 *
 * **Why there is no `<title>` inside the SVG:** it caused a hydration
 * mismatch. The HTML parser does not allow `<title>` inside `<rect>`, so React
 * SSR emitted it and the browser foster-parented it out of the `<g>`, producing
 * "May" as stray text and a full client re-render. Tooltips are therefore an
 * HTML overlay of real buttons, which also makes them keyboard reachable.
 */

export type TrendPoint = {
  label: string;
  proposals: number;
  interviews: number;
};

/** "27 Jul 2026" → "27 Jul"; month-only labels ("Jul") pass through. */
function shortLabel(label: string): string {
  const match = label.match(/^(\d{1,2})\s+([A-Za-z]{3})/);
  return match ? `${match[1]} ${match[2]}` : label;
}

const SERIES = [
  {
    key: "proposals" as const,
    label: "Proposals",
    /** Solid - the non-colour channel for series one. */
    stroke: "var(--color-brand-600)",
    dash: undefined as string | undefined,
  },
  {
    key: "interviews" as const,
    label: "Interviews",
    /** Dashed - readable without relying on amber. */
    stroke: "var(--color-accent-700)",
    dash: "5 4",
  },
];

export function TrendChart({
  data,
  className,
  height = 220,
}: {
  data: TrendPoint[];
  className?: string;
  height?: number;
}) {
  const [active, setActive] = useState<number | null>(null);
  const clipId = useId();

  if (data.length < 2) {
    return (
      <p className="py-12 text-center text-sm text-text-subtle">
        Not enough activity to chart yet - at least two months are needed.
      </p>
    );
  }

  const axisMax = niceCeil(
    Math.max(1, ...data.flatMap((d) => [d.proposals, d.interviews])),
  );

  // viewBox is 0 0 100 100; x runs 0→100, y is inverted so 0 sits at the bottom.
  const x = (index: number) => (index / (data.length - 1)) * 100;
  const y = (value: number) => 100 - (value / axisMax) * 100;

  const path = (key: "proposals" | "interviews") =>
    data.map((point, index) => `${index === 0 ? "M" : "L"}${x(index)},${y(point[key])}`).join(" ");

  const areaPath = `${path("proposals")} L100,100 L0,100 Z`;

  // Four horizontal gridlines, labelled, so bar/line heights are readable
  // against numbers rather than vibes.
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((fraction) => ({
    value: Math.round(axisMax * (1 - fraction)),
    at: fraction * 100,
  }));

  return (
    <figure className={cn("w-full", className)}>
      {/* Legend - direct series labels, doubling as the key ---------------- */}
      <figcaption className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
        {SERIES.map((series) => (
          <span
            key={series.key}
            className="flex items-center gap-1.5 text-xs font-medium text-ink-600"
          >
            <svg aria-hidden viewBox="0 0 24 8" className="h-2 w-6 shrink-0">
              <line
                x1="0"
                y1="4"
                x2="24"
                y2="4"
                stroke={series.stroke}
                strokeWidth="2.5"
                strokeLinecap="round"
                {...(series.dash ? { strokeDasharray: series.dash } : {})}
              />
            </svg>
            {series.label}
          </span>
        ))}
      </figcaption>

      <div className="flex gap-2.5">
        {/* Y axis ------------------------------------------------------- */}
        <div
          aria-hidden
          className="flex shrink-0 flex-col justify-between py-px text-right text-2xs text-ink-400 tabular-nums"
          style={{ height }}
        >
          {ticks.map((tick) => (
            <span key={tick.value}>{tick.value}</span>
          ))}
        </div>

        {/* Plot ---------------------------------------------------------- */}
        <div className="relative min-w-0 flex-1" style={{ height }}>
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="absolute inset-0 h-full w-full overflow-visible"
            role="presentation"
          >
            <defs>
              <clipPath id={clipId}>
                <rect x="0" y="0" width="100" height="100" />
              </clipPath>
              <linearGradient id={`${clipId}-fill`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-brand-600)" stopOpacity="0.14" />
                <stop offset="100%" stopColor="var(--color-brand-600)" stopOpacity="0" />
              </linearGradient>
            </defs>

            {/* Gridlines */}
            {ticks.map((tick) => (
              <line
                key={tick.at}
                x1="0"
                y1={tick.at}
                x2="100"
                y2={tick.at}
                stroke="var(--color-ink-200)"
                strokeWidth="0.5"
                vectorEffect="non-scaling-stroke"
              />
            ))}

            <g clipPath={`url(#${clipId})`}>
              {/* Soft area under the primary series, for weight. */}
              <path d={areaPath} fill={`url(#${clipId}-fill)`} />

              {SERIES.map((series) => (
                <path
                  key={series.key}
                  d={path(series.key)}
                  fill="none"
                  stroke={series.stroke}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                  {...(series.dash ? { strokeDasharray: series.dash } : {})}
                />
              ))}
            </g>

            {/* Points. `r` in a non-uniform viewBox would distort, so circles
                are drawn in HTML overlay instead - see below. */}
          </svg>

          {/* Hover / focus targets ---------------------------------------- */}
          <div className="absolute inset-0 flex">
            {data.map((point, index) => (
              <button
                key={point.label}
                type="button"
                onMouseEnter={() => setActive(index)}
                onMouseLeave={() => setActive(null)}
                onFocus={() => setActive(index)}
                onBlur={() => setActive(null)}
                aria-label={`${point.label}: ${point.proposals} proposals, ${point.interviews} interviews`}
                className="group relative flex-1 cursor-pointer rounded focus-visible:outline-2"
              >
                {active === index ? (
                  <>
                    {SERIES.map((series) => (
                      <span
                        key={series.key}
                        aria-hidden
                        className="pointer-events-none absolute left-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-sm"
                        style={{
                          top: `${(y(point[series.key]) / 100) * 100}%`,
                          backgroundColor: series.stroke,
                        }}
                      />
                    ))}
                  </>
                ) : null}
              </button>
            ))}
          </div>

          {/* Tooltip -------------------------------------------------------- */}
          {active !== null ? (
            <Tooltip point={data[active]} xPercent={x(active)} />
          ) : null}
        </div>
      </div>

      {/* X axis ---------------------------------------------------------- */}
      {/* Twelve labels collide below the sidebar breakpoint, so phones show
          every third label and tablets every second. The sr-only table below
          still carries every point. */}
      <div className="mt-2 flex gap-2.5">
        <div className="shrink-0" />
        <div className="flex flex-1">
          {data.map((point, index) => (
            <span
              key={point.label}
              className={cn(
                "flex-1 text-center text-2xs whitespace-nowrap transition-colors lg:text-xs",
                index % 3 !== 0 && "max-sm:invisible",
                index % 2 !== 0 && "max-lg:sm:invisible",
                active === index ? "font-semibold text-ink-900" : "text-text-subtle",
              )}
            >
              {shortLabel(point.label)}
            </span>
          ))}
        </div>
      </div>

      {/* Screen-reader fallback: the same numbers, always available. ------- */}
      <table className="sr-only">
        <caption>
          Activity over the last {data.length} months
        </caption>
        <thead>
          <tr>
            <th scope="col">Month</th>
            <th scope="col">Proposals</th>
            <th scope="col">Interviews</th>
          </tr>
        </thead>
        <tbody>
          {data.map((point) => (
            <tr key={point.label}>
              <th scope="row">{point.label}</th>
              <td>{point.proposals}</td>
              <td>{point.interviews}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

/**
 * Tooltip, flipped to the left near the right edge so it never leaves the card.
 * `pointer-events-none` keeps it from stealing hover from the button beneath it.
 */
function Tooltip({ point, xPercent }: { point: TrendPoint; xPercent: number }) {
  const flip = xPercent > 62;
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "pointer-events-none absolute -top-1 z-10 w-max max-w-[11rem] -translate-y-full rounded-lg border border-ink-200 bg-white px-2.5 py-2 shadow-md",
        flip ? "-translate-x-full" : "-translate-x-1/2",
      )}
      style={{ left: `${xPercent}%` }}
    >
      <p className="text-2xs font-semibold tracking-wide text-ink-500 uppercase">
        {point.label}
      </p>
      <dl className="mt-1 flex flex-col gap-0.5">
        {SERIES.map((series) => (
          <div key={series.key} className="flex items-center justify-between gap-3">
            <dt className="flex items-center gap-1.5 text-xs text-ink-600">
              <span
                aria-hidden
                className="size-2 rounded-sm"
                style={{ backgroundColor: series.stroke }}
              />
              {series.label}
            </dt>
            <dd className="text-xs font-semibold text-ink-900 tabular-nums">
              {point[series.key]}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Rounds up to 1/2/5 × 10ⁿ so axis labels stay round. */
function niceCeil(value: number): number {
  if (value <= 1) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalised = value / magnitude;
  const step = normalised <= 1 ? 1 : normalised <= 2 ? 2 : normalised <= 5 ? 5 : 10;
  return step * magnitude;
}

/**
 * Pipeline bars - one horizontal bar per status, in a fixed declared order.
 *
 * Not sorted by count: "sent" is always first and "withdrawn" always last, so
 * the widget does not reshuffle itself every time a proposal changes state.
 */
export function PipelineBars({
  items,
  className,
}: {
  items: { status: string; count: number; label?: string }[];
  className?: string;
}) {
  const total = items.reduce((sum, item) => sum + item.count, 0);
  const max = Math.max(1, ...items.map((item) => item.count));

  return (
    <ul className={cn("flex flex-col gap-3", className)}>
      {items.map((item) => (
        <li key={item.status}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-xs font-medium text-ink-700">
              {item.label ?? item.status}
            </span>
            <span className="text-xs text-text-subtle tabular-nums">
              {item.count.toLocaleString("en-IN")}
              {total > 0 ? (
                <span className="ml-1.5 text-ink-400">
                  {Math.round((item.count / total) * 100)}%
                </span>
              ) : null}
            </span>
          </div>
          <div
            aria-hidden
            className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-ink-100"
          >
            <div
              className={cn(
                "h-full rounded-full bg-brand-600",
                "motion-safe:transition-[width] motion-safe:duration-500",
              )}
              style={{ width: `${(item.count / max) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
