"use client";

import { useId, useState } from "react";

import { cn } from "@/lib/utils";

import { HatchPattern } from "./hatch";
import { useWidth } from "./use-width";

export type PillBar = { label: string; value: number; state?: "past" | "today" | "future" };

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const SHORT = ["S", "M", "T", "W", "T", "F", "S"];
const TOP = 28; // room for the value pill above the tallest bar
const BOTTOM = 26; // room for the day label

/** "Tuesday" for a single-letter weekday label at its position; else the label. */
function longName(label: string, index: number, count: number) {
  return count === 7 && label === SHORT[index] ? WEEKDAYS[index] : label;
}

/**
 * Weekday pill bars: today is the filled tile colour, past days a pale tint,
 * future days (and empty ones) hatched. Every bar is focusable and named, and
 * a visually hidden table carries the same numbers.
 */
export function PillBars({
  data,
  unit = "",
  ariaLabel,
  height = 180,
  className,
}: {
  data: PillBar[];
  unit?: string;
  ariaLabel: string;
  height?: number;
  className?: string;
}) {
  const uid = useId();
  const hatch = `${uid}-hatch`;
  const [ref, width] = useWidth<HTMLDivElement>(320);
  const [hover, setHover] = useState<number | null>(null);
  const [focus, setFocus] = useState<number | null>(null);

  const count = Math.max(1, data.length);
  const slot = width / count;
  const barW = Math.max(10, Math.min(34, slot * 0.58));
  const plotH = Math.max(barW, height - TOP - BOTTOM);
  const max = Math.max(1, ...data.map((d) => (Number.isFinite(d.value) ? d.value : 0)));
  const shown = hover ?? focus;

  return (
    <div ref={ref} className={cn("w-full", className)}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        role="group"
        aria-label={ariaLabel}
        className="block max-w-full overflow-visible"
      >
        <defs>
          <HatchPattern id={hatch} />
        </defs>
        {data.map((d, i) => {
          const value = Number.isFinite(d.value) && d.value > 0 ? d.value : 0;
          const state = d.state ?? "past";
          const empty = value === 0 || state === "future";
          const h = Math.max(barW, (value / max) * plotH);
          const cx = slot * i + slot / 2;
          const x = cx - barW / 2;
          const y = TOP + plotH - h;
          const isToday = state === "today";
          const fill = empty ? `url(#${hatch})` : isToday ? "var(--admin-tile)" : "var(--admin-bar-tint)";
          const name = `${longName(d.label, i, data.length)}: ${value}${unit ? ` ${unit}` : ""}`;
          const label = String(value);
          const pillW = Math.max(26, label.length * 7 + 14);
          return (
            <g
              key={`${d.label}-${i}`}
              tabIndex={0}
              role="img"
              aria-label={name}
              className="cursor-default outline-none"
              onPointerEnter={() => setHover(i)}
              onPointerLeave={() => setHover(null)}
              onFocus={() => setFocus(i)}
              onBlur={() => setFocus(null)}
            >
              {/* Full-height hit area so thin bars are easy to hover. */}
              <rect x={cx - slot / 2} y={0} width={slot} height={height} fill="transparent" />
              {focus === i ? (
                <rect
                  x={x - 3}
                  y={y - 3}
                  width={barW + 6}
                  height={h + 6}
                  rx={(barW + 6) / 2}
                  fill="none"
                  stroke="var(--admin-tile)"
                  strokeWidth="2"
                />
              ) : null}
              <rect x={x} y={y} width={barW} height={h} rx={barW / 2} fill={fill} />
              {isToday || shown === i ? (
                <g aria-hidden pointerEvents="none">
                  <rect
                    x={cx - pillW / 2}
                    y={y - 24}
                    width={pillW}
                    height={20}
                    rx={10}
                    fill="var(--admin-pop)"
                  />
                  <text
                    x={cx}
                    y={y - 10}
                    textAnchor="middle"
                    fontSize="11"
                    fontWeight="600"
                    fill="var(--admin-pop-ink)"
                  >
                    {label}
                  </text>
                </g>
              ) : null}
              <text
                aria-hidden
                x={cx}
                y={height - 6}
                textAnchor="middle"
                fontSize="12"
                fontWeight={isToday ? 600 : 400}
                fill={isToday ? "var(--color-foreground)" : "var(--color-text-subtle)"}
              >
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>

      <table className="sr-only">
        <caption>{ariaLabel}</caption>
        <thead>
          <tr>
            <th scope="col">Day</th>
            <th scope="col">{unit ? unit.charAt(0).toUpperCase() + unit.slice(1) : "Value"}</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d, i) => (
            <tr key={`${d.label}-${i}`}>
              <th scope="row">{longName(d.label, i, data.length)}</th>
              <td>{d.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
