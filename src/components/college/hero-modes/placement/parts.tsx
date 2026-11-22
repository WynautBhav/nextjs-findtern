import type { PlacementData } from "@/lib/college/overview-modes";
import { cn } from "@/lib/utils";
import { COFFEE_FILL, GOLD, Legend, MARKS_FILL, n, OUTCOME_FILL, pct, white } from "../kit";

/** Dark ink for text that sits on a light or gold fill (the hero field colour). */
export const INK = "var(--color-brand-950)";
/** Text colour that reads on a given outcome / band fill. */
export const onFill = (fill: string) => (fill === GOLD || fill === white(0.72) ? INK : "white");
/** Gold at a set strength, for the quieter win (hired, not yet PPO). Same hue as GOLD, never a new colour. */
export const goldA = (a: number) => `color-mix(in srgb, var(--color-accent-400) ${Math.round(a * 100)}%, transparent)`;

export const OUTCOMES = (o: PlacementData["offers"]) =>
  [
    { key: "accepted", label: "Accepted", v: o.accepted },
    { key: "notAnswered", label: "Not answered", v: o.notAnswered },
    { key: "rejected", label: "Rejected", v: o.rejected },
    { key: "withdrawn", label: "Withdrawn by employer", v: o.withdrawn },
  ] as const;

/** Offers stacked in one bar with 2px seams; the legend carries the numbers. */
export function OutcomeBar({ data, className }: { data: PlacementData; className?: string }) {
  const o = data.offers;
  const parts = OUTCOMES(o);
  return (
    <div className={className}>
      <div className="flex h-3 gap-0.5 overflow-hidden" role="img" aria-label={`${n(o.received)} offers: ${parts.map((p) => `${p.label} ${p.v}`).join(", ")}`}>
        {parts.map((p) => (p.v ? <span key={p.key} style={{ flexGrow: p.v, flexBasis: 0, background: OUTCOME_FILL[p.key] }} /> : null))}
      </div>
      <Legend className="mt-2.5" items={parts.map((p) => ({ label: p.label, fill: OUTCOME_FILL[p.key], value: p.v }))} />
    </div>
  );
}

/** CGPA / % bands of the interviewed students as one stacked bar, legend with counts. */
export function MarksBar({ data, className }: { data: PlacementData; className?: string }) {
  return (
    <div className={className}>
      <div className="flex h-2.5 gap-0.5 overflow-hidden" role="img" aria-label={`Students by CGPA or percentage band: ${data.marks.map((m) => `${m.name} ${m.students}`).join(", ")}`}>
        {data.marks.map((m) => (m.students ? <span key={m.key} style={{ flexGrow: m.students, flexBasis: 0, background: MARKS_FILL[m.key] }} /> : null))}
      </div>
      <Legend className="mt-2.5" items={data.marks.map((m) => ({ label: `${m.name} ${m.range}`, fill: MARKS_FILL[m.key], value: m.students }))} />
    </div>
  );
}

/** Findtern bands of the interviewed students as one stacked bar, legend with counts. */
export function BandBar({ data, className }: { data: PlacementData; className?: string }) {
  return (
    <div className={className}>
      <div className="flex h-2.5 gap-0.5 overflow-hidden" role="img" aria-label={`Students by Findtern band: ${data.coffee.map((b) => `${b.name} ${b.students}`).join(", ")}`}>
        {data.coffee.map((b) => (b.students ? <span key={b.key} style={{ flexGrow: b.students, flexBasis: 0, background: COFFEE_FILL[b.key] }} /> : null))}
      </div>
      <Legend className="mt-2.5" items={data.coffee.map((b) => ({ label: `${b.name} ${b.range}`, fill: COFFEE_FILL[b.key], value: b.students }))} />
    </div>
  );
}

/** A figure whose label never wraps: the average scores sit in tight rows. */
function Fig({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[13px] text-on-dark-subtle">{label}</p>
      <p className="nums mt-1 text-[1.75rem] font-light leading-none tracking-[-0.03em] text-white">{value}</p>
    </div>
  );
}

const dash = (v: number | null) => (v === null ? "-" : v.toFixed(1));

/** Scores: average CGPA / %, average Findtern score, and the CGPA / % bands. */
export function Scores({ data, className }: { data: PlacementData; className?: string }) {
  return (
    <div className={cn("grid grid-cols-2 items-end gap-x-8 gap-y-4 sm:grid-cols-[auto_auto_1fr]", className)}>
      <Fig label="Avg CGPA / % out of 10" value={dash(data.avgMarks)} />
      <Fig label="Avg Findtern score" value={dash(data.avgScore)} />
      <MarksBar data={data} className="col-span-2 min-w-0 sm:col-span-1 sm:min-w-[16rem]" />
    </div>
  );
}

/** A small named figure used inside the designs. */
export function Num({ label, value, gold = false, className }: { label: string; value: number | string; gold?: boolean; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <p className="text-xs text-on-dark-subtle">{label}</p>
      <p className={cn("nums mt-0.5 text-[1.5rem] font-light leading-none tracking-[-0.02em]", gold ? "text-accent-300" : "text-white")}>{typeof value === "number" ? n(value) : value}</p>
    </div>
  );
}

export { pct };
