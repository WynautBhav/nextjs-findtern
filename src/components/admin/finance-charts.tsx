"use client";

import { useId, useState } from "react";

import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/format";

/**
 * Finance charts for the ledger - hand-built SVG, no chart library.
 *
 * Same reasoning as `TrendChart`: two tiny datasets (6 months, 7 days) do not
 * justify ~90KB of Recharts. `RevenueChart` is a monthly collected-revenue
 * area; `VolumeBars` is daily transaction counts. Both pair every value with
 * a keyboard-reachable target and a screen-reader table, and neither relies
 * on colour alone (values are printed on the axis / bars).
 */

export type RevenuePoint = { label: string; totalMinor: number };
export type VolumePoint = { label: string; count: number; totalMinor: number };


export function RevenueChart({ data }: { data: RevenuePoint[] }) {
  const [active, setActive] = useState<number | null>(null);
  const clipId = useId();
  const stroke = "var(--color-brand-600)";

  // A flat line at zero reads as a broken chart, so an all-zero series gets
  // the same empty state as a too-short one.
  if (data.length < 2 || data.every((d) => d.totalMinor === 0)) {
    return (
      <p className="py-12 text-center text-sm text-ink-600">
        Not enough revenue history to chart yet.
      </p>
    );
  }

  const axisMax = niceCeil(Math.max(1, ...data.map((d) => d.totalMinor)));
  const x = (index: number) => (index / (data.length - 1)) * 100;
  const y = (value: number) => 100 - (value / axisMax) * 100;
  const line = data.map((p, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(p.totalMinor)}`).join(" ");
  const area = `${line} L100,100 L0,100 Z`;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => ({ at: f * 100, value: axisMax * (1 - f) }));

  return (
    <figure className="w-full">
      <div className="flex gap-2.5">
        <div aria-hidden className="flex h-52 shrink-0 flex-col justify-between py-px text-right text-xs text-ink-600 tabular-nums">
          {ticks.map((tick) => (
            <span key={tick.at}>{formatMoney(tick.value, "INR", { short: true, zeroLabel: false })}</span>
          ))}
        </div>
        <div className="relative h-52 min-w-0 flex-1">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" role="presentation">
            <defs>
              <clipPath id={clipId}>
                <rect x="0" y="0" width="100" height="100" />
              </clipPath>
              <linearGradient id={`${clipId}-fill`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-brand-600)" stopOpacity="0.16" />
                <stop offset="100%" stopColor="var(--color-brand-600)" stopOpacity="0" />
              </linearGradient>
            </defs>
            {ticks.map((tick) => (
              <line key={tick.at} x1="0" y1={tick.at} x2="100" y2={tick.at} stroke="var(--color-ink-200)" strokeWidth="0.5" vectorEffect="non-scaling-stroke" />
            ))}
            <g clipPath={`url(#${clipId})`}>
              <path d={area} fill={`url(#${clipId}-fill)`} />
              <path d={line} fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            </g>
          </svg>
          <div className="absolute inset-0 flex">
            {data.map((point, index) => (
              <button
                key={point.label}
                type="button"
                onMouseEnter={() => setActive(index)}
                onMouseLeave={() => setActive(null)}
                onFocus={() => setActive(index)}
                onBlur={() => setActive(null)}
                aria-label={`${point.label}: ${formatMoney(point.totalMinor, "INR", { short: true, zeroLabel: false })} collected`}
                className="group relative flex-1 cursor-pointer rounded focus-visible:outline-2"
              >
                {active === index ? (
                  <span aria-hidden className="pointer-events-none absolute left-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-sm" style={{ top: `${y(point.totalMinor)}%`, backgroundColor: stroke }} />
                ) : null}
              </button>
            ))}
          </div>
          {active !== null ? (
            <div role="status" className={cn("pointer-events-none absolute -top-1 z-10 w-max max-w-44 -translate-y-full rounded-lg border border-ink-200 bg-white px-2.5 py-2 shadow-md", x(active) > 62 ? "-translate-x-full" : "-translate-x-1/2")} style={{ left: `${x(active)}%` }}>
              <p className="text-xs font-semibold tracking-wide text-ink-600 uppercase">{data[active].label}</p>
              <p className="mt-0.5 text-sm font-bold text-ink-900 tabular-nums">{formatMoney(data[active].totalMinor, "INR", { short: true, zeroLabel: false })}</p>
            </div>
          ) : null}
        </div>
      </div>
      <div className="mt-2 flex">
        <div className="flex flex-1">
          {data.map((point, index) => (
            <span key={point.label} className={cn("flex-1 text-center text-xs", active === index ? "font-semibold text-ink-900" : "text-ink-600")}>
              {point.label}
            </span>
          ))}
        </div>
      </div>
      <table className="sr-only">
        <caption>Collected revenue by month</caption>
        <tbody>
          {data.map((point) => (
            <tr key={point.label}>
              <th scope="row">{point.label}</th>
              <td>{point.totalMinor}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

export function VolumeBars({ data }: { data: VolumePoint[] }) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.count));

  if (data.length === 0 || data.every((d) => d.count === 0)) {
    return (
      <p className="py-12 text-center text-sm text-ink-600">
        Not enough transaction history to chart yet.
      </p>
    );
  }

  return (
    <figure className="w-full">
      <div className="flex h-52 items-end gap-2" role="group" aria-label="Daily transaction volume, last 7 days">
        {data.map((point, index) => (
          <button
            key={point.label}
            type="button"
            onMouseEnter={() => setActive(index)}
            onMouseLeave={() => setActive(null)}
            onFocus={() => setActive(index)}
            onBlur={() => setActive(null)}
            aria-label={`${point.count} ${point.count === 1 ? "transaction" : "transactions"} ${point.label}, ${formatMoney(point.totalMinor, "INR", { short: true, zeroLabel: false })}`}
            className="group flex h-full flex-1 flex-col items-center justify-end gap-1.5 rounded focus-visible:outline-2"
          >
            <span className={cn("text-xs font-bold tabular-nums", active === index ? "text-ink-900" : "text-ink-600")}>
              {point.count}
            </span>
            <span
              aria-hidden
              className={cn("w-full max-w-9 rounded-t-md motion-safe:transition-[height] motion-safe:duration-500", active === index ? "bg-brand-600" : "bg-brand-200")}
              style={{ height: `${Math.max(point.count > 0 ? 6 : 2, (point.count / max) * 100)}%` }}
            />
            <span className={cn("text-xs", active === index ? "font-semibold text-ink-900" : "text-ink-600")}>
              {point.label}
            </span>
          </button>
        ))}
      </div>
      <table className="sr-only">
        <caption>Daily transaction volume</caption>
        <tbody>
          {data.map((point) => (
            <tr key={point.label}>
              <th scope="row">{point.label}</th>
              <td>{point.count}</td>
              <td>{point.totalMinor}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

function niceCeil(value: number): number {
  if (value <= 1) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalised = value / magnitude;
  const step = normalised <= 1 ? 1 : normalised <= 2 ? 2 : normalised <= 5 ? 5 : 10;
  return step * magnitude;
}
