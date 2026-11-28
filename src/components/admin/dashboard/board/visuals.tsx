"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { initials } from "@/lib/admin/dashboard-board-pure";
import { cn } from "@/lib/utils";

/**
 * The board's own visual pieces: real people as faces, a versus bar for every "X vs Y", a field of one dot per
 * person, and numbers that count up once when the board opens (never under reduced motion).
 */

const fmt = (n: number) => n.toLocaleString("en-IN");
const useIso = typeof window === "undefined" ? useEffect : useLayoutEffect;

function reduced() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Counts from 0 to `value` once on mount (ease-out), and straight to a new value after that. */
export function useCountUp(value: number, ms = 900) {
  const [shown, setShown] = useState(value);
  const first = useRef(true);
  useIso(() => {
    if (!first.current || reduced() || value === 0) {
      setShown(value);
      return;
    }
    first.current = false;
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      setShown(Math.round(value * (1 - Math.pow(2, -10 * p))));
      if (p < 1) raf = requestAnimationFrame(tick);
      else setShown(value);
    };
    setShown(0);
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return shown;
}

export function CountUp({ value, className }: { value: number; className?: string }) {
  return <span className={cn("tabular-nums", className)}>{fmt(useCountUp(value))}</span>;
}

/** A stable pale tint per person (identity, not data): the admin's six person tints. */
export function tintOf(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  const k = (h % 6) + 1;
  return { background: `var(--admin-person-${k})`, color: `var(--admin-person-ink-${k})` };
}

export { initials } from "@/lib/admin/dashboard-board-pure";

export type Face = { id: string; name: string };

/** Up to `max` faces overlapping, then "+N". The whole pile is one button that opens the list. */
export function FacePile({
  faces,
  total,
  max = 5,
  size = "md",
  onOpen,
  label,
  ring = "var(--admin-panel)",
}: {
  faces: Face[];
  total: number;
  max?: number;
  size?: "sm" | "md";
  onOpen?: () => void;
  label: string;
  ring?: string;
}) {
  if (total === 0) return null;
  const shown = faces.slice(0, max);
  const more = total - shown.length;
  const dim = size === "sm" ? "size-7 text-[0.625rem]" : "size-9 text-xs";
  const pile = (
      <span className="flex -space-x-1.5 transition-[margin] duration-300 group-hover:-space-x-0.5 motion-reduce:transition-none">
        {shown.map((f) => (
          <span
            key={f.id}
            title={f.name}
            className={cn("grid shrink-0 place-items-center rounded-full font-semibold", dim)}
            style={{ ...tintOf(f.id), boxShadow: `0 0 0 2px ${ring}` }}
          >
            {initials(f.name)}
          </span>
        ))}
        {more > 0 ? (
          <span className={cn("grid shrink-0 place-items-center rounded-full bg-ink-100 px-1.5 font-semibold text-ink-700", size === "sm" ? "h-7 min-w-7 text-[0.625rem]" : "h-9 min-w-9 text-xs")} style={{ boxShadow: `0 0 0 2px ${ring}` }}>
            +{fmt(more)}
          </span>
        ) : null}
      </span>
  );
  // Only a pile with somewhere to go is a button; otherwise it is a picture of the people.
  if (!onOpen) return <span role="img" aria-label={label} className="inline-flex items-center">{pile}</span>;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={label}
      className="group inline-flex items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      {pile}
    </button>
  );
}

/**
 * Two counts pulling against each other from a centre line: the good side grows left in green, the other right in
 * grey. Each side is a button that opens its list. Lengths are shares of the larger side, so a 35 vs 17 reads at once.
 */
export function Versus({
  title,
  left,
  right,
  note,
}: {
  title: string;
  left: { label: string; value: number; onOpen: () => void; color?: string };
  right: { label: string; value: number; onOpen: () => void; color?: string };
  note?: string;
}) {
  const max = Math.max(1, left.value, right.value);
  const total = left.value + right.value;
  const side = (s: typeof left, dir: "l" | "r") => (
    <button
      type="button"
      onClick={s.onOpen}
      aria-label={`${s.label}: ${fmt(s.value)}. Open the list`}
      className={cn("group flex min-w-0 flex-col gap-1.5 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-md", dir === "l" ? "items-end text-right" : "items-start text-left")}
    >
      <span className="flex items-baseline gap-1.5">
        {dir === "r" ? <CountUp value={s.value} className="text-xl font-semibold text-foreground" /> : null}
        <span className="text-xs text-text-subtle">{s.label}</span>
        {dir === "l" ? <CountUp value={s.value} className="text-xl font-semibold text-foreground" /> : null}
      </span>
      <span className={cn("flex h-3 w-full", dir === "l" ? "justify-end" : "justify-start")}>
        <span
          className={cn("h-full transition-[width] duration-700 ease-out group-hover:brightness-110 motion-reduce:transition-none", dir === "l" ? "rounded-l-full" : "rounded-r-full")}
          style={{ width: `${(s.value / max) * 100}%`, minWidth: s.value ? 6 : 0, background: s.color ?? (dir === "l" ? "var(--color-brand-700)" : "var(--color-ink-300)") }}
        />
      </span>
    </button>
  );
  return (
    <div className="min-w-0">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium text-foreground">{title}</span>
        <span className="text-xs tabular-nums text-text-subtle">{note ?? `${fmt(total)} in all`}</span>
      </div>
      <div className="grid grid-cols-[1fr_2px_1fr] items-end gap-2">
        {side(left, "l")}
        <span aria-hidden className="h-8 rounded-full bg-ink-200" />
        {side(right, "r")}
      </div>
    </div>
  );
}

