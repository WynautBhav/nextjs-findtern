import { cn } from "@/lib/utils";
import type { CoffeeKey, MarksKey } from "@/lib/college/overview-modes";
import { DrillLink, type DrillFilters } from "./drill";

/**
 * The shared kit for every Overview hero design. Designs sit on the green hero field, so colour is white at set
 * strengths plus one gold, the same as the campus walk: the strongest band (Latte, Top) or the winning outcome is
 * gold, everything else is a step of white. Every design takes its fills from here so the legends always agree.
 */

export const n = (v: number) => v.toLocaleString("en-IN");
export const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

export const GOLD = "var(--color-accent-400)";
export const GOLD_SOFT = "var(--color-accent-300)";
export const white = (a: number) => `rgb(255 255 255 / ${a})`;

/** Findtern bands: Espresso the quietest, Latte gold. */
export const COFFEE_FILL: Record<CoffeeKey, string> = { espresso: white(0.3), cappuccino: white(0.72), latte: GOLD };
/** Academic bands: four steps, Top gold. */
export const MARKS_FILL: Record<MarksKey, string> = { foundation: white(0.16), rising: white(0.38), strong: white(0.72), top: GOLD };
/** Offer outcomes: accepted is the win (gold); rejected, not answered and withdrawn step down in white. */
export const OUTCOME_FILL = { accepted: GOLD, notAnswered: white(0.72), rejected: white(0.38), withdrawn: white(0.16) } as const;

export function Swatch({ fill, className }: { fill: string; className?: string }) {
  return <span aria-hidden className={cn("inline-block size-2.5 shrink-0 rounded-full", className)} style={{ background: fill }} />;
}

/** A legend row under a design: each swatch is the fill its mark uses. */
/** A legend; an item with `drill` opens Master data for its students (the Overview pop-up). */
export function Legend({ items, className }: { items: { label: string; fill: string; value?: number; drill?: { title: string; filters: DrillFilters } }[]; className?: string }) {
  return (
    <ul className={cn("flex flex-wrap gap-x-5 gap-y-2 text-xs text-on-dark-subtle", className)}>
      {items.map((i) => {
        const body = (
          <>
            <Swatch fill={i.fill} />
            {i.label}
            {i.value !== undefined ? <span className="nums text-white">{n(i.value)}</span> : null}
          </>
        );
        return (
          <li key={i.label}>
            {i.drill ? (
              <DrillLink title={i.drill.title} filters={i.drill.filters} aria-label={`${i.label}${i.value !== undefined ? `: ${i.value}` : ""}. Open in Master data`} className="flex min-h-6 items-center gap-1.5 rounded-sm underline-offset-4 outline-none hover:text-white hover:underline focus-visible:ring-2 focus-visible:ring-white/80">
                {body}
              </DrillLink>
            ) : (
              <span className="flex items-center gap-1.5">{body}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** A figure on the field: quiet label over a light number, an optional note under it. */
export function Figure({ label, value, note, gold = false, size = "md" }: { label: string; value: React.ReactNode; note?: React.ReactNode; gold?: boolean; size?: "md" | "lg" }) {
  return (
    <div className="min-w-0">
      <p className="text-[13px] text-on-dark-subtle">{label}</p>
      <p className={cn("nums mt-1 font-light leading-none tracking-[-0.03em]", size === "lg" ? "text-[2.5rem]" : "text-[1.75rem]", gold ? "text-accent-300" : "text-white")}>{value}</p>
      {note ? <p className="nums mt-1.5 text-xs text-on-dark-subtle">{note}</p> : null}
    </div>
  );
}

/** Every design's root: one finding sentence on top, then the drawing. Keeps all twenty the same shape. */
export function DesignFrame({ finding, children, label }: { finding: React.ReactNode; children: React.ReactNode; label: string }) {
  return (
    <figure className="mt-6" aria-label={label}>
      <p className="max-w-2xl text-sm text-white">{finding}</p>
      <div className="mt-5">{children}</div>
    </figure>
  );
}
