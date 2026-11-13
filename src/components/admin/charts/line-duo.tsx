"use client";

import { useState, type KeyboardEvent, type PointerEvent } from "react";

import { EmptyScene } from "@/components/app/primitives";
import { monotonePath, nearestIndex, niceTicks, thinLabelIndices } from "@/lib/admin/chart-geometry";
import { cn } from "@/lib/utils";

import { useWidth } from "./use-width";

export type LineDuoSeries = {
  label: string;
  tone: "current" | "previous";
  points: { x: string; y: number }[];
};

const STROKE = {
  current: { color: "var(--admin-tile)", width: 2.5, dash: undefined as string | undefined },
  // Amber, dashed: readable in greyscale too, and flips with the admin theme.
  previous: { color: "var(--color-accent-700)", width: 2, dash: "5 4" },
};
const PAD = { top: 12, right: 14, bottom: 26, left: 38 };

/**
 * Two smooth series (this period vs the one before) on shared x labels.
 * Hover, touch or arrow keys snap a crosshair to the nearest x and show both
 * values. The x labels come from the longest series.
 */
export function LineDuo({
  series,
  format = (n) => String(n),
  ariaLabel,
  height = 220,
  className,
}: {
  series: LineDuoSeries[];
  format?: (n: number) => string;
  ariaLabel: string;
  height?: number;
  className?: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>(560);
  const [active, setActive] = useState<number | null>(null);

  const labels = series.reduce<string[]>(
    (best, s) => (s.points.length > best.length ? s.points.map((p) => p.x) : best),
    [],
  );
  const n = labels.length;
  const finite = (v: number) => (Number.isFinite(v) ? v : 0);
  const rawMax = Math.max(0, ...series.flatMap((s) => s.points.map((p) => finite(p.y))));
  const ticks = niceTicks(rawMax, 4);
  const top = ticks[ticks.length - 1];

  const plotW = Math.max(1, width - PAD.left - PAD.right);
  const plotH = Math.max(1, height - PAD.top - PAD.bottom);
  const xAt = (i: number) => PAD.left + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const yAt = (v: number) => PAD.top + plotH - (finite(v) / top) * plotH;

  if (n === 0) {
    return <EmptyScene compact title="No data for this period" body="Nothing was recorded between these dates. Choose a wider range to see more." />;
  }

  const labelPx = Math.max(...labels.map((l) => l.length)) * 6.5 + 14;
  const shownLabels = new Set(thinLabelIndices(n, n <= 1 ? plotW : plotW / (n - 1), labelPx));
  const xs = labels.map((_, i) => xAt(i));

  const move = (e: PointerEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    setActive(nearestIndex(xs, ((e.clientX - box.left) / box.width) * width));
  };
  const key = (e: KeyboardEvent<HTMLDivElement>) => {
    const at = active ?? n - 1;
    const next =
      e.key === "ArrowRight" ? Math.min(n - 1, at + 1)
      : e.key === "ArrowLeft" ? Math.max(0, at - 1)
      : e.key === "Home" ? 0
      : e.key === "End" ? n - 1
      : e.key === "Escape" ? null
      : undefined;
    if (next === undefined) return;
    e.preventDefault();
    setActive(next);
  };

  const readout =
    active === null
      ? ""
      : `${labels[active]}: ${series.map((s) => `${s.label} ${s.points[active] ? format(s.points[active].y) : "no data"}`).join(", ")}`;

  return (
    <figure className={cn("w-full", className)}>
      <figcaption className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1">
        {series.map((s) => (
          <span key={s.label} className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <svg aria-hidden viewBox="0 0 24 8" className="h-2 w-6 shrink-0">
              <line
                x1="2" y1="4" x2="22" y2="4"
                stroke={STROKE[s.tone].color}
                strokeWidth={STROKE[s.tone].width}
                strokeLinecap="round"
                {...(STROKE[s.tone].dash ? { strokeDasharray: STROKE[s.tone].dash } : {})}
              />
            </svg>
            {s.label}
          </span>
        ))}
      </figcaption>

      <div
        ref={ref}
        tabIndex={0}
        role="group"
        aria-label={`${ariaLabel}. Use the left and right arrow keys to read values.`}
        className="relative touch-pan-y rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-tile)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--admin-panel)]"
        style={{ height }}
        onPointerMove={move}
        onPointerDown={move}
        onPointerLeave={(e) => e.pointerType === "mouse" && setActive(null)}
        onFocus={(e) => e.currentTarget === e.target && setActive((a) => a ?? n - 1)}
        onBlur={() => setActive(null)}
        onKeyDown={key}
      >
        <svg aria-hidden viewBox={`0 0 ${width} ${height}`} width={width} height={height} className="block max-w-full">
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={PAD.left} x2={width - PAD.right} y1={yAt(t)} y2={yAt(t)}
                stroke="var(--admin-rule)" strokeWidth="1"
              />
              <text x={PAD.left - 8} y={yAt(t) + 4} textAnchor="end" fontSize="11" fill="var(--color-text-subtle)">
                {format(t)}
              </text>
            </g>
          ))}
          {labels.map((l, i) =>
            shownLabels.has(i) ? (
              <text
                key={`${l}-${i}`}
                x={xAt(i)} y={height - 7}
                textAnchor={n > 1 && i === 0 ? "start" : n > 1 && i === n - 1 ? "end" : "middle"}
                fontSize="11"
                fill={active === i ? "var(--color-foreground)" : "var(--color-text-subtle)"}
              >
                {l}
              </text>
            ) : null,
          )}
          {active !== null ? (
            <line
              x1={xAt(active)} x2={xAt(active)} y1={PAD.top} y2={PAD.top + plotH}
              stroke="var(--admin-hatch)" strokeWidth="1" strokeDasharray="3 3"
            />
          ) : null}
          {[...series].sort((a, b) => (a.tone === "previous" ? -1 : 1) - (b.tone === "previous" ? -1 : 1)).map((s) => {
            const st = STROKE[s.tone];
            const pts = s.points.map((p, i) => ({ x: xAt(i), y: yAt(p.y) }));
            return (
              <g key={s.label}>
                <path
                  d={monotonePath(pts)}
                  fill="none"
                  stroke={st.color}
                  strokeWidth={st.width}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  {...(st.dash ? { strokeDasharray: st.dash } : {})}
                />
                {active !== null && pts[active] ? (
                  <circle
                    cx={pts[active].x} cy={pts[active].y} r="4.5"
                    fill={st.color} stroke="var(--admin-panel)" strokeWidth="2"
                  />
                ) : null}
              </g>
            );
          })}
        </svg>

        {active !== null ? (
          <div
            aria-hidden
            className="pointer-events-none absolute z-10 w-max min-w-28 rounded-lg px-2.5 py-2 text-xs"
            style={{
              top: PAD.top + plotH / 2,
              left: xAt(active),
              transform: `translate(${xAt(active) > width * 0.6 ? "calc(-100% - 12px)" : "12px"}, -50%)`,
              background: "var(--admin-pop)",
              color: "var(--admin-pop-ink)",
            }}
          >
            <p className="font-semibold">{labels[active]}</p>
            <dl className="mt-1 flex flex-col gap-0.5">
              {series.map((s) => (
                <div key={s.label} className="flex items-center justify-between gap-3">
                  <dt className="flex items-center gap-1.5 opacity-80">
                    <span aria-hidden className="size-2 rounded-full" style={{ background: STROKE[s.tone].color }} />
                    {s.label}
                  </dt>
                  <dd className="font-semibold tabular-nums">
                    {s.points[active] ? format(s.points[active].y) : "-"}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ) : null}
      </div>

      <p className="sr-only" role="status" aria-live="polite">
        {readout}
      </p>

      <table className="sr-only">
        <caption>{ariaLabel}</caption>
        <thead>
          <tr>
            <th scope="col">Period</th>
            {series.map((s) => (
              <th key={s.label} scope="col">{s.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {labels.map((l, i) => (
            <tr key={`${l}-${i}`}>
              <th scope="row">{l}</th>
              {series.map((s) => (
                <td key={s.label}>{s.points[i] ? format(s.points[i].y) : "-"}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