export type Part = { key: string; label: string; value: number; color: string; onOpen: () => void };

/**
 * A whole and its parts: the total (opens everyone), one stacked bar where every part is its share, and a legend of
 * buttons with each count and share. Parts must add up to the total; a part with nothing in it stays in the legend at 0.
 */
export function Breakdown({ title, total, onOpenTotal, parts }: { title: string; total: number; onOpenTotal: () => void; parts: Part[] }) {
  const sum = parts.reduce((s, p) => s + p.value, 0) || 1;
  return (
    <div className="min-w-0">
      <div className="mb-2.5 flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium text-foreground">{title}</span>
        <button
          type="button"
          onClick={onOpenTotal}
          aria-label={`${title}: ${fmt(total)} in total. Open the list`}
          className="inline-flex items-baseline gap-1.5 rounded-md text-xs text-text-subtle outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          Total
          <CountUp value={total} className="text-xl font-semibold text-foreground" />
        </button>
      </div>
      <div role="img" aria-label={`${title}: ${parts.map((p) => `${p.label} ${p.value}`).join(", ")}`} className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full bg-ink-100">
        {total
          ? parts.map((p) =>
              p.value ? (
                <span
                  key={p.key}
                  className="h-full transition-[width] duration-700 ease-out first:rounded-l-full last:rounded-r-full motion-reduce:transition-none"
                  style={{ width: `${(p.value / sum) * 100}%`, minWidth: 6, background: p.color }}
                />
              ) : null,
            )
          : null}
      </div>
      <ul className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5">
        {parts.map((p) => (
          <li key={p.key}>
            <button
              type="button"
              onClick={p.onOpen}
              className="inline-flex items-center gap-1.5 rounded text-sm text-foreground underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring touch:min-h-11"
            >
              <span className="size-2.5 rounded-full" style={{ background: p.color }} aria-hidden />
              {p.label}
              <span className="font-semibold tabular-nums">{fmt(p.value)}</span>
              {total ? <span className="text-xs tabular-nums text-text-subtle">{Math.round((p.value / total) * 100)}%</span> : null}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export type DotGroup = { key: string; label: string; ids: string[]; color: string; onOpen: () => void };

/**
 * One dot per person, grouped by colour in reading order, so "25 of 500 hidden" is seen, not read. Each legend entry
 * opens its list. Dots settle in once, column by column, unless motion is reduced.
 */
export function DotField({ groups, label }: { groups: DotGroup[]; label: string }) {
  const total = groups.reduce((s, g) => s + g.ids.length, 0);
  const dense = total > 640;
  return (
    <div className="min-w-0">
      <div role="img" aria-label={`${label}: ${groups.map((g) => `${g.label} ${g.ids.length}`).join(", ")}`} className={cn("flex flex-wrap", dense ? "gap-[3px]" : "gap-1")}>
        {groups.flatMap((g, gi) =>
          g.ids.map((id, i) => (
            <span
              key={g.key + id}
              className={cn("board-dot rounded-full", dense ? "size-[7px]" : "size-2.5")}
              style={{ background: g.color, animationDelay: `${Math.min(900, (gi * 60 + i) * 3)}ms` }}
            />
          )),
        )}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
        {groups.map((g) => (
          <li key={g.key}>
            <button
              type="button"
              onClick={g.onOpen}
              className="inline-flex items-center gap-1.5 rounded text-sm text-foreground underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <span className="size-2.5 rounded-full" style={{ background: g.color }} aria-hidden />
              {g.label}
              <span className="font-semibold tabular-nums">{fmt(g.ids.length)}</span>
              {total ? <span className="text-xs tabular-nums text-text-subtle">{Math.round((g.ids.length / total) * 100)}%</span> : null}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The board's keyframes, once: people flowing along the line, dots settling in. All off under reduced motion. */
export function BoardMotion() {
  return (
    <style>{`
@keyframes board-flow-x { from { left: 0%; opacity: 0 } 12% { opacity: 1 } 88% { opacity: 1 } to { left: 100%; opacity: 0 } }
@keyframes board-flow-y { from { top: 0%; opacity: 0 } 12% { opacity: 1 } 88% { opacity: 1 } to { top: 100%; opacity: 0 } }
@keyframes board-dot-in { from { transform: scale(0); opacity: 0 } to { transform: scale(1); opacity: 1 } }
.board-dot { animation: board-dot-in 420ms cubic-bezier(.16,1,.3,1) both }
@media (prefers-reduced-motion: reduce) { .board-dot, .board-flow { animation: none !important } .board-flow { display: none } }
`}</style>
  );
}
