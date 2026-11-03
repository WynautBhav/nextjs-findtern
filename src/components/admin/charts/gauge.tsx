import { useId } from "react";

import { arcPath, gaugeArcs, safeValue, segmentFractions } from "@/lib/admin/chart-geometry";
import { cn } from "@/lib/utils";

import { HatchPattern } from "./hatch";

export type GaugeSegment = { label: string; value: number; tone: "done" | "progress" | "pending" };

const R = 100; // centre-line radius
const STROKE = R * 0.26;
const CX = R + STROKE / 2 + 4;
const CY = R + STROKE / 2 + 4;
const W = CX * 2;
const H = CY + STROKE / 2 + 4;
// Trim this much (as an arc fraction) from edges that touch a neighbour so
// round caps leave a visible gap instead of fusing.
const PAD = (STROKE / 2 + 2.5) / (Math.PI * R);

/**
 * Half-donut of 2-4 segments. done = filled tile colour, progress = the deep
 * brand step (dark on light, pale on dark), pending = hatched. All-zero data
 * draws an empty hatched track. The legend below carries every value.
 */
export function Gauge({
  segments,
  centerValue,
  centerLabel,
  ariaLabel,
  className,
}: {
  segments: GaugeSegment[];
  centerValue: string;
  centerLabel: string;
  ariaLabel: string;
  className?: string;
}) {
  const hatch = `${useId()}-hatch`;
  const fill = (tone: GaugeSegment["tone"]) =>
    tone === "done" ? "var(--admin-tile)" : tone === "progress" ? "var(--admin-bar-tint)" : `url(#${hatch})`;

  const fractions = segmentFractions(segments.map((s) => s.value));
  const empty = fractions.every((f) => f === 0);
  const arcs = gaugeArcs(fractions, PAD);

  return (
    <figure className={cn("mx-auto w-full max-w-[22rem]", className)}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`${ariaLabel}: ${centerValue} ${centerLabel}`}
        className="block h-auto w-full"
      >
        <defs>
          <HatchPattern id={hatch} />
        </defs>
        {empty ? (
          <path
            d={arcPath(CX, CY, R, 0, 1)}
            fill="none"
            stroke={`url(#${hatch})`}
            strokeWidth={STROKE}
            strokeLinecap="round"
          />
        ) : (
          segments.map((s, i) => {
            const arc = arcs[i];
            if (!arc) return null;
            return (
              <path
                key={`${s.label}-${i}`}
                d={arcPath(CX, CY, R, arc.start, arc.end)}
                fill="none"
                stroke={fill(s.tone)}
                strokeWidth={STROKE}
                strokeLinecap="round"
              />
            );
          })
        )}
        <text
          x={CX}
          y={CY - 22}
          textAnchor="middle"
          fontSize="38"
          fontWeight="600"
          fill="var(--color-foreground)"
        >
          {centerValue}
        </text>
        <text x={CX} y={CY - 2} textAnchor="middle" fontSize="13" fill="var(--color-text-subtle)">
          {centerLabel}
        </text>
      </svg>

      <figcaption>
        <ul className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1.5">
          {segments.map((s, i) => (
            <li
              key={`${s.label}-${i}`}
              className="flex items-center gap-1.5 text-xs text-muted-foreground"
            >
              <svg aria-hidden viewBox="0 0 20 10" className="h-2.5 w-5 shrink-0">
                <rect width="20" height="10" rx="5" fill={fill(s.tone)} />
              </svg>
              <span>{s.label}</span>
              <span className="font-semibold text-foreground tabular-nums">{safeValue(s.value)}</span>
            </li>
          ))}
        </ul>
      </figcaption>
    </figure>
  );
}
